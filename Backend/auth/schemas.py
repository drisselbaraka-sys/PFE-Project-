from pydantic import BaseModel, EmailStr, Field, field_validator
import re
from typing import Optional


class UserCreate(BaseModel):
    email: EmailStr
    mot_de_passe: str = Field(..., min_length=8, description="Le mot de passe doit faire au moins 8 caractères")
    nom_affichage: Optional[str] = None

    @field_validator('email')
    @classmethod
    def email_must_be_gmail(cls, v: str) -> str:
        if not v.endswith('@gmail.com'):
            raise ValueError("Seules les adresses @gmail.com sont acceptées pour le moment.")
        return v

    @field_validator('mot_de_passe')
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Le mot de passe doit contenir au moins une majuscule")
        if not re.search(r"[0-9]", v):
            raise ValueError("Le mot de passe doit contenir au moins un chiffre")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    mot_de_passe: str


class ResetPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordConfirm(BaseModel):
    email: EmailStr
    code: str
    nouveau_mot_de_passe: str = Field(..., min_length=8)

    @field_validator('nouveau_mot_de_passe')
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Le mot de passe doit contenir au moins une majuscule")
        if not re.search(r"[0-9]", v):
            raise ValueError("Le mot de passe doit contenir au moins un chiffre")
        return v


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Optional["UserResponse"] = None


class UserResponse(BaseModel):
    id_utilisateur: str
    email: str
    nom_affichage: Optional[str] = None
    photo_url: Optional[str] = None
    role: str
    preferences: Optional[dict] = None

    class Config:
        from_attributes = True


class UserUpdatePreferences(BaseModel):
    preferences: dict


class ProfileUpdate(BaseModel):
    nom_affichage: Optional[str] = None
    bio: Optional[str] = None
    preferences: Optional[dict] = None


class AvatarResponse(BaseModel):
    photo_url: str
