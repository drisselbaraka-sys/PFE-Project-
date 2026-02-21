from fastapi import FastAPI
from database.database import engine, Base
import database.models

# Create tables on startup (only if they don't exist)
Base.metadata.create_all(bind=engine)

app = FastAPI() 

@app.get("/")
def read_root():
    return {"Hello": "World"}