from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime

class QuestionBase(BaseModel):
    texte_question: str
    type_question: str # MCQ, True/False
    points: int = 1
    temps_suggere_secondes: Optional[int] = 30
    options_reponses: List[str]
    reponse_correcte: Any # Can be string (MCQ/TF) or list of strings (Multi-Response)
    explication: Optional[str] = None

class QuestionCreate(QuestionBase):
    pass

class QuestionResponse(QuestionBase):
    id_question: str
    id_quiz: str

    class Config:
        from_attributes = True

class QuizBase(BaseModel):
    titre: Optional[str] = "Quiz sans titre"
    description: Optional[str] = None
    difficulte_moyenne: Optional[str] = "Moyen"
    duree_max_minutes: Optional[int] = 10
    visibilite: str = "public"
    est_corrige_auto: bool = True
    tags: List[str] = []
    image_couverture_url: Optional[str] = None
    type_creation: Optional[str] = "manual"
    parametres_generation: Optional[dict] = {}

class QuizCreate(QuizBase):
    questions: List[QuestionCreate]

class QuizResponse(QuizBase):
    id_quiz: str
    id_utilisateur: str
    date_creation: datetime
    questions: List[QuestionResponse]

    class Config:
        from_attributes = True


class QuizSummary(QuizBase):
    """Lightweight quiz representation for the 'Mes Quiz' list — no questions payload."""
    id_quiz: str
    id_utilisateur: str = ""
    date_creation: datetime
    nombre_questions: int = 0
    is_favorited: bool = False

    class Config:
        from_attributes = True

class AIGenerationRequest(BaseModel):
    type: str  # "subject" or "document"
    prompt: Optional[str] = None # The subject or document content
    num_questions: int = 10
    difficulty: str = "Moyen" # Débutant, Moyen, Expert
    language: str = "Français"
    tone: str = "Fun" # Fun, Académique, Mystérieux
    question_type: str = "Mélangé" # QCM, Vrai ou Faux, Mélangé, Réponse Ouverte
    time_mode: str = "Pas de limite" # Pas de limite, Chrono, Global
    time_value: Optional[int] = 30 # Seconds per question or total minutes

class AIDraftMetadata(BaseModel):
    titre: str
    description: str

class AIDraftResponse(BaseModel):
    questions: List[dict] # Flexibility for draft questions
    metadata: AIDraftMetadata
