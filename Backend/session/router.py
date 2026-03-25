from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession
from sqlalchemy.orm import joinedload
from typing import List
import uuid
from datetime import datetime
from datetime import timedelta
from datetime import timezone
import math

from database.database import get_db
from database import models
from auth.utils import get_current_user
from quiz import schemas as quiz_schemas
from . import schemas

router = APIRouter(
    prefix="/session",
    tags=["session"]
)

LIVE_SESSION_PROGRESS = {}
LIVE_SESSION_SETTINGS = {}
LIVE_SESSION_RUNTIME = {}


def to_utc_naive(value):
    if not isinstance(value, datetime):
        return value
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def get_default_live_settings():
    return {
        "reports_visible_to_participants": True,
        "auto_start_mode": "manual",
        "scheduled_start_at": None,
        "min_participants_to_start": 20,
        "countdown_seconds": 10,
    }


def ensure_live_settings(code_session: str):
    code_key = code_session.upper()
    if code_key not in LIVE_SESSION_SETTINGS:
        LIVE_SESSION_SETTINGS[code_key] = get_default_live_settings()
    return LIVE_SESSION_SETTINGS[code_key]


def evaluate_auto_start(session_db: models.Session, db: DBSession):
    if not session_db:
        return

    code_key = session_db.code_session.upper()
    settings = ensure_live_settings(code_key)
    runtime = LIVE_SESSION_RUNTIME.get(code_key, {})

    if session_db.statut == "active":
        LIVE_SESSION_RUNTIME[code_key] = runtime
        return

    now = datetime.utcnow()
    auto_start_mode = settings.get("auto_start_mode") or "manual"
    countdown_seconds = max(1, int(settings.get("countdown_seconds") or 10))

    should_trigger_countdown = False
    trigger_reason = None

    if auto_start_mode == "scheduled":
        scheduled_start_at = settings.get("scheduled_start_at")
        scheduled_start_at = to_utc_naive(scheduled_start_at)
        if isinstance(scheduled_start_at, datetime) and now >= scheduled_start_at:
            should_trigger_countdown = True
            trigger_reason = "scheduled"
    elif auto_start_mode == "participant_threshold":
        threshold = max(1, int(settings.get("min_participants_to_start") or 1))
        participant_count = len(session_db.participants or [])
        if participant_count >= threshold:
            should_trigger_countdown = True
            trigger_reason = "participant_threshold"

    if should_trigger_countdown and not runtime.get("countdown_started_at"):
        countdown_started_at = now
        countdown_end_at = countdown_started_at + timedelta(seconds=countdown_seconds)
        runtime["countdown_started_at"] = countdown_started_at
        runtime["countdown_end_at"] = countdown_end_at
        runtime["trigger_reason"] = trigger_reason

    countdown_end_at = to_utc_naive(runtime.get("countdown_end_at"))
    if isinstance(countdown_end_at, datetime) and now >= countdown_end_at and session_db.statut != "active":
        session_db.statut = "active"
        db.commit()

    LIVE_SESSION_RUNTIME[code_key] = runtime

def generate_session_code(db: DBSession):
    while True:
        code = uuid.uuid4().hex[:6].upper()
        if not db.query(models.Session).filter(models.Session.code_session == code).first():
            return code


