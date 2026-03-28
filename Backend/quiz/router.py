from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
import json
import asyncio
import os
import uuid
from datetime import datetime

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


def _normalize_comment(comment: models.Commentaire) -> schemas.QuizCommentResponse:
    author = comment.auteur
    return schemas.QuizCommentResponse(
        id_commentaire=comment.id_commentaire,
        contenu=comment.contenu,
        note=comment.note,
        id_parent=comment.id_parent,
        date_publication=comment.date_publication,
        auteur=schemas.QuizCommentAuthor(
            id_utilisateur=author.id_utilisateur if author else "",
            nom_affichage=(author.nom_affichage if author else None),
            photo_url=(author.photo_url if author else None),
        ),
        replies=[],
    )


def _create_notification(
    db: Session,
    target_user_id: Optional[str],
    notif_type: str,
    titre: str,
    message: str,
    contexte: Optional[dict] = None,
):
    if not target_user_id:
        return

    db.add(models.Notification(
        type=notif_type,
        titre=titre,
        message=message,
        donnees_contexte=contexte or {},
        est_lue=False,
        est_envoyee=True,
        date_creation=datetime.utcnow(),
        id_utilisateur=target_user_id,
    ))


def _generate_auto_session_code(db: Session) -> str:
    """Generate a unique technical session code used for public quiz submissions."""
    while True:
        code = f"AUTO{uuid.uuid4().hex[:8].upper()}"
        exists = db.query(models.Session).filter(models.Session.code_session == code).first()
        if not exists:
            return code

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


