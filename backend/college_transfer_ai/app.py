import os
import base64
import traceback
import uuid # Import uuid for map IDs
import datetime # Import datetime
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from backend.college_transfer_ai.college_transfer_API import CollegeTransferAPI
import gridfs
from pymongo import MongoClient
import fitz
from openai import OpenAI
from dotenv import load_dotenv

# --- Google Auth Imports ---
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
# --- End Google Auth Imports ---

print("--- Flask app.py loading ---")
load_dotenv()

# --- Config Vars ---
openai_api_key = os.getenv("OPENAI_API_KEY")
MONGO_URI = os.getenv("MONGO_URI")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
# --- End Config Vars ---

# --- Client Setups ---
if not openai_api_key: print("Warning: OPENAI_API_KEY not set.")
openai_client = OpenAI(api_key=openai_api_key) if openai_api_key else None

if not MONGO_URI: print("CRITICAL: MONGO_URI not set.")
try:
    client = MongoClient(MONGO_URI)
    client.admin.command('ping')
    print("MongoDB connection successful.")
    db = client["CollegeTransferAICluster"]
    fs = gridfs.GridFS(db)
    course_maps_collection = db["course_maps"] # Collection remains the same name
    # Ensure index on google_user_id and map_id for efficient lookups
    course_maps_collection.create_index([("google_user_id", 1)])
    course_maps_collection.create_index([("google_user_id", 1), ("map_id", 1)], unique=True)

except Exception as e:
    print(f"CRITICAL: Failed to connect to MongoDB or create index: {e}")
    # exit(1)

if not GOOGLE_CLIENT_ID:
    print("Warning: GOOGLE_CLIENT_ID not set. Google Sign-In endpoints will fail.")
# --- End Client Setups ---


BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
app = Flask(__name__, template_folder=os.path.join(BASE_DIR, 'templates'), static_folder=os.path.join(BASE_DIR, 'static'))
CORS(app, supports_credentials=True, origins=["http://localhost:5173"])
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

api = CollegeTransferAPI()

# --- Helper: Verify Google Token (remains the same) ---
def verify_google_token(token):
    """Verifies Google ID token and returns user info."""
    if not GOOGLE_CLIENT_ID:
        raise ValueError("Google Client ID not configured on backend.")
    try:
        idinfo = id_token.verify_oauth2_token(
            token, google_requests.Request(), GOOGLE_CLIENT_ID
        )
        google_user_id = idinfo['sub']
        print(f"Token verified for user: {google_user_id}")
        return idinfo
    except ValueError as e:
        print(f"Token verification failed: {e}")
        raise ValueError(f"Invalid Google token: {e}")
    except Exception as e:
        print(f"An unexpected error occurred during token verification: {e}")
        raise ValueError(f"Token verification error: {e}")
# --- End Helper ---


# --- Existing Endpoints (Home, Institutions, PDF/Image handling, Chat etc. remain the same) ---
@app.route('/')
def home(): return "College Transfer AI API is running."
# ... /institutions, /receiving-institutions, /academic-years, /majors ...
# ... /articulation-agreement, /pdf-images, /image ...
# ... /chat ...
# (Keep all existing endpoints as they were)
# Endpoint to get all institutions
@app.route('/institutions', methods=['GET'])
def get_institutions():
    try:
        institutions = api.get_sending_institutions()
        return jsonify(institutions)
    except Exception as e:
        print(f"Error in /institutions: {e}")
        return jsonify({"error": str(e)}), 500

# Endpoint to get receiving institutions
@app.route('/receiving-institutions', methods=['GET'])
def get_receiving_institutions():
    sending_institution_id = request.args.get('sendingInstitutionId')
    if not sending_institution_id:
        return jsonify({"error": "Missing sendingInstitutionId parameter"}), 400
    try:
        non_ccs = api.get_receiving_institutions(sending_institution_id)
        return jsonify(non_ccs)
    except Exception as e:
        print(f"Error in /receiving-institutions: {e}")
        return jsonify({"error": str(e)}), 500

# Endpoint to get academic years
@app.route('/academic-years', methods=['GET'])
def get_academic_years():
    try:
        academic_years = api.get_academic_years()
        return jsonify(academic_years)
    except Exception as e:
        print(f"Error in /academic-years: {e}")
        return jsonify({"error": str(e)}), 500

# Endpoint to get majors
@app.route('/majors', methods=['GET'])
def get_all_majors():
    sending_institution_id = request.args.get('sendingInstitutionId')
    receiving_institution_id = request.args.get('receivingInstitutionId')
    academic_year_id = request.args.get('academicYearId')
    category_code = request.args.get('categoryCode')
    if not all([sending_institution_id, receiving_institution_id, academic_year_id, category_code]):
        return jsonify({"error": "Missing required parameters (sendingInstitutionId, receivingInstitutionId, academicYearId, categoryCode)"}), 400
    try:
        majors = api.get_all_majors(sending_institution_id, receiving_institution_id, academic_year_id, category_code)
        return jsonify(majors)
    except Exception as e:
        print(f"Error in /majors: {e}")
        return jsonify({"error": str(e)}), 500

# Endpoint to get articulation agreement PDF filename
@app.route('/articulation-agreement', methods=['GET'])
def get_articulation_agreement():
    key = request.args.get("key")
    if not key:
        return jsonify({"error": "Missing key parameter"}), 400
    try:
        keyArray = key.split("/")
        if len(keyArray) < 4:
             return jsonify({"error": "Invalid key format"}), 400
        sending_institution_id = int(keyArray[1])
        receiving_institution_id = int(keyArray[3])
        academic_year_id = int(keyArray[0])
        pdf_filename = api.get_articulation_agreement(academic_year_id, sending_institution_id, receiving_institution_id, key)
        return jsonify({"pdf_filename": pdf_filename})
    except ValueError:
         return jsonify({"error": "Invalid numeric value in key"}), 400
    except Exception as e:
        print(f"Error in /articulation-agreement: {e}")
        return jsonify({"error": str(e)}), 500

# Endpoint to get image filenames for a PDF (extracts if needed)
@app.route('/pdf-images/<filename>')
def get_pdf_images(filename):
    try:
        pdf_file = fs.find_one({"filename": filename})
        if not pdf_file:
            return jsonify({"error": "PDF not found"}), 404

        pdf_bytes = pdf_file.read()
        doc = fitz.open("pdf", pdf_bytes)
        image_filenames = []

        # Check cache
        first_image_name = f"{filename}_page_0.png"
        if fs.exists({"filename": first_image_name}):
             for page_num in range(len(doc)):
                 img_filename = f"{filename}_page_{page_num}.png"
                 if fs.exists({"filename": img_filename}):
                     image_filenames.append(img_filename)
                 else:
                     print(f"Cache incomplete, image {img_filename} missing. Regenerating.")
                     image_filenames = []
                     break
             if image_filenames:
                 print(f"All images for {filename} found in cache.")
                 doc.close()
                 return jsonify({"image_filenames": image_filenames})

        # If not fully cached, extract/save
        print(f"Generating images for {filename}...")
        image_filenames = []
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            pix = page.get_pixmap(dpi=150)
            img_bytes = pix.tobytes("png")
            img_filename = f"{filename}_page_{page_num}.png"
            existing_file = fs.find_one({"filename": img_filename})
            if existing_file: fs.delete(existing_file._id)
            fs.put(img_bytes, filename=img_filename, contentType='image/png')
            image_filenames.append(img_filename)
            print(f"Saved image {img_filename}")

        doc.close()
        return jsonify({"image_filenames": image_filenames})

    except Exception as e:
        print(f"Error extracting images for {filename}: {e}")
        traceback.print_exc() # Print full traceback for debugging
        return jsonify({"error": f"Failed to extract images: {str(e)}"}), 500

# Endpoint to serve a single image
@app.route('/image/<image_filename>')
def serve_image(image_filename):
    try:
        grid_out = fs.find_one({"filename": image_filename})
        if not grid_out: return "Image not found", 404
        response = Response(grid_out.read(), mimetype=getattr(grid_out, 'contentType', 'image/png'))
        return response
    except Exception as e:
        print(f"Error serving image {image_filename}: {e}")
        return jsonify({"error": f"Failed to serve image: {str(e)}"}), 500

# Chat Endpoint (remains the same, does not use Google Auth)
@app.route('/chat', methods=['POST'])
def chat_with_agreement():
    if not openai_client: return jsonify({"error": "OpenAI client not configured."}), 500
    try:
        data = request.get_json()
        if not data: return jsonify({"error": "Invalid JSON payload"}), 400
        new_user_message_text = data.get('new_message')
        conversation_history = data.get('history', [])
        image_filenames = data.get('image_filenames')
        if not new_user_message_text: return jsonify({"error": "Missing 'new_message' text"}), 400

        new_openai_message_content = [{"type": "text", "text": new_user_message_text}]
        if image_filenames:
            print(f"Processing {len(image_filenames)} images for the first turn.")
            image_count = 0
            for filename in image_filenames:
                try:
                    grid_out = fs.find_one({"filename": filename})
                    if not grid_out: continue
                    base64_image = base64.b64encode(grid_out.read()).decode('utf-8')
                    new_openai_message_content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:{getattr(grid_out, 'contentType', 'image/png')};base64,{base64_image}"}
                    })
                    image_count += 1
                except Exception as img_err: print(f"Error reading/encoding image {filename}: {img_err}. Skipping.")
            print(f"Added {image_count} images.")
        else: print("No image filenames provided.")

        conversation_history.append({"role": "user", "content": new_openai_message_content})

        print(f"Sending request to OpenAI with {len(conversation_history)} messages...")
        chat_completion = openai_client.chat.completions.create(
            model="gpt-4o-mini", messages=conversation_history, max_tokens=1000
        )
        assistant_reply = chat_completion.choices[0].message.content
        print(f"Received reply from OpenAI.")
        return jsonify({"reply": assistant_reply})

    except Exception as e:
        print(f"Error in /chat endpoint: {e}")
        traceback.print_exc()
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500
# --- End Existing Endpoints ---


# --- Course Map Endpoints ---