def build_session_detail_payload(session_db: models.Session):
    quiz_db = session_db.quiz
    organizer_id = session_db.id_utilisateur
    code_key = session_db.code_session.upper()
    session_progress = LIVE_SESSION_PROGRESS.get(code_key, {})
    settings = ensure_live_settings(code_key)
    runtime = LIVE_SESSION_RUNTIME.get(code_key, {})

    participants = [
        {
            "id_utilisateur": participant.id_utilisateur,
            "nom_affichage": participant.nom_affichage,
            "photo_url": participant.photo_url,
            "answered_questions": int((session_progress.get(participant.id_utilisateur) or {}).get("answered_questions", 0) or 0),
            "total_questions": int((session_progress.get(participant.id_utilisateur) or {}).get("total_questions", 0) or 0),
            "progression_percent": int((session_progress.get(participant.id_utilisateur) or {}).get("progression_percent", 0) or 0),
            "score": int((session_progress.get(participant.id_utilisateur) or {}).get("score", 0) or 0),
            "total_score": int((session_progress.get(participant.id_utilisateur) or {}).get("total_score", 0) or 0),
            "is_finished": bool((session_progress.get(participant.id_utilisateur) or {}).get("is_finished", False)),
            "last_update": (session_progress.get(participant.id_utilisateur) or {}).get("last_update"),
            "question_breakdown": (session_progress.get(participant.id_utilisateur) or {}).get("question_breakdown") or [],
        }
        for participant in (session_db.participants or [])
        if participant.id_utilisateur != organizer_id
    ]

    participant_count = len(participants)
    completed_count = len([p for p in participants if p.get("is_finished")])
    in_progress_count = len([
        p for p in participants
        if not p.get("is_finished") and (p.get("answered_questions", 0) > 0)
    ])
    average_progress = int(round(
        sum(p.get("progression_percent", 0) for p in participants) / max(1, participant_count)
    )) if participant_count > 0 else 0
    average_score = int(round(
        sum(p.get("score", 0) for p in participants) / max(1, participant_count)
    )) if participant_count > 0 else 0

    countdown_end_at = to_utc_naive(runtime.get("countdown_end_at"))
    countdown_started_at = to_utc_naive(runtime.get("countdown_started_at"))
    countdown_remaining_seconds = 0
    if isinstance(countdown_end_at, datetime) and session_db.statut != "active":
        countdown_remaining_seconds = max(0, int(math.ceil((countdown_end_at - datetime.utcnow()).total_seconds())))

    organiser = None
    if session_db.organisateur:
        organiser = {
            "id_utilisateur": session_db.organisateur.id_utilisateur,
            "nom_affichage": session_db.organisateur.nom_affichage,
            "photo_url": session_db.organisateur.photo_url,
        }

    quiz_payload = None
    if quiz_db:
        computed_question_count = quiz_db.nombre_questions if (quiz_db.nombre_questions and quiz_db.nombre_questions > 0) else len(quiz_db.questions or [])
        generation_params = quiz_db.parametres_generation or {}
        time_mode = generation_params.get("time_mode")

        try:
            time_value = int(generation_params.get("time_value")) if generation_params.get("time_value") is not None else None
        except (TypeError, ValueError):
            time_value = None

        computed_duration = quiz_db.duree_max_minutes
        if time_mode == "Timer Global":
            computed_duration = time_value if time_value is not None else computed_duration
        elif time_mode == "Mode Chrono":
            computed_duration = None
        elif not computed_duration:
            computed_duration = None

        quiz_payload = {
            "id_quiz": quiz_db.id_quiz,
            "titre": quiz_db.titre,
            "description": quiz_db.description,
            "nombre_questions": computed_question_count,
            "duree_max_minutes": computed_duration,
            "time_mode": time_mode,
            "time_value": time_value,
        }

    return {
        "id_session": session_db.id_session,
        "code_session": session_db.code_session,
        "id_quiz": session_db.id_quiz,
        "titre_session": session_db.titre_session,
        "description": session_db.description,
        "mode_acces": session_db.mode_acces,
        "statut": session_db.statut,
        "date_creation": session_db.date_creation,
        "id_utilisateur": session_db.id_utilisateur,
        "participants": participants,
        "organisateur": organiser,
        "quiz": quiz_payload,
        "stats": {
            "participant_count": participant_count,
            "in_progress_count": in_progress_count,
            "completed_count": completed_count,
            "average_progress": average_progress,
            "average_score": average_score,
            "highest_score": max([p.get("score", 0) for p in participants], default=0),
        }
        ,
        "settings": {
            "reports_visible_to_participants": bool(settings.get("reports_visible_to_participants", True)),
            "auto_start_mode": settings.get("auto_start_mode") or "manual",
            "scheduled_start_at": settings.get("scheduled_start_at"),
            "min_participants_to_start": int(settings.get("min_participants_to_start") or 20),
            "countdown_seconds": int(settings.get("countdown_seconds") or 10),
        },
        "countdown": {
            "active": bool(countdown_remaining_seconds > 0),
            "remaining_seconds": countdown_remaining_seconds,
            "started_at": countdown_started_at,
            "ends_at": countdown_end_at,
            "trigger_reason": runtime.get("trigger_reason"),
        },
    }

