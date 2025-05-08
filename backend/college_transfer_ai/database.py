from flask import current_app, g 
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
import gridfs
import os
from urllib.parse import urlparse
import traceback

client = None
db = None
fs = None
users_collection = None
course_maps_collection = None

def init_db(app, mongo_uri):
    global client, db, fs, users_collection, course_maps_collection

    if client: 
        print("--- Database already initialized ---")
        return

    if not mongo_uri:
        print("!!! CRITICAL: MONGO_URI not set in configuration.")
        raise ValueError("MONGO_URI is required for database initialization.")

    try:
        print(f"--- Attempting MongoDB Connection to URI specified ---") 
        client = MongoClient(mongo_uri)
        client.admin.command('ismaster') 
        db_name = urlparse(mongo_uri).path.lstrip('/')
        if not db_name:
            db_name = 'college_transfer_ai_db' 
            print(f"Warning: Database name not found in MONGO_URI path, defaulting to '{db_name}'.")
        db = client[db_name] 
        fs = gridfs.GridFS(db) 

        users_collection = db['users'] 
        course_maps_collection = db['course_maps'] 

        print(f"--- MongoDB Connected & GridFS Initialized (DB: {db_name}) ---")
        print(f"--- Collections Initialized: {users_collection.name}, {course_maps_collection.name} ---")

    except ConnectionFailure as e:
        print(f"!!! CRITICAL: MongoDB Server not available. Error: {e}")
        client = None; db = None; fs = None; users_collection = None; course_maps_collection = None
        raise ConnectionError(f"Failed to connect to MongoDB: {e}") from e
    except Exception as e:
        print(f"!!! CRITICAL: An unexpected error occurred during MongoDB initialization: {e}")
        traceback.print_exc()
        client = None; db = None; fs = None; users_collection = None; course_maps_collection = None
        raise


def get_db():
    if 'db' not in g:
        if db is None: 
             raise Exception("Global database not initialized. Ensure init_db() was called successfully at app startup.")
        g.db = db 
        print("--- Attaching global DB to request context 'g' ---")
    return g.db

def get_gridfs():
    if 'fs' not in g:
        if fs is None: 
             raise Exception("Global GridFS not initialized. Ensure init_db() was called successfully at app startup.")
        g.fs = fs 
        print("--- Attaching global GridFS to request context 'g' ---")
    return g.fs

def get_users_collection():
    if 'users_collection' not in g:
        if users_collection is None:
            raise Exception("Global Users collection not initialized. Ensure init_db() was called successfully.")
        g.users_collection = users_collection
        print("--- Attaching global Users Collection to request context 'g' ---")
    return g.users_collection

def get_course_maps_collection():
    if 'course_maps_collection' not in g:
        if course_maps_collection is None:
             raise Exception("Global Course maps collection not initialized. Ensure init_db() was called successfully.")
        g.course_maps_collection = course_maps_collection
        print("--- Attaching global Course Maps Collection to request context 'g' ---")
    return g.course_maps_collection


def close_db(e=None):
    db_instance = g.pop('db', None)
    fs_instance = g.pop('fs', None)

    if db_instance is not None or fs_instance is not None:
         print("--- Cleaning up DB/GridFS references from request context 'g' ---")


def get_mongo_client():
    MONGO_URI = os.getenv("MONGO_URI")
    if not MONGO_URI:
         try:
             MONGO_URI = current_app.config['APP_CONFIG'].get("MONGO_URI")
             if not MONGO_URI:
                 raise ValueError("MONGO_URI environment variable not set and not found in app config.")
         except (RuntimeError, KeyError):
             raise ValueError("MONGO_URI environment variable not set and no Flask app context available.")
    print("--- Creating new standalone MongoDB client connection (caller must close) ---")
    return MongoClient(MONGO_URI)