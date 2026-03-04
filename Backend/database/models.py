from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, JSON, Float, Table
from sqlalchemy.orm import relationship
from .database import Base
import datetime
import uuid

def generate_uuid():
    return str(uuid.uuid4())

# Association Tables
participe = Table(
    'participe',
    Base.metadata,
    Column('id_utilisateur', String, ForeignKey('utilisateur.id_utilisateur'), primary_key=True),
    Column('id_session', String, ForeignKey('session.id_session'), primary_key=True),
    Column('score_final', Integer),
    Column('temps_passe_secondes', Integer),
    Column('reponses_utilisateur', JSON),
    Column('fraude_detectee', Boolean, default=False),
    Column('date_participation', DateTime, default=datetime.datetime.utcnow)
)

aimer = Table(
    'aimer',
    Base.metadata,
    Column('id_utilisateur', String, ForeignKey('utilisateur.id_utilisateur'), primary_key=True),
    Column('id_quiz', String, ForeignKey('quiz.id_quiz'), primary_key=True),
    Column('date_like', DateTime, default=datetime.datetime.utcnow)
)

sauvegarder = Table(
    'sauvegarder',
    Base.metadata,
    Column('id_quiz', String, ForeignKey('quiz.id_quiz'), primary_key=True),
    Column('id_playlist', String, ForeignKey('playlist.id_playlist'), primary_key=True)
)

class Utilisateur(Base):
    __tablename__ = "utilisateur"

    id_utilisateur = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    mot_de_passe_hash = Column(String, nullable=False)
    nom_affichage = Column(String)
    photo_url = Column(String)
    langue_preferee = Column(String, default="fr")
    theme = Column(String, default="light")
    role = Column(String, default="user")
    date_inscription = Column(DateTime, default=datetime.datetime.utcnow)
    derniere_connexion = Column(DateTime)
    est_actif = Column(Boolean, default=True)
    est_verifie = Column(Boolean, default=False)
    code_verification = Column(String, nullable=True)
    preferences = Column(JSON, default={})

    # Relationships
    documents = relationship("Document", back_populates="proprietaire")
    quizzes = relationship("Quiz", back_populates="createur")
    sessions = relationship("Session", back_populates="organisateur")
    notifications = relationship("Notification", back_populates="utilisateur")
    commentaires = relationship("Commentaire", back_populates="auteur")
    activites = relationship("Activite", back_populates="utilisateur")
    playlists = relationship("Playlist", back_populates="proprietaire")
    exports = relationship("Export", back_populates="utilisateur")
    quizzes_aimes = relationship("Quiz", secondary=aimer, back_populates="utilisateurs_qui_aiment")
    sessions_participes = relationship("Session", secondary=participe, back_populates="participants")

class Document(Base):
    __tablename__ = "document"

    id_document = Column(String, primary_key=True, default=generate_uuid)
    nom_fichier = Column(String, nullable=False)
    chemin_stockage = Column(String, nullable=False)
    type_fichier = Column(String)
    taille_fichier = Column(Integer)
    contenu_texte = Column(Text)
    langue_detectee = Column(String)
    metadata_json = Column(JSON, default={})
    date_upload = Column(DateTime, default=datetime.datetime.utcnow)
    mots_cles = Column(JSON, default=[])
    peut_etre_reutilise = Column(Boolean, default=True)
    visibilite = Column(String, default="private")
    id_utilisateur = Column(String, ForeignKey("utilisateur.id_utilisateur"))

    # Relationships
    proprietaire = relationship("Utilisateur", back_populates="documents")
    quizzes = relationship("Quiz", back_populates="document_source")

class ServiceIA(Base):
    __tablename__ = "service_ia"

    id_service = Column(String, primary_key=True, default=generate_uuid)
    modele_utilise = Column(String, nullable=False)
    version_modele = Column(String)
    api_key_hash = Column(String)
    parametres_par_defaut = Column(JSON, default={})
    date_creation = Column(DateTime, default=datetime.datetime.utcnow)
    est_actif = Column(Boolean, default=True)
    quota_quotidien = Column(Integer)
    appels_aujourdhui = Column(Integer, default=0)

    # Relationships
    quizzes_generes = relationship("Quiz", back_populates="service_ia")

class Quiz(Base):
    __tablename__ = "quiz"

    id_quiz = Column(String, primary_key=True, default=generate_uuid)
    titre = Column(String, nullable=False)
    description = Column(Text)
    langue_quiz = Column(String, default="fr")
    difficulte_moyenne = Column(String)
    nombre_questions = Column(Integer, default=0)
    duree_max_minutes = Column(Integer)
    parametres_generation = Column(JSON, default={})
    type_creation = Column(String) # AI generated or Manual
    date_creation = Column(DateTime, default=datetime.datetime.utcnow)
    date_modification = Column(DateTime, onupdate=datetime.datetime.utcnow)
    est_actif = Column(Boolean, default=True)
    visibilite = Column(String, default="public")
    # peut_etre_clone = Column(Boolean, default=True)
    tags = Column(JSON, default=[])
    est_corrige_auto = Column(Boolean, default=True)
    image_couverture_url = Column(String)
    image_generee_ia = Column(Boolean, default=False)
    temps_estime_minutes = Column(Integer)
    
    id_service = Column(String, ForeignKey("service_ia.id_service"))
    id_document = Column(String, ForeignKey("document.id_document"), nullable=True)
    id_utilisateur = Column(String, ForeignKey("utilisateur.id_utilisateur"))

    # Relationships
    service_ia = relationship("ServiceIA", back_populates="quizzes_generes")
    document_source = relationship("Document", back_populates="quizzes")
    createur = relationship("Utilisateur", back_populates="quizzes")
    questions = relationship("Question", back_populates="quiz", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="quiz")
    commentaires = relationship("Commentaire", back_populates="quiz")
    playlists = relationship("Playlist", secondary=sauvegarder, back_populates="quizzes")
    utilisateurs_qui_aiment = relationship("Utilisateur", secondary=aimer, back_populates="quizzes_aimes")
    exports = relationship("Export", back_populates="quiz")

class Question(Base):
    __tablename__ = "question"

    id_question = Column(String, primary_key=True, default=generate_uuid)
    texte_question = Column(Text, nullable=False)
    type_question = Column(String) # MCQ, True/False, etc.
    points = Column(Integer, default=1)
    difficulte = Column(String)
    temps_suggere_secondes = Column(Integer)
    ordre_dans_quiz = Column(Integer)
    options_reponses = Column(JSON) # List of options
    reponse_correcte = Column(String)
    explication = Column(Text)
    tags = Column(JSON, default=[])
    date_creation = Column(DateTime, default=datetime.datetime.utcnow)
    
    id_quiz = Column(String, ForeignKey("quiz.id_quiz"))

    # Relationships
    quiz = relationship("Quiz", back_populates="questions")
    statistiques = relationship("StatistiqueQuestion", back_populates="question", cascade="all, delete-orphan")

class Session(Base):
    __tablename__ = "session"

    id_session = Column(String, primary_key=True, default=generate_uuid)
    code_session = Column(String, unique=True, index=True)
    lien_unique = Column(String)
    titre_session = Column(String)
    description = Column(Text)
    participants_max = Column(Integer)
    date_debut_prevue = Column(DateTime)
    date_fin_prevue = Column(DateTime)
    duree_limite_minutes = Column(Integer)
    statut = Column(String, default="planned")
    mode_acces = Column(String, default="public")
    options_securite = Column(JSON, default={})
    parametres_session = Column(JSON, default={})
    regles_declenchement = Column(String)
    date_creation = Column(DateTime, default=datetime.datetime.utcnow)
    allow_participant_export = Column(Boolean, default=True)
    anonymiser_resultats = Column(Boolean, default=False)
    
    id_quiz = Column(String, ForeignKey("quiz.id_quiz"))
    id_utilisateur = Column(String, ForeignKey("utilisateur.id_utilisateur"))

    # Relationships
    quiz = relationship("Quiz", back_populates="sessions")
    organisateur = relationship("Utilisateur", back_populates="sessions")
    participants = relationship("Utilisateur", secondary=participe, back_populates="sessions_participes")
    exports = relationship("Export", back_populates="session")

class StatistiqueQuestion(Base):
    __tablename__ = "statistique_question"

    id_statistique = Column(String, primary_key=True, default=generate_uuid)
    nombre_tentatives = Column(Integer, default=0)
    nombre_reussites = Column(Integer, default=0)
    taux_reussite = Column(Float, default=0.0)
    temps_moyen_reponse = Column(Float, default=0.0)
    reponses_choisies = Column(JSON, default={})
    date_premiere_utilisation = Column(DateTime)
    date_derniere_utilisation = Column(DateTime)
    
    id_question = Column(String, ForeignKey("question.id_question"))

    # Relationships
    question = relationship("Question", back_populates="statistiques")

class Notification(Base):
    __tablename__ = "notification"

    id_notification = Column(String, primary_key=True, default=generate_uuid)
    type = Column(String)
    titre = Column(String)
    message = Column(Text)
    donnees_contexte = Column(JSON, default={})
    est_lue = Column(Boolean, default=False)
    est_envoyee = Column(Boolean, default=True)
    date_creation = Column(DateTime, default=datetime.datetime.utcnow)
    date_envoi = Column(DateTime)
    canal = Column(String)
    
    id_utilisateur = Column(String, ForeignKey("utilisateur.id_utilisateur"))

    # Relationships
    utilisateur = relationship("Utilisateur", back_populates="notifications")

class Commentaire(Base):
    __tablename__ = "commentaire"

    id_commentaire = Column(String, primary_key=True, default=generate_uuid)
    contenu = Column(Text, nullable=False)
    note = Column(Integer)
    est_modere = Column(Boolean, default=False)
    signalements = Column(Integer, default=0)
    date_publication = Column(DateTime, default=datetime.datetime.utcnow)
    date_modification = Column(DateTime, onupdate=datetime.datetime.utcnow)
    est_visible = Column(Boolean, default=True)
    
    id_parent = Column(String, ForeignKey("commentaire.id_commentaire"), nullable=True)
    id_quiz = Column(String, ForeignKey("quiz.id_quiz"))
    id_utilisateur = Column(String, ForeignKey("utilisateur.id_utilisateur"))

    # Relationships
    auteur = relationship("Utilisateur", back_populates="commentaires")
    quiz = relationship("Quiz", back_populates="commentaires")
    reponses = relationship("Commentaire", backref="parent", remote_side=[id_commentaire])

class Export(Base):
    __tablename__ = "export"

    id_export = Column(String, primary_key=True, default=generate_uuid)
    format_export = Column(String) # PDF, CSV, etc.
    type_contenu = Column(String)
    chemin_fichier = Column(String)
    taille_fichier = Column(Integer)
    parametres_generation = Column(JSON, default={})
    date_generation = Column(DateTime, default=datetime.datetime.utcnow)
    nombre_telechargements = Column(Integer, default=0)
    date_expiration = Column(DateTime)
    
    id_session = Column(String, ForeignKey("session.id_session"), nullable=True)
    id_quiz = Column(String, ForeignKey("quiz.id_quiz"), nullable=True)
    id_utilisateur = Column(String, ForeignKey("utilisateur.id_utilisateur"))

    # Relationships
    utilisateur = relationship("Utilisateur", back_populates="exports")
    quiz = relationship("Quiz", back_populates="exports")
    session = relationship("Session", back_populates="exports")

class Activite(Base):
    __tablename__ = "activite"

    id_activite = Column(String, primary_key=True, default=generate_uuid)
    type_activite = Column(String)
    cible_type = Column(String) # Quiz, Session, etc.
    cible_id = Column(String)
    donnees_supplementaires = Column(JSON, default={})
    est_publique = Column(Boolean, default=True)
    date_activite = Column(DateTime, default=datetime.datetime.utcnow)
    
    id_utilisateur = Column(String, ForeignKey("utilisateur.id_utilisateur"))

    # Relationships
    utilisateur = relationship("Utilisateur", back_populates="activites")

class Playlist(Base):
    __tablename__ = "playlist"

    id_playlist = Column(String, primary_key=True, default=generate_uuid)
    titre = Column(String, nullable=False)
    description = Column(Text)
    est_publique = Column(Boolean, default=True)
    date_creation = Column(DateTime, default=datetime.datetime.utcnow)
    
    id_utilisateur = Column(String, ForeignKey("utilisateur.id_utilisateur"))

    # Relationships
    proprietaire = relationship("Utilisateur", back_populates="playlists")
    quizzes = relationship("Quiz", secondary=sauvegarder, back_populates="playlists")