@router.post("/", response_model=schemas.SessionResponse)
def create_session(
    session_data: schemas.SessionCreate,
    db: DBSession = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user)
):
    quiz = db.query(models.Quiz).filter(models.Quiz.id_quiz == session_data.id_quiz).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz introuvable")

    if quiz.id_utilisateur != current_user.id_utilisateur:
        raise HTTPException(status_code=403, detail="Non autorisé")

    new_session = models.Session(
        code_session=generate_session_code(db),
        titre_session=session_data.titre_session,
        description=session_data.description,
        mode_acces=session_data.mode_acces,
        id_quiz=quiz.id_quiz,
        id_utilisateur=current_user.id_utilisateur,
        statut="planned"
    )
    
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    ensure_live_settings(new_session.code_session)
    return new_session

@router.get("/{code_session}", response_model=schemas.SessionDetailResponse)
def get_session(code_session: str, db: DBSession = Depends(get_db)):
    session_db = (
        db.query(models.Session)
        .options(
            joinedload(models.Session.participants),
            joinedload(models.Session.organisateur),
            joinedload(models.Session.quiz).joinedload(models.Quiz.questions),
        )
        .filter(models.Session.code_session == code_session.upper())
        .first()
    )
    if not session_db:
        raise HTTPException(status_code=404, detail="Session introuvable")
    evaluate_auto_start(session_db, db)
    db.refresh(session_db)
    return build_session_detail_payload(session_db)

@router.post("/{code_session}/join")
def join_session(
    code_session: str,
    db: DBSession = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user)
):
    session_db = db.query(models.Session).filter(models.Session.code_session == code_session.upper()).first()
    if not session_db:
        raise HTTPException(status_code=404, detail="Session introuvable")

    if current_user.id_utilisateur == session_db.id_utilisateur:
        return {
            "message": "Vous êtes le créateur de cette session",
            "code_session": session_db.code_session,
            "role": "creator",
            "joined": False,
        }

    participant_ids = {participant.id_utilisateur for participant in (session_db.participants or [])}
    joined = False
    if current_user.id_utilisateur not in participant_ids:
        session_db.participants.append(current_user)
        db.commit()
        db.refresh(session_db)
        joined = True

    evaluate_auto_start(session_db, db)
    
    return {
        "message": "Rejoint avec succès",
        "code_session": session_db.code_session,
        "role": "participant",
        "joined": joined,
    }

@router.put("/{code_session}/start")
def start_session(
    code_session: str,
    db: DBSession = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user)
):
    session_db = db.query(models.Session).filter(models.Session.code_session == code_session.upper()).first()
    if not session_db:
        raise HTTPException(status_code=404, detail="Session introuvable")
    
    if session_db.id_utilisateur != current_user.id_utilisateur:
        raise HTTPException(status_code=403, detail="Non autorisé")
        
    session_db.statut = "active"
    code_key = session_db.code_session.upper()
    LIVE_SESSION_RUNTIME[code_key] = {
        "countdown_started_at": datetime.utcnow(),
        "countdown_end_at": datetime.utcnow(),
        "trigger_reason": "manual",
    }
    db.commit()
    
    return {"message": "Session démarrée"}


