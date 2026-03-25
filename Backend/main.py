import os

# Force PostgreSQL à envoyer les messages d'erreur en anglais (ASCII)
# Cela doit être fait AVANT toute tentative de connexion pour éviter 
# le crash UnicodeDecodeError sur Windows
os.environ["LC_ALL"] = "C"
os.environ["LC_MESSAGES"] = "C"
os.environ["LANG"] = "en_US.UTF-8"
os.environ["LANGUAGE"] = "en_US.UTF-8"
os.environ["PGCLIENTENCODING"] = "utf-8"

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database.database import engine, Base
import database.models
from auth.router import router as auth_router
from quiz.router import router as quiz_router
from session.router import router as session_router
from fastapi.staticfiles import StaticFiles

# Créer le dossier uploads s'il n'existe pas
os.makedirs("uploads/avatars", exist_ok=True)


# Create tables on startup
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"ERROR: Échec de la création des tables : {e}")

# Ensure legacy DBs get the 'peut_etre_clone' column if missing (best-effort)
try:
    with engine.connect() as conn:
        try:
            conn.execute("ALTER TABLE quiz ADD COLUMN IF NOT EXISTS peut_etre_clone BOOLEAN DEFAULT true;")
        except Exception:
            # Some SQL engines (older SQLite) may not support IF NOT EXISTS; try a safer approach
            try:
                conn.execute("ALTER TABLE quiz ADD COLUMN peut_etre_clone BOOLEAN DEFAULT true")
            except Exception:
                # If this fails, it's likely the column already exists or the engine doesn't allow ALTER
                pass
except Exception as e:
    print(f"WARNING: Could not ensure 'peut_etre_clone' column exists automatically: {e}")

# T5 Pre-loading REMOVED (using Qwen Cloud)


app = FastAPI(title="Qvibe API", version="1.0.0")

# CORS — autorise les requêtes du frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8001", # Self for static files
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth_router)
app.include_router(quiz_router)
app.include_router(session_router)

# Monter le dossier uploads pour servir les fichiers statiques
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/")
def read_root():
    return {"message": "Bienvenue sur l'API Qvibe 🎯"}