from flask import current_app, g # Keep g for request context
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
import gridfs
import os
from urllib.parse import urlparse
import traceback

# Global variables to hold the single instances initialized by init_db
# These represent the main connection pool/client setup at startup.
client = None
db = None
fs = None
users_collection = None
course_maps_collection = None

def init_db(app, mongo_uri):
    """
    Initializes the MongoDB connection and GridFS using global variables.
    DOES NOT register the teardown function here anymore.
    """
    global client, db, fs, users_collection, course_maps_collection

    if client: # Avoid re-initialization if called multiple times
        print("--- Database already initialized ---")
        return

    if not mongo_uri:
        print("!!! CRITICAL: MONGO_URI not set in configuration.")
        raise ValueError("MONGO_URI is required for database initialization.")

    try:
        print(f"--- Attempting MongoDB Connection to URI specified ---") # Log URI being used
        client = MongoClient(mongo_uri)
        client.admin.command('ismaster') # Verify connection
        db_name = urlparse(mongo_uri).path.lstrip('/')
        if not db_name:
            db_name = 'college_transfer_ai_db' # Default DB name if not in URI
            print(f"Warning: Database name not found in MONGO_URI path, defaulting to '{db_name}'.")
        db = client[db_name] # Assign to global db
        fs = gridfs.GridFS(db) # Assign to global fs

        users_collection = db['users'] # Assign to global users_collection
        course_maps_collection = db['course_maps'] # Assign to global course_maps_collection

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

# --- Accessor Functions ---
# Use Flask's 'g' object for request-scoped resources.

def get_db():
    """
    Returns the database instance for the current request context.
    Uses the globally initialized 'db' if not already in 'g'.
    """
    if 'db' not in g:
        if db is None: # Check if global db was initialized
             raise Exception("Global database not initialized. Ensure init_db() was called successfully at app startup.")
        g.db = db # Store the global db instance in g for this request
        print("--- Attaching global DB to request context 'g' ---")
    return g.db

def get_gridfs():
    """
    Returns the GridFS instance for the current request context.
    Uses the globally initialized 'fs' if not already in 'g'.
    """
    if 'fs' not in g:
        if fs is None: # Check if global fs was initialized
             raise Exception("Global GridFS not initialized. Ensure init_db() was called successfully at app startup.")
        g.fs = fs # Store the global fs instance in g for this request
        print("--- Attaching global GridFS to request context 'g' ---")
    return g.fs

def get_users_collection():
    """
    Returns the users collection instance for the current request context.
    Uses the globally initialized 'users_collection' if not already in 'g'.
    """
    if 'users_collection' not in g:
        if users_collection is None:
            raise Exception("Global Users collection not initialized. Ensure init_db() was called successfully.")
        g.users_collection = users_collection
        print("--- Attaching global Users Collection to request context 'g' ---")
    return g.users_collection

def get_course_maps_collection():
    """
    Returns the course maps collection instance for the current request context.
    Uses the globally initialized 'course_maps_collection' if not already in 'g'.
    """
    if 'course_maps_collection' not in g:
        if course_maps_collection is None:
             raise Exception("Global Course maps collection not initialized. Ensure init_db() was called successfully.")
        g.course_maps_collection = course_maps_collection
        print("--- Attaching global Course Maps Collection to request context 'g' ---")
    return g.course_maps_collection

# --- Teardown Function ---

def close_db(e=None):
    """
    Cleans up resources from the request context 'g'.
    Does NOT close the global client connection.
    """
    # Pop resources from 'g' if they exist. No need to explicitly close them
    # as they are just references to the globally managed instances.
    db_instance = g.pop('db', None)
    fs_instance = g.pop('fs', None)
    users_coll_instance = g.pop('users_collection', None)
    course_maps_coll_instance = g.pop('course_maps_collection', None)

    if db_instance is not None or fs_instance is not None:
         print("--- Cleaning up DB/GridFS references from request context 'g' ---")

    # DO NOT close the global client here:
    # if client is not None: client.close()

# --- Standalone Client Getter (Remains unchanged) ---
def get_mongo_client():
    """Creates a new MongoDB client instance. Caller is responsible for closing."""
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