@router.get("/public", response_model=List[schemas.QuizSummary])
def get_public_quizzes(
    q: str = Query(default="", max_length=120),
    tag: Optional[str] = Query(default=None, max_length=60),
    limit: int = Query(default=60, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Returns publicly visible quizzes for the home/explore pages."""
    query = db.query(models.Quiz).filter(
        models.Quiz.visibilite == "public",
        models.Quiz.est_actif == True,
    )

    search_value = (q or "").strip()
    if search_value:
        pattern = f"%{search_value}%"
        query = query.filter(
            (models.Quiz.titre.ilike(pattern)) |
            (models.Quiz.description.ilike(pattern))
        )

    tag_value = (tag or "").strip().lower()
    quizzes = query.order_by(models.Quiz.date_creation.desc()).limit(limit).all()

    result = []
    for quiz in quizzes:
        normalized_tags = quiz.tags if isinstance(quiz.tags, list) else []
        if tag_value and tag_value not in [str(t).lower() for t in normalized_tags]:
            continue

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
            tags=normalized_tags,
            image_couverture_url=quiz.image_couverture_url,
            type_creation=quiz.type_creation,
            id_document=quiz.id_document,
            parametres_generation=quiz.parametres_generation if quiz.parametres_generation is not None else {},
            date_creation=quiz.date_creation,
            nombre_questions=len(quiz.questions),
            is_favorited=False,
        ))

    return result


@router.get("/public/{quiz_id}/details", response_model=schemas.QuizPublicDetailResponse)
def get_public_quiz_details(quiz_id: str, db: Session = Depends(get_db)):
    """Returns social details for a public quiz: ratings, comments and score history."""
    quiz = (
        db.query(models.Quiz)
        .options(joinedload(models.Quiz.createur))
        .filter(
            models.Quiz.id_quiz == quiz_id,
            models.Quiz.visibilite == "public",
            models.Quiz.est_actif == True,
        )
        .first()
    )

    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz public introuvable.")

    can_clone = getattr(quiz, "peut_etre_clone", None)
    if can_clone is None:
        can_clone = True

    score_rows = (
        db.query(
            models.Utilisateur.id_utilisateur,
            models.Utilisateur.nom_affichage,
            models.Utilisateur.photo_url,
            models.participe.c.score_final,
            models.participe.c.date_participation,
        )
        .join(models.participe, models.Utilisateur.id_utilisateur == models.participe.c.id_utilisateur)
        .join(models.Session, models.Session.id_session == models.participe.c.id_session)
        .filter(
            models.Session.id_quiz == quiz_id,
            models.participe.c.score_final.isnot(None),
        )
        .all()
    )

    players_map = {}
    total_scores = 0
    for row in score_rows:
        player = players_map.get(row.id_utilisateur)
        current_score = int(row.score_final or 0)
        total_scores += current_score

        if not player:
            players_map[row.id_utilisateur] = {
                "id_utilisateur": row.id_utilisateur,
                "nom_affichage": row.nom_affichage,
                "photo_url": row.photo_url,
                "best_score": current_score,
                "attempts": 1,
                "last_played_at": row.date_participation,
            }
            continue

        player["attempts"] += 1
        player["best_score"] = max(player["best_score"], current_score)
        if row.date_participation and (
            not player["last_played_at"] or row.date_participation > player["last_played_at"]
        ):
            player["last_played_at"] = row.date_participation

    players = [schemas.QuizPlayerScore(**entry) for entry in players_map.values()]
    players.sort(key=lambda p: (p.best_score, p.attempts), reverse=True)
    players = players[:20]

    comments_rows = (
        db.query(
            models.Commentaire.id_commentaire,
            models.Commentaire.contenu,
            models.Commentaire.note,
            models.Commentaire.id_parent,
            models.Commentaire.date_publication,
            models.Utilisateur.id_utilisateur.label("author_id"),
            models.Utilisateur.nom_affichage.label("author_name"),
            models.Utilisateur.photo_url.label("author_photo"),
        )
        .outerjoin(models.Utilisateur, models.Utilisateur.id_utilisateur == models.Commentaire.id_utilisateur)
        .filter(
            models.Commentaire.id_quiz == quiz_id,
            models.Commentaire.est_visible == True,
        )
        .order_by(models.Commentaire.date_publication.desc())
        .all()
    )

    comments_map = {}
    ratings = []
    for row in comments_rows:
        comments_map[row.id_commentaire] = schemas.QuizCommentResponse(
            id_commentaire=row.id_commentaire,
            contenu=row.contenu,
            note=row.note,
            id_parent=row.id_parent,
            date_publication=row.date_publication,
            auteur=schemas.QuizCommentAuthor(
                id_utilisateur=row.author_id or "",
                nom_affichage=row.author_name,
                photo_url=row.author_photo,
            ),
            replies=[],
        )
        if row.id_parent is None and row.note is not None:
            ratings.append(float(row.note))

    roots = []
    for row in comments_rows:
        node = comments_map[row.id_commentaire]
        parent_id = row.id_parent
        if parent_id and parent_id in comments_map:
            comments_map[parent_id].replies.append(node)
        else:
            roots.append(node)

    def sort_replies(node: schemas.QuizCommentResponse):
        node.replies.sort(key=lambda item: item.date_publication)
        for reply in node.replies:
            sort_replies(reply)

    for root in roots:
        sort_replies(root)

    average_rating = round(sum(ratings) / len(ratings), 2) if ratings else 0.0
    average_score = round(total_scores / len(score_rows), 2) if score_rows else 0.0

    stats_payload = {
        "average_rating": average_rating,
        "total_reviews": len(ratings),
        "total_comments": len([c for c in comments_rows if c.id_parent is None]),
        "total_replies": len([c for c in comments_rows if c.id_parent is not None]),
        "total_participations": len(score_rows),
        "total_players": len(players_map),
        "total_answer_submissions": len(score_rows),
        "average_score": average_score,
    }

    quiz_summary = schemas.QuizSummary(
        id_quiz=quiz.id_quiz,
        id_utilisateur=quiz.id_utilisateur,
        titre=quiz.titre,
        description=quiz.description,
        difficulte_moyenne=quiz.difficulte_moyenne,
        duree_max_minutes=quiz.duree_max_minutes,
        visibilite=quiz.visibilite,
        peut_etre_clone=bool(can_clone),
        est_corrige_auto=quiz.est_corrige_auto,
        tags=quiz.tags if quiz.tags is not None else [],
        image_couverture_url=quiz.image_couverture_url,
        type_creation=quiz.type_creation,
        id_document=quiz.id_document,
        parametres_generation=quiz.parametres_generation if quiz.parametres_generation is not None else {},
        date_creation=quiz.date_creation,
        nombre_questions=len(quiz.questions),
        is_favorited=False,
    )

    creator_payload = None
    if quiz.createur:
        creator_payload = schemas.QuizCreatorSummary(
            id_utilisateur=quiz.createur.id_utilisateur,
            nom_affichage=quiz.createur.nom_affichage,
            photo_url=quiz.createur.photo_url,
        )

    return schemas.QuizPublicDetailResponse(
        quiz=quiz_summary,
        createur=creator_payload,
        can_clone=bool(can_clone),
        stats=stats_payload,
        players=players,
        comments=roots,
    )


@router.post("/public/{quiz_id}/comments", response_model=schemas.QuizCommentResponse)
def create_public_quiz_comment(
    quiz_id: str,
    payload: schemas.QuizCommentCreateRequest,
    db: Session = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user),
):
    quiz = db.query(models.Quiz).filter(
        models.Quiz.id_quiz == quiz_id,
        models.Quiz.visibilite == "public",
        models.Quiz.est_actif == True,
    ).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz public introuvable.")

    parent_comment = None
    if payload.id_parent:
        parent_comment = db.query(models.Commentaire).filter(
            models.Commentaire.id_commentaire == payload.id_parent,
            models.Commentaire.id_quiz == quiz_id,
            models.Commentaire.est_visible == True,
        ).first()
        if not parent_comment:
            raise HTTPException(status_code=400, detail="Commentaire parent introuvable.")

    clean_content = (payload.contenu or "").strip()
    if not clean_content:
        raise HTTPException(status_code=400, detail="Le commentaire ne peut pas être vide.")

    new_comment = models.Commentaire(
        contenu=clean_content,
        note=(max(0.5, min(5.0, round(float(payload.note) * 2) / 2)) if (parent_comment is None and payload.note is not None) else None),
        id_parent=(parent_comment.id_commentaire if parent_comment else None),
        id_quiz=quiz_id,
        id_utilisateur=current_user.id_utilisateur,
        est_visible=True,
    )
    db.add(new_comment)
    db.flush()

    display_name = current_user.nom_affichage or current_user.email.split("@")[0]
    if parent_comment:
        if parent_comment.id_utilisateur != current_user.id_utilisateur:
            _create_notification(
                db=db,
                target_user_id=parent_comment.id_utilisateur,
                notif_type="comment_reply",
                titre="Nouvelle réponse à votre commentaire",
                message=f"{display_name} a répondu à votre commentaire sur \"{quiz.titre}\".",
                contexte={
                    "quiz_id": quiz_id,
                    "comment_id": parent_comment.id_commentaire,
                    "reply_id": new_comment.id_commentaire,
                },
            )
    else:
        if quiz.id_utilisateur != current_user.id_utilisateur:
            _create_notification(
                db=db,
                target_user_id=quiz.id_utilisateur,
                notif_type="quiz_comment",
                titre="Nouveau commentaire sur votre quiz",
                message=f"{display_name} a commenté votre quiz \"{quiz.titre}\".",
                contexte={
                    "quiz_id": quiz_id,
                    "comment_id": new_comment.id_commentaire,
                },
            )

    db.commit()
    db.refresh(new_comment)

    return schemas.QuizCommentResponse(
        id_commentaire=new_comment.id_commentaire,
        contenu=new_comment.contenu,
        note=new_comment.note,
        id_parent=new_comment.id_parent,
        date_publication=new_comment.date_publication,
        auteur=schemas.QuizCommentAuthor(
            id_utilisateur=current_user.id_utilisateur,
            nom_affichage=current_user.nom_affichage,
            photo_url=current_user.photo_url,
        ),
        replies=[],
    )


@router.post("/public/{quiz_id}/submit", response_model=schemas.QuizPublicSubmissionResponse)
def submit_public_quiz_result(
    quiz_id: str,
    payload: schemas.QuizPublicSubmissionRequest,
    db: Session = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user),
):
    """Persist a finished public quiz attempt with optional rating/comment."""
    quiz = db.query(models.Quiz).filter(
        models.Quiz.id_quiz == quiz_id,
        models.Quiz.visibilite == "public",
        models.Quiz.est_actif == True,
    ).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz public introuvable.")

    safe_score = max(0, int(payload.score or 0))
    safe_total = max(0, int(payload.total_score or 0))
    if safe_total > 0 and safe_score > safe_total:
        safe_score = safe_total

    auto_session = models.Session(
        code_session=_generate_auto_session_code(db),
        lien_unique=None,
        titre_session=f"Tentative publique - {(quiz.titre or 'Quiz')[:60]}",
        description="Soumission automatique d'une tentative de quiz public",
        mode_acces="system",
        statut="completed",
        id_quiz=quiz.id_quiz,
        id_utilisateur=quiz.id_utilisateur, # Assign the session to the original quiz creator to organize properly
    )
    db.add(auto_session)
    db.flush()

    db.execute(
        models.participe.insert().values(
            id_utilisateur=current_user.id_utilisateur,
            id_session=auto_session.id_session,
            score_final=safe_score,
            reponses_utilisateur=payload.question_breakdown or [],
            date_participation=datetime.utcnow(),
        )
    )

    created_comment_payload = None
    clean_comment = (payload.commentaire or "").strip()
    if clean_comment:
        normalized_note = None
        if payload.note is not None and float(payload.note) > 0:
            normalized_note = max(0.5, min(5.0, round(float(payload.note) * 2) / 2))

        new_comment = models.Commentaire(
            contenu=clean_comment,
            note=normalized_note,
            id_parent=None,
            id_quiz=quiz.id_quiz,
            id_utilisateur=current_user.id_utilisateur,
            est_visible=True,
        )
        db.add(new_comment)
        db.flush()

        display_name = current_user.nom_affichage or current_user.email.split("@")[0]
        if quiz.id_utilisateur != current_user.id_utilisateur:
            _create_notification(
                db=db,
                target_user_id=quiz.id_utilisateur,
                notif_type="quiz_comment",
                titre="Nouveau retour sur votre quiz",
                message=f"{display_name} a publié son score et un commentaire sur \"{quiz.titre}\".",
                contexte={
                    "quiz_id": quiz.id_quiz,
                    "comment_id": new_comment.id_commentaire,
                    "score": safe_score,
                },
            )

        created_comment_payload = schemas.QuizCommentResponse(
            id_commentaire=new_comment.id_commentaire,
            contenu=new_comment.contenu,
            note=new_comment.note,
            id_parent=None,
            date_publication=new_comment.date_publication,
            auteur=schemas.QuizCommentAuthor(
                id_utilisateur=current_user.id_utilisateur,
                nom_affichage=current_user.nom_affichage,
                photo_url=current_user.photo_url,
            ),
            replies=[],
        )

    db.commit()

    return schemas.QuizPublicSubmissionResponse(
        message="Soumission enregistree avec succes.",
        saved_score=safe_score,
        saved_comment=created_comment_payload is not None,
        comment=created_comment_payload,
    )


@router.post("/public/{quiz_id}/clone", response_model=schemas.QuizResponse)
def clone_public_quiz(
    quiz_id: str,
    db: Session = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user),
):
    quiz = (
        db.query(models.Quiz)
        .options(joinedload(models.Quiz.questions))
        .filter(models.Quiz.id_quiz == quiz_id)
        .first()
    )

    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz introuvable.")

    is_owner = quiz.id_utilisateur == current_user.id_utilisateur
    can_clone = getattr(quiz, "peut_etre_clone", None)
    if can_clone is None:
        can_clone = True

    if not is_owner and quiz.visibilite != "public":
        raise HTTPException(status_code=403, detail="Ce quiz n'est pas accessible.")

    if not can_clone:
        raise HTTPException(status_code=403, detail="Le créateur a désactivé le clonage de ce quiz.")

    if is_owner:
        if getattr(quiz, 'peut_etre_clone', None) is None:
            quiz.peut_etre_clone = True
        return quiz

    cloned_title = (quiz.titre or "Quiz")
    if len(cloned_title) > 110:
        cloned_title = cloned_title[:110].rstrip()
    cloned_title = f"{cloned_title} (Copie)"

    source_params = quiz.parametres_generation if isinstance(quiz.parametres_generation, dict) else {}
    cloned_params = {
        **source_params,
        "source_quiz_id": quiz.id_quiz,
        "source_creator_id": quiz.id_utilisateur,
        "is_cloned": True,
    }

    cloned_quiz = models.Quiz(
        titre=cloned_title,
        description=quiz.description,
        langue_quiz=quiz.langue_quiz,
        difficulte_moyenne=quiz.difficulte_moyenne,
        nombre_questions=len(quiz.questions or []),
        duree_max_minutes=quiz.duree_max_minutes,
        parametres_generation=cloned_params,
        type_creation=quiz.type_creation,
        est_actif=True,
        visibilite=(quiz.visibilite or "public"),
        peut_etre_clone=True,
        tags=quiz.tags if quiz.tags is not None else [],
        est_corrige_auto=quiz.est_corrige_auto,
        image_couverture_url=quiz.image_couverture_url,
        image_generee_ia=quiz.image_generee_ia,
        temps_estime_minutes=quiz.temps_estime_minutes,
        id_service=quiz.id_service,
        id_document=quiz.id_document,
        id_utilisateur=current_user.id_utilisateur,
    )
    db.add(cloned_quiz)
    db.flush()

    for source_question in sorted(quiz.questions or [], key=lambda item: item.ordre_dans_quiz or 0):
        cloned_question = models.Question(
            texte_question=source_question.texte_question,
            type_question=source_question.type_question,
            points=source_question.points,
            difficulte=source_question.difficulte,
            temps_suggere_secondes=source_question.temps_suggere_secondes,
            ordre_dans_quiz=source_question.ordre_dans_quiz,
            options_reponses=source_question.options_reponses,
            reponse_correcte=source_question.reponse_correcte,
            explication=source_question.explication,
            tags=source_question.tags if source_question.tags is not None else [],
            id_quiz=cloned_quiz.id_quiz,
        )
        db.add(cloned_question)

    db.commit()

    saved_clone = (
        db.query(models.Quiz)
        .options(joinedload(models.Quiz.questions))
        .filter(models.Quiz.id_quiz == cloned_quiz.id_quiz)
        .first()
    )
    return saved_clone


@router.get("/public/{quiz_id}", response_model=schemas.QuizResponse)
def get_public_quiz(quiz_id: str, db: Session = Depends(get_db)):
    """Returns full quiz details for a public quiz (playable from home page)."""
    quiz = db.query(models.Quiz).filter(
        models.Quiz.id_quiz == quiz_id,
        models.Quiz.visibilite == "public",
        models.Quiz.est_actif == True,
    ).first()

    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz public introuvable.")

    if getattr(quiz, 'peut_etre_clone', None) is None:
        quiz.peut_etre_clone = True
    return quiz


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