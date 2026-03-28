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
    # Pydantic v2: use `model_config` for model-wide config
    model_config = {"from_attributes": True}

class QuizBase(BaseModel):
    titre: Optional[str] = "Quiz sans titre"
    description: Optional[str] = None
    difficulte_moyenne: Optional[str] = "Moyen"
    duree_max_minutes: Optional[int] = 10
    visibilite: str = "public"
    peut_etre_clone: bool = True
    est_corrige_auto: bool = True
    tags: List[str] = Field(default_factory=list)
    image_couverture_url: Optional[str] = None
    type_creation: Optional[str] = "manual"
    parametres_generation: dict = Field(default_factory=dict)

class QuizCreate(QuizBase):
    questions: List[QuestionCreate]

class QuizResponse(QuizBase):
    id_quiz: str
    id_utilisateur: str
    date_creation: datetime
    questions: List[QuestionResponse]
    model_config = {"from_attributes": True}


class QuizSummary(QuizBase):
    """Lightweight quiz representation for the 'Mes Quiz' list — no questions payload."""
    id_quiz: str
    id_utilisateur: str = ""
    date_creation: datetime
    nombre_questions: int = 0
    is_favorited: bool = False
    model_config = {"from_attributes": True}

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
    saved_documents: List[dict] = Field(default_factory=list)

class AIDraftResponse(BaseModel):
    questions: List[dict] = Field(default_factory=list)  # Flexibility for draft questions
    metadata: AIDraftMetadata


class ManualQuizTranslateRequest(BaseModel):
    titre: Optional[str] = ""
    description: Optional[str] = ""
    questions: List[QuestionCreate]
    target_language: str = "Français"


class ManualQuizTranslateResponse(BaseModel):
    titre: str
    description: str
    questions: List[dict] = Field(default_factory=list)


class QuizCreatorSummary(BaseModel):
    id_utilisateur: str
    nom_affichage: Optional[str] = None
    photo_url: Optional[str] = None


class QuizPlayerScore(BaseModel):
    id_utilisateur: str
    nom_affichage: Optional[str] = None
    photo_url: Optional[str] = None
    best_score: int = 0
    attempts: int = 0
    last_played_at: Optional[datetime] = None


class QuizCommentAuthor(BaseModel):
    id_utilisateur: str
    nom_affichage: Optional[str] = None
    photo_url: Optional[str] = None


class QuizCommentResponse(BaseModel):
    id_commentaire: str
    contenu: str
    note: Optional[float] = None
    id_parent: Optional[str] = None
    date_publication: datetime
    auteur: QuizCommentAuthor
    replies: List["QuizCommentResponse"] = Field(default_factory=list)


class QuizPublicDetailResponse(BaseModel):
    quiz: QuizSummary
    createur: Optional[QuizCreatorSummary] = None
    can_clone: bool = True
    stats: dict = Field(default_factory=dict)
    players: List[QuizPlayerScore] = Field(default_factory=list)
    comments: List[QuizCommentResponse] = Field(default_factory=list)


class QuizCommentCreateRequest(BaseModel):
    contenu: str = Field(..., min_length=1, max_length=1200)
    note: Optional[float] = Field(default=None, ge=0.5, le=5)
    id_parent: Optional[str] = None


class QuizPublicSubmissionRequest(BaseModel):
    score: int = Field(default=0, ge=0)
    total_score: int = Field(default=0, ge=0)
    note: Optional[float] = Field(default=None, ge=0, le=5)
    commentaire: Optional[str] = Field(default=None, max_length=1200)
    question_breakdown: List[dict] = Field(default_factory=list)


class QuizPublicSubmissionResponse(BaseModel):
    message: str
    saved_score: int = 0
    saved_comment: bool = False
    comment: Optional[QuizCommentResponse] = None


QuizCommentResponse.model_rebuild()
