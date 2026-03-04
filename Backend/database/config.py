import os
from dotenv import load_dotenv
from urllib.parse import quote_plus

# Charge les variables d'environnement
load_dotenv(encoding="utf-8")


class Settings:
    # PostgreSQL — identifiants séparés pour gérer les caractères spéciaux
    DB_USER: str = os.getenv("DB_USER", "pfe_user")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD", "")
    DB_HOST: str = os.getenv("DB_HOST", "localhost")
    DB_PORT: str = os.getenv("DB_PORT", "5432")
    DB_NAME: str = os.getenv("DB_NAME", "pfe_db")

    # Autres
    HF_TOKEN: str = os.getenv("HF_TOKEN")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "fallback-secret-key")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET")

    @property
    def DATABASE_URL(self) -> str:
        """Construit l'URL avec le mot de passe encodé (gère é, à, @, etc.)"""
        return (
            f"postgresql://{self.DB_USER}:{quote_plus(self.DB_PASSWORD)}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    def __init__(self):
        if not self.DB_PASSWORD and not os.getenv("DB_PASSWORD"):
            raise ValueError("DB_PASSWORD n'est pas configuré dans le fichier .env")


settings = Settings()