# GET /api/course-maps - List all maps for the user
@app.route('/course-maps', methods=['GET'])
def list_course_maps():
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token)
        google_user_id = user_info['sub']

        # Find maps for the user, projecting only necessary fields
        maps_cursor = course_maps_collection.find(
            {'google_user_id': google_user_id},
            {'_id': 0, 'map_id': 1, 'map_name': 1, 'last_updated': 1} # Project fields
        ).sort('last_updated', -1) # Sort by most recently updated

        map_list = list(maps_cursor)
        print(f"Found {len(map_list)} maps for user {google_user_id}")
        return jsonify(map_list), 200

    except ValueError as auth_err:
         return jsonify({"error": str(auth_err)}), 401
    except Exception as e:
        print(f"Error listing course maps: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to list course maps: {str(e)}"}), 500

# GET /api/course-map/<map_id> - Load a specific map
@app.route('/course-map/<map_id>', methods=['GET'])
def load_specific_course_map(map_id):
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token)
        google_user_id = user_info['sub']

        # Find the specific map for the user
        map_data = course_maps_collection.find_one(
            {'google_user_id': google_user_id, 'map_id': map_id},
            {'_id': 0} # Exclude MongoDB ID
        )

        if map_data:
            print(f"Loaded map {map_id} for user {google_user_id}")
            return jsonify(map_data), 200
        else:
            print(f"Map {map_id} not found for user {google_user_id}")
            return jsonify({"error": "Map not found"}), 404

    except ValueError as auth_err:
         return jsonify({"error": str(auth_err)}), 401
    except Exception as e:
        print(f"Error loading course map {map_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to load course map: {str(e)}"}), 500

# POST /api/course-map - Save/Update a map
@app.route('/course-map', methods=['POST'])
def save_or_update_course_map():
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token)
        google_user_id = user_info['sub']

        data = request.get_json()
        if not data or 'nodes' not in data or 'edges' not in data:
            return jsonify({"error": "Invalid payload: 'nodes' and 'edges' required"}), 400

        nodes = data['nodes']
        edges = data['edges']
        map_id = data.get('map_id') # Get map_id if provided (for updates)
        map_name = data.get('map_name', 'Untitled Map') # Get name or use default

        current_time = datetime.datetime.utcnow()

        if map_id: # Update existing map
            print(f"Updating map {map_id} for user {google_user_id}")
            result = course_maps_collection.update_one(
                {'google_user_id': google_user_id, 'map_id': map_id},
                {'$set': {
                    'map_name': map_name,
                    'nodes': nodes,
                    'edges': edges,
                    'last_updated': current_time
                }}
            )
            if result.matched_count == 0:
                return jsonify({"error": "Map not found or permission denied"}), 404
            saved_map_id = map_id
            message = "Course map updated successfully"
        else: # Create new map
            new_map_id = str(uuid.uuid4()) # Generate a new unique ID
            print(f"Creating new map {new_map_id} for user {google_user_id}")
            map_document = {
                'google_user_id': google_user_id,
                'map_id': new_map_id,
                'map_name': map_name,
                'nodes': nodes,
                'edges': edges,
                'created_at': current_time, # Add created timestamp
                'last_updated': current_time
            }
            result = course_maps_collection.insert_one(map_document)
            saved_map_id = new_map_id
            message = "Course map created successfully"

        return jsonify({"message": message, "map_id": saved_map_id}), 200 # Return the map_id

    except ValueError as auth_err:
         return jsonify({"error": str(auth_err)}), 401
    except Exception as e:
        print(f"Error saving/updating course map: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to save course map: {str(e)}"}), 500

# DELETE /api/course-map/<map_id> - Delete a specific map
@app.route('/course-map/<map_id>', methods=['DELETE'])
def delete_specific_course_map(map_id):
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token)
        google_user_id = user_info['sub']

        # --- Add Logging ---
        print(f"[Delete Request] Received Map ID: {map_id}, User ID from Token: {google_user_id}")
        # --- End Logging ---

        # Delete the specific map for the user
        result = course_maps_collection.delete_one(
            {'google_user_id': google_user_id, 'map_id': map_id}
        )

        # --- Add Logging ---
        print(f"[Delete Result] Deleted: {result.deleted_count}")
        # --- End Logging ---

        if result.deleted_count > 0:
            print(f"Deleted map {map_id} for user {google_user_id}")
            # ... remove cache key if needed ...
            return jsonify({"message": "Map deleted successfully"}), 200
        else:
            print(f"Map {map_id} not found for deletion for user {google_user_id}")
            return jsonify({"error": "Map not found or permission denied"}), 404

    except ValueError as auth_err:
         return jsonify({"error": str(auth_err)}), 401
    except Exception as e:
        print(f"Error deleting course map {map_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to delete course map: {str(e)}"}), 500
# --- End Course Map Endpoints ---


if __name__ == '__main__':
    is_debug = os.getenv("FLASK_DEBUG", "False").lower() in ("true", "1", "t")
    print(f"Running Flask app with debug={is_debug}")
    app.run(host='0.0.0.0', port=5000, debug=is_debug)