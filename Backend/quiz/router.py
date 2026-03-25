from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import asyncio
import os

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
    type_creation = 'manual'
    if quiz_data.parametres_generation:
        type_from_params = quiz_data.parametres_generation.get('type_creation', '').lower()
        if type_from_params in ('ai', 'manual'):
            type_creation = type_from_params

    new_quiz = models.Quiz(
        **quiz_data.dict(exclude={'questions', 'type_creation'}),
        id_utilisateur=current_user.id_utilisateur,
        type_creation=type_creation
    )
    db.add(new_quiz)
    db.flush()

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
    quiz = db.query(models.Quiz).filter(
        models.Quiz.id_quiz == quiz_id,
        models.Quiz.id_utilisateur == current_user.id_utilisateur
    ).first()

    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz non trouvé ou accès refusé.")

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


@router.delete("/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_quiz(
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user)
):
    quiz = db.query(models.Quiz).filter(
        models.Quiz.id_quiz == quiz_id,
        models.Quiz.id_utilisateur == current_user.id_utilisateur
    ).first()

    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz non trouvé ou accès refusé.")

    db.query(models.Question).filter(models.Question.id_quiz == quiz_id).delete()
    db.delete(quiz)
    db.commit()
    return None


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
    db: Session = Depends(get_db),
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
                if len(content) > 20 * 1024 * 1024:
                    raise HTTPException(
                        status_code=413,
                        detail=f"Le fichier {file.filename} dépasse la limite de 20 Mo."
                    )

                file_data.append((file.filename, content))

                ext = os.path.splitext(file.filename)[1].lower()
                safe_filename = f"doc_{_uuid.uuid4().hex}{ext}"
                filepath = os.path.join(docs_dir, safe_filename)
                with open(filepath, "wb") as f:
                    f.write(content)

                file_url = f"http://localhost:8001/uploads/documents/{safe_filename}"
                
                # Create a database record for the document
                new_doc = models.Document(
                    nom_fichier=file.filename,
                    chemin_stockage=filepath,
                    type_fichier=ext.replace('.', '') if ext else 'bin',
                    taille_fichier=len(content),
                    id_utilisateur=current_user.id_utilisateur
                )
                db.add(new_doc)
                db.flush() # Get id_document

                saved_documents.append({
                    "id": new_doc.id_document,
                    "name": file.filename,
                    "url": file_url
                })

            # DocumentService now handles OCR automatically for scanned PDFs
            # — do NOT block here if extraction returns empty, OCR may have run
            extracted_text = DocumentService.process_files(file_data)
            context = extracted_text + "\n\n" + context

            # Only block if BOTH extracted text AND prompt are empty
            if not context.strip():
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Aucun texte exploitable n'a été extrait et aucun prompt fourni. "
                        "Essayez un PDF avec texte sélectionnable, DOCX/TXT, "
                        "ou ajoutez un prompt texte décrivant le sujet."
                    )
                )

        if not context.strip():
            raise HTTPException(status_code=400, detail="Veuillez fournir un texte ou un document.")

        # 2. Call AI Service
        try:
            requested_questions = max(1, min(int(settings.get("num_questions", 10)), 30))
            file_count = len(files or [])

            subject = settings.get("titre") or settings.get("prompt", "Document")
            print(f"\n--- [Quiz Request] ---")
            print(f" Sujet     : {subject[:100]}")
            print(f" Questions : {requested_questions}")
            print(f" Documents : {file_count}")
            print(f" Contexte  : {len(context)} chars")
            print(f"----------------------\n")

            questions_data = await asyncio.to_thread(AIService.generate_questions, context, settings)

        except Exception as ai_err:
            raise HTTPException(status_code=500, detail=f"Erreur lors de la génération: {str(ai_err)}")

        if not questions_data:
            raise HTTPException(status_code=500, detail="L'IA n'a pas pu générer de questions.")

        # 3. Return as draft (no Quiz DB save yet, but Documents are already in DB)
        qwen_meta = settings.get('_generated_metadata', {})
        suggested_title = qwen_meta.get("titre") or f"Quiz - {settings.get('prompt', 'Document')[:30]}"
        suggested_desc  = qwen_meta.get("description") or "Généré par IA"
        
        # Link the first document as main source if available
        main_doc_id = saved_documents[0]["id"] if saved_documents else None

        return {
            "questions": questions_data,
            "metadata": {
                "titre":           suggested_title,
                "description":     suggested_desc,
                "saved_documents": saved_documents,
                "id_document":     main_doc_id
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[Quiz] Erreur générale dans generate_quiz_ai: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur serveur: {str(e)}")


@router.get("/me", response_model=List[schemas.QuizSummary])
def get_user_quizzes(
    db: Session = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user)
):
    """Returns all quizzes created by the current user."""
    quizzes = db.query(models.Quiz).filter(
        models.Quiz.id_utilisateur == current_user.id_utilisateur
    ).order_by(models.Quiz.date_creation.desc()).all()

    liked_ids = {q.id_quiz for q in current_user.quizzes_aimes}

    result = []
    for quiz in quizzes:
        _peut_clone = getattr(quiz, 'peut_etre_clone', None)
        if _peut_clone is None:
            _peut_clone = True
        result.append(schemas.QuizSummary(
            id_quiz=quiz.id_quiz,
            id_utilisateur=quiz.id_utilisateur,
            titre=quiz.titre,
            description=quiz.description,
            difficulte_moyenne=quiz.difficulte_moyenne,
            duree_max_minutes=quiz.duree_max_minutes,
            visibilite=quiz.visibilite,
            peut_etre_clone=_peut_clone,
            est_corrige_auto=quiz.est_corrige_auto,
            tags=quiz.tags if quiz.tags is not None else [],
            image_couverture_url=quiz.image_couverture_url,
            type_creation=quiz.type_creation,
            id_document=quiz.id_document,
            parametres_generation=quiz.parametres_generation if quiz.parametres_generation is not None else {},
            date_creation=quiz.date_creation,
            nombre_questions=len(quiz.questions),
            is_favorited=quiz.id_quiz in liked_ids,
        ))
    return result


@router.post("/translate/manual", response_model=schemas.ManualQuizTranslateResponse)
def translate_manual_quiz(
    payload: schemas.ManualQuizTranslateRequest,
    current_user: models.Utilisateur = Depends(get_current_user)
):
    try:
        translated = AIService.translate_manual_quiz(
            {
                "titre": payload.titre or "",
                "description": payload.description or "",
                "questions": [question.dict() for question in payload.questions],
            },
            payload.target_language,
        )
        return translated
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de traduction du quiz: {str(e)}")


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

    if getattr(quiz, 'peut_etre_clone', None) is None:
        quiz.peut_etre_clone = True
    return quiz


@router.post("/{quiz_id}/favorite")
def toggle_favorite(
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user)
):
    """Toggle the favorite status of a quiz for the current user."""
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
def delete_quiz_alt(
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