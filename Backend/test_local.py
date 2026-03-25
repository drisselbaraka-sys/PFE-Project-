
import asyncio
from unittest.mock import Mock
from quiz.ai_service import AIService
from database.config import settings

# Force the API key just in case it is needed from env
settings.GROQ_API_KEY = getattr(settings, "GROQ_API_KEY", "Fake") 

# Wait it might be an actual call. We do not have their API KEY in env here maybe?
# The server is running and works for them. 

print("Done")

