import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from datetime import datetime
import random
import string

from database.database import get_db
from database.models import Utilisateur
from .schemas import UserCreate, UserLogin, Token, UserResponse, ResetPasswordRequest, ResetPasswordConfirm, UserUpdatePreferences, ProfileUpdate, AvatarResponse
from .utils import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["Authentification"])

@router.put("/update", response_model=UserResponse)
def update_profile(data: ProfileUpdate, current_user: Utilisateur = Depends(get_current_user), db: Session = Depends(get_db)):
    """Mettre à jour les informations du profil."""
    if data.nom_affichage:
        current_user.nom_affichage = data.nom_affichage
    
    if data.preferences is not None:
        if current_user.preferences is None:
            current_user.preferences = {}
        # Merge de manière sécurisée
        current_user.preferences = {**current_user.preferences, **data.preferences}
        
        # Un petit hack pour s'assurer que sqlalchemy détecte le changement dans le dict JSON
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(current_user, "preferences")
    
    # Support legacy bio field if sent at top level
    if data.bio is not None:
        if current_user.preferences is None:
            current_user.preferences = {}
        current_user.preferences["bio"] = data.bio
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(current_user, "preferences")
    
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/avatar", response_model=AvatarResponse)
async def upload_avatar(
    file: UploadFile = File(...), 
    current_user: Utilisateur = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """Uploader une photo de profil."""
    # Vérifier l'extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Format de fichier non supporté.")

    # Créer un nom unique
    filename = f"avatar_{current_user.id_utilisateur}{ext}"
    filepath = os.path.join("uploads", "avatars", filename)
    
    # Sauvegarder le fichier
    with open(filepath, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Mettre à jour l'URL (URL relative pour le frontend)
    photo_url = f"http://localhost:8001/uploads/avatars/{filename}"
    current_user.photo_url = photo_url
    
    db.commit()
    return {"photo_url": photo_url}


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Créer un nouveau compte utilisateur."""
    try:
        existing = db.query(Utilisateur).filter(Utilisateur.email == user_data.email).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Un compte avec cet email existe déjà."
            )

        new_user = Utilisateur(
            email=user_data.email,
            mot_de_passe_hash=hash_password(user_data.mot_de_passe),
            nom_affichage=user_data.nom_affichage or user_data.email.split("@")[0],
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        access_token = create_access_token(data={"sub": new_user.id_utilisateur})
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "user": new_user
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise e


@router.post("/login", response_model=Token)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Se connecter avec email et mot de passe."""
    user = db.query(Utilisateur).filter(Utilisateur.email == credentials.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect.",
        )
    
    is_valid = verify_password(credentials.mot_de_passe, user.mot_de_passe_hash)
    
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou mot de passe incorrect.",
        )

    # Mettre à jour la dernière connexion
    user.derniere_connexion = datetime.utcnow()
    db.commit()
    db.refresh(user)

    access_token = create_access_token(data={"sub": user.id_utilisateur})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }


@router.get("/me", response_model=UserResponse)
def get_me(current_user: Utilisateur = Depends(get_current_user)):
    """Récupérer les infos de l'utilisateur connecté."""
    return current_user


@router.post("/request-reset")
def request_password_reset(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Demander un code de réinitialisation de mot de passe."""
    user = db.query(Utilisateur).filter(Utilisateur.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur avec cet email non trouvé")
    
    # Générer un code à 6 chiffres
    otp = "".join(random.choices(string.digits, k=6))
    user.code_verification = otp
    db.commit()
    
    print("\n" + "🚀" * 10)
    print(f"SIMULATION EMAIL POUR : {user.email}")
    print(f"VOTRE CODE DE RÉCUPÉRATION : {otp}")
    print("🚀" * 10 + "\n")
    
    return {"message": "Un code de vérification a été envoyé à votre adresse email (voir terminal uvicorn)."}


@router.post("/reset-password")
def reset_password(data: ResetPasswordConfirm, db: Session = Depends(get_db)):
    """Réinitialiser le mot de passe avec le code reçu."""
    user = db.query(Utilisateur).filter(Utilisateur.email == data.email).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")
        
    if user.code_verification != data.code:
        raise HTTPException(status_code=400, detail="Code de vérification incorrect")
    
    # Validation du nouveau mot de passe (on pourrait réutiliser le validateur Pydantic ici si besoin)
    # Pour faire simple on hash et on sauve
    user.mot_de_passe_hash = hash_password(data.nouveau_mot_de_passe)
    user.code_verification = None # Invalider le code après usage
    db.commit()
    
    return {"message": "Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter."}
@router.put("/preferences", response_model=UserResponse)
def update_preferences(data: UserUpdatePreferences, current_user: Utilisateur = Depends(get_current_user), db: Session = Depends(get_db)):
    """Mettre à jour les préférences (centres d'intérêt) de l'utilisateur."""
    current_user.preferences = data.preferences
    db.commit()
    db.refresh(current_user)
    return current_user
