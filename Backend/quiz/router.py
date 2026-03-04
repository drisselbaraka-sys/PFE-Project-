from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import asyncio
import os
import requests

from database.database import get_db
from database import models
from database.config import settings
from auth.utils import get_current_user
from . import schemas
from .ai_service import AIService
from services.document_service import DocumentService

router = APIRouter(
    prefix="/quiz",
    tags=["quiz"]
)

@router.post("/manual", response_model=schemas.QuizResponse)
def create_quiz_manual(
    quiz_data: schemas.QuizCreate,
    db: Session = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user)
):
    # Determine type: use the one embedded in parametres_generation if present, else 'manual'
    type_creation = 'manual'
    if quiz_data.parametres_generation:
        type_from_params = quiz_data.parametres_generation.get('type_creation', '').lower()
        if type_from_params in ('ai', 'manual'):
            type_creation = type_from_params

    # 1. Create Quiz record
    new_quiz = models.Quiz(
        **quiz_data.dict(exclude={'questions', 'type_creation'}),
        id_utilisateur=current_user.id_utilisateur,
        type_creation=type_creation
    )
    db.add(new_quiz)
    db.flush()

    # 2. Create Questions
    for i, q_data in enumerate(quiz_data.questions):
        new_q = models.Question(
            **q_data.dict(),
            id_quiz=new_quiz.id_quiz,
            ordre_dans_quiz=i
        )
        db.add(new_q)
    
    db.commit()
    db.refresh(new_quiz)
    return new_quiz


@router.put("/{quiz_id}", response_model=schemas.QuizResponse)
def update_quiz(
    quiz_id: str,
    quiz_data: schemas.QuizCreate,
    db: Session = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user)
):
    # 1. Verify existence and ownership
    quiz = db.query(models.Quiz).filter(
        models.Quiz.id_quiz == quiz_id,
        models.Quiz.id_utilisateur == current_user.id_utilisateur
    ).first()
    
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz non trouvé ou accès refusé.")

    # 2. Update Quiz metadata
    # Ensure type_creation is handled: favor explicit payload if it matches 'ai'/'manual'
    type_creation = quiz.type_creation
    if quiz_data.type_creation in ('ai', 'manual'):
        type_creation = quiz_data.type_creation
    elif quiz_data.parametres_generation:
        type_from_params = quiz_data.parametres_generation.get('type_creation', '').lower()
        if type_from_params in ('ai', 'manual'):
            type_creation = type_from_params

    update_data = quiz_data.dict(exclude={'questions', 'type_creation'})
    for key, value in update_data.items():
        setattr(quiz, key, value)
    
    quiz.type_creation = type_creation
    
    # 3. Handle Questions: Delete old ones and insert new ones (simpler than syncing)
    db.query(models.Question).filter(models.Question.id_quiz == quiz_id).delete()
    
    for i, q_data in enumerate(quiz_data.questions):
        new_q = models.Question(
            **q_data.dict(),
            id_quiz=quiz_id,
            ordre_dans_quiz=i
        )
        db.add(new_q)
    
    db.commit()
    db.refresh(quiz)
    return quiz


@router.post("/upload-thumbnail")
async def upload_thumbnail(
    file: UploadFile = File(...),
    current_user: models.Utilisateur = Depends(get_current_user)
):
    """Upload a quiz thumbnail image and return its URL."""
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Format de fichier non supporté.")

    thumbnails_dir = os.path.join("uploads", "thumbnails")
    os.makedirs(thumbnails_dir, exist_ok=True)

    import uuid as _uuid
    filename = f"thumb_{_uuid.uuid4().hex}{ext}"
    filepath = os.path.join(thumbnails_dir, filename)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    url = f"http://localhost:8001/uploads/thumbnails/{filename}"
    return {"image_couverture_url": url}

