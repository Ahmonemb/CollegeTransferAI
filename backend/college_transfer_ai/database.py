from pymongo import MongoClient
import gridfs

mongo_client = None
db = None
fs = None
users_collection = None
course_maps_collection = None

def init_db(mongo_uri):
    """Initializes MongoDB connection, database, GridFS, and collections."""
    global mongo_client, db, fs, users_collection, course_maps_collection
    if not mongo_uri:
        raise ConnectionError("MongoDB URI not provided in configuration.")
    try:
        print(f"Connecting to MongoDB...") # Hide URI from logs
        mongo_client = MongoClient(mongo_uri)
        # Use the database name specified in the connection string if available,
        # otherwise default to 'CollegeTransferAI_DB'
        db_name = mongo_client.get_database().name
        db = mongo_client[db_name] # Access the database
        fs = gridfs.GridFS(db)
        users_collection = db.users
        course_maps_collection = db.course_maps
        # Test connection
        mongo_client.admin.command('ping')
        print(f"--- MongoDB Connected Successfully (DB: {db_name}) ---")
    except Exception as e:
        print(f"!!! MongoDB Connection Error: {e}")
        raise ConnectionError(f"Failed to connect to MongoDB: {e}")

# Optional helper functions to access db objects if avoiding globals
def get_db():
    if db is None:
        raise Exception("Database not initialized.")
    return db

def get_gridfs():
    if fs is None:
        raise Exception("GridFS not initialized.")
    return fs

def get_users_collection():
    if users_collection is None:
        raise Exception("Users collection not initialized.")
    return users_collection

def get_course_maps_collection():
     if course_maps_collection is None:
         raise Exception("Course maps collection not initialized.")
     return course_maps_collection
