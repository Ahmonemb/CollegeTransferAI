import os
from pymongo import MongoClient

# --- MongoDB Connection Helper ---
def get_mongo_client():
    MONGO_URI = os.getenv("MONGO_URI")
    if not MONGO_URI:
        raise ValueError("MONGO_URI environment variable not set.")
    # Consider managing client lifetime or using a connection pool in a real application
    return MongoClient(MONGO_URI)
