from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime
import uuid

def generate_session_code():
    return uuid.uuid4().hex[:6].upper()

class SessionCreate(BaseModel):
    id_quiz: str
    titre_session: Optional[str] = "Live Session"
    description: Optional[str] = ""
    mode_acces: Optional[str] = "private"

class SessionResponse(BaseModel):
    id_session: str
    code_session: str
    id_quiz: str
    titre_session: str
    description: str
    mode_acces: str
    statut: str
    date_creation: datetime
    id_utilisateur: str
    
    model_config = {"from_attributes": True}

class ParticipantResponse(BaseModel):
    id_utilisateur: str
    nom_affichage: str
    photo_url: Optional[str]
    answered_questions: Optional[int] = 0
    total_questions: Optional[int] = 0
    progression_percent: Optional[int] = 0
    score: Optional[int] = 0
    total_score: Optional[int] = 0
    is_finished: Optional[bool] = False
    last_update: Optional[datetime] = None
    question_breakdown: List[dict] = Field(default_factory=list)

    model_config = {"from_attributes": True}

class OrganizerResponse(BaseModel):
    id_utilisateur: str
    nom_affichage: Optional[str]
    photo_url: Optional[str]

    model_config = {"from_attributes": True}

class QuizSummaryResponse(BaseModel):
    id_quiz: str
    titre: str
    description: Optional[str]
    nombre_questions: int
    duree_max_minutes: Optional[int]
    time_mode: Optional[str] = None
    time_value: Optional[int] = None
    time_value_unit: Optional[str] = None

    model_config = {"from_attributes": True}

class SessionDetailResponse(SessionResponse):
    participants: List[ParticipantResponse] = Field(default_factory=list)
    organisateur: Optional[OrganizerResponse] = None
    quiz: Optional[QuizSummaryResponse] = None
    stats: Optional[dict] = None
    settings: Optional[dict] = None
    countdown: Optional[dict] = None


class SessionProgressUpdate(BaseModel):
    answered_questions: int = 0
    total_questions: int = 0
    current_question_index: int = 0
    score: int = 0
    total_score: int = 0
    is_finished: bool = False
    question_breakdown: List[dict] = Field(default_factory=list)


class SessionSettingsUpdate(BaseModel):
    reports_visible_to_participants: Optional[bool] = None
    auto_start_mode: Optional[str] = None  # manual | scheduled | participant_threshold
    scheduled_start_at: Optional[datetime] = None
    min_participants_to_start: Optional[int] = None
    countdown_seconds: Optional[int] = None