@router.post("/generate/ai", response_model=schemas.AIDraftResponse)
async def generate_quiz_ai(
    files: Optional[List[UploadFile]] = File(None),
    settings_json: str = Form(...),
    current_user: models.Utilisateur = Depends(get_current_user)
):
    """
    Generates a quiz using AI.
    Accepts files and settings as a JSON string (Multipart form).
    """
    try:
        settings = json.loads(settings_json)
        context = settings.get("prompt", "")

        # 1. Handle Document Extraction if files were provided
        saved_documents = []
        if files:
            if len(files) > 5:
                raise HTTPException(status_code=400, detail="Maximum 5 fichiers autorisés.")
            
            docs_dir = os.path.join("uploads", "documents")
            os.makedirs(docs_dir, exist_ok=True)
            import uuid as _uuid

            file_data = []
            for file in files:
                content = await file.read()
                file_data.append((file.filename, content))

                # Save the file permanently for editing
                ext = os.path.splitext(file.filename)[1].lower()
                safe_filename = f"doc_{_uuid.uuid4().hex}{ext}"
                filepath = os.path.join(docs_dir, safe_filename)
                with open(filepath, "wb") as f:
                    f.write(content)
                
                # We assume the frontend and backend run on same host, or backend URL is known
                # In production, this should be configurable
                file_url = f"http://localhost:8001/uploads/documents/{safe_filename}"
                saved_documents.append({
                    "name": file.filename,
                    "url": file_url
                })
            
            extracted_text = DocumentService.process_files(file_data)
            context = extracted_text + "\n\n" + context

        if not context.strip():
            raise HTTPException(status_code=400, detail="Veuillez fournir un texte ou un document.")

        # 2. Call AI Service (Qwen 72B - Cloud API)
        try:
            # Augmenter le timeout pour les appels réseau si nécessaire
            questions_data = await asyncio.wait_for(
                asyncio.to_thread(AIService.generate_questions, context, settings),
                timeout=180.0  # 3 minutes timeout pour Qwen 72B
            )
        except asyncio.TimeoutError:
            print(f" [Quiz] Timeout Qwen après 180 secondes")
            raise HTTPException(status_code=504, detail="La génération Qwen a pris trop de temps. Veuillez réessayer.")
        except Exception as ai_err:
            raise HTTPException(status_code=500, detail=f"Erreur lors de la génération Qwen: {str(ai_err)}")

        if not questions_data:
            raise HTTPException(status_code=500, detail="L'IA n'a pas pu générer de questions.")

        # 3. Return as a draft (No DB save yet)
        # Extract title/description from Qwen metadata if available
        qwen_meta = settings.get('_generated_metadata', {})
        suggested_title = qwen_meta.get("titre") or f"Quiz - {settings.get('prompt', 'Document')[:30]}"
        suggested_desc = qwen_meta.get("description") or "Généré par IA Qwen 2.5 72B"

        return {
            "questions": questions_data,
            "metadata": {
                "titre": suggested_title,
                "description": suggested_desc,
                "saved_documents": saved_documents
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f" [Quiz] Erreur générale dans generate_quiz_ai: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")





@router.get("/me", response_model=List[schemas.QuizSummary])
def get_user_quizzes(
    db: Session = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user)
):
    """Returns all quizzes created by the current user, enriched with question count and favorite status."""
    quizzes = db.query(models.Quiz).filter(
        models.Quiz.id_utilisateur == current_user.id_utilisateur
    ).order_by(models.Quiz.date_creation.desc()).all()

    liked_ids = {q.id_quiz for q in current_user.quizzes_aimes}

    result = []
    for quiz in quizzes:
        result.append(schemas.QuizSummary(
            id_quiz=quiz.id_quiz,
            id_utilisateur=quiz.id_utilisateur,
            titre=quiz.titre,
            description=quiz.description,
            difficulte_moyenne=quiz.difficulte_moyenne,
            duree_max_minutes=quiz.duree_max_minutes,
            visibilite=quiz.visibilite,
            est_corrige_auto=quiz.est_corrige_auto,
            tags=quiz.tags if quiz.tags is not None else [],
            image_couverture_url=quiz.image_couverture_url,
            type_creation=quiz.type_creation,
            date_creation=quiz.date_creation,
            nombre_questions=len(quiz.questions),
            is_favorited=quiz.id_quiz in liked_ids,
        ))
    return result


@router.get("/{quiz_id}", response_model=schemas.QuizResponse)
def get_quiz(
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user)
):
    """Retrieve full details of a specific quiz."""
    quiz = db.query(models.Quiz).filter(
        models.Quiz.id_quiz == quiz_id,
        models.Quiz.id_utilisateur == current_user.id_utilisateur
    ).first()
    
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz introuvable ou accès refusé.")
    return quiz


@router.post("/{quiz_id}/favorite")
def toggle_favorite(
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user)
):
    """Toggle the favorite (like) status of a quiz for the current user."""
    quiz = db.query(models.Quiz).filter(models.Quiz.id_quiz == quiz_id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz introuvable.")

    liked_ids = {q.id_quiz for q in current_user.quizzes_aimes}
    if quiz_id in liked_ids:
        current_user.quizzes_aimes.remove(quiz)
        db.commit()
        return {"is_favorited": False}
    else:
        current_user.quizzes_aimes.append(quiz)
        db.commit()
        return {"is_favorited": True}


@router.delete("/{quiz_id}")
def delete_quiz(
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user)
):
    """Delete a quiz owned by the current user."""
    quiz = db.query(models.Quiz).filter(
        models.Quiz.id_quiz == quiz_id,
        models.Quiz.id_utilisateur == current_user.id_utilisateur
    ).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz introuvable ou non autorisé.")
    db.delete(quiz)
    db.commit()
    return {"detail": "Quiz supprimé avec succès."}

