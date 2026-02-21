from dotenv import load_dotenv
import os

load_dotenv()

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL")
    HF_TOKEN: str = os.getenv("HF_TOKEN")
    
    def __init__(self):
        if not self.DATABASE_URL:
            raise ValueError("DATABASE_URL n'est pas configuré dans le fichier .env")
            
settings = Settings()