@router.post("/{code_session}/progress")
def upsert_session_progress(
    code_session: str,
    payload: schemas.SessionProgressUpdate,
    db: DBSession = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user),
):
    session_db = (
        db.query(models.Session)
        .options(joinedload(models.Session.participants))
        .filter(models.Session.code_session == code_session.upper())
        .first()
    )
    if not session_db:
        raise HTTPException(status_code=404, detail="Session introuvable")

    if session_db.statut != "active":
        raise HTTPException(status_code=400, detail="La session n'est pas encore active")

    if current_user.id_utilisateur == session_db.id_utilisateur:
        raise HTTPException(status_code=403, detail="Le créateur ne participe pas au quiz")

    participant_ids = {participant.id_utilisateur for participant in (session_db.participants or [])}
    if current_user.id_utilisateur not in participant_ids:
        raise HTTPException(status_code=403, detail="Non autorisé")

    total_questions = max(0, int(payload.total_questions or 0))
    answered_questions = max(0, min(int(payload.answered_questions or 0), total_questions if total_questions > 0 else int(payload.answered_questions or 0)))
    progression_percent = int(round((answered_questions / max(1, total_questions)) * 100)) if total_questions > 0 else 0

    code_key = session_db.code_session
    if code_key not in LIVE_SESSION_PROGRESS:
        LIVE_SESSION_PROGRESS[code_key] = {}

    LIVE_SESSION_PROGRESS[code_key][current_user.id_utilisateur] = {
        "answered_questions": answered_questions,
        "total_questions": total_questions,
        "current_question_index": max(0, int(payload.current_question_index or 0)),
        "progression_percent": progression_percent,
        "score": max(0, int(payload.score or 0)),
        "total_score": max(0, int(payload.total_score or 0)),
        "is_finished": bool(payload.is_finished),
        "last_update": datetime.utcnow(),
        "question_breakdown": payload.question_breakdown or [],
    }

    return {"message": "Progression mise à jour"}


@router.put("/{code_session}/settings")
def update_session_settings(
    code_session: str,
    payload: schemas.SessionSettingsUpdate,
    db: DBSession = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user),
):
    session_db = (
        db.query(models.Session)
        .options(joinedload(models.Session.participants))
        .filter(models.Session.code_session == code_session.upper())
        .first()
    )
    if not session_db:
        raise HTTPException(status_code=404, detail="Session introuvable")

    if current_user.id_utilisateur != session_db.id_utilisateur:
        raise HTTPException(status_code=403, detail="Non autorisé")

    code_key = session_db.code_session.upper()
    settings = ensure_live_settings(code_key)

    if payload.reports_visible_to_participants is not None:
        settings["reports_visible_to_participants"] = bool(payload.reports_visible_to_participants)

    if payload.auto_start_mode is not None:
        requested_mode = str(payload.auto_start_mode).strip()
        if requested_mode not in {"manual", "scheduled", "participant_threshold"}:
            raise HTTPException(status_code=400, detail="Mode de démarrage invalide")
        settings["auto_start_mode"] = requested_mode

    if payload.scheduled_start_at is not None:
        settings["scheduled_start_at"] = payload.scheduled_start_at

    if payload.min_participants_to_start is not None:
        settings["min_participants_to_start"] = max(1, int(payload.min_participants_to_start))

    if payload.countdown_seconds is not None:
        settings["countdown_seconds"] = max(1, int(payload.countdown_seconds))

    LIVE_SESSION_SETTINGS[code_key] = settings
    LIVE_SESSION_RUNTIME[code_key] = {}

    evaluate_auto_start(session_db, db)
    db.refresh(session_db)

    return build_session_detail_payload(session_db)


@router.get("/{code_session}/quiz", response_model=quiz_schemas.QuizResponse)
def get_session_quiz(
    code_session: str,
    db: DBSession = Depends(get_db),
    current_user: models.Utilisateur = Depends(get_current_user),
):
    session_db = (
        db.query(models.Session)
        .options(
            joinedload(models.Session.participants),
            joinedload(models.Session.quiz).joinedload(models.Quiz.questions),
        )
        .filter(models.Session.code_session == code_session.upper())
        .first()
    )
    if not session_db or not session_db.quiz:
        raise HTTPException(status_code=404, detail="Session ou quiz introuvable")

    is_creator = session_db.id_utilisateur == current_user.id_utilisateur
    participant_ids = {participant.id_utilisateur for participant in (session_db.participants or [])}
    is_participant = current_user.id_utilisateur in participant_ids

    if not is_creator and not is_participant:
        raise HTTPException(status_code=403, detail="Non autorisé")

    if getattr(session_db.quiz, "peut_etre_clone", None) is None:
        session_db.quiz.peut_etre_clone = True

    return session_db.quiz
