from fastapi import FastAPI
from pymongo import MongoClient
from pymongo.errors import PyMongoError

app = FastAPI(title="Analytics API")

client = MongoClient("mongodb://localhost:27017")
db = client["myworkout_analytics"]

@app.get("/health")
def health():
    try:
        client.admin.command("ping")
        return {"status": "ok", "db": "mongo alive"}
    except PyMongoError as e:
        print("[Analytics API] Error conectando a Mongo:", e)
        return {"status": "error", "message": "Mongo connection failed"}
