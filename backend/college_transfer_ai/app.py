import os
import base64
import traceback
import uuid # Import uuid for map IDs
# Use datetime from datetime module consistently
from datetime import datetime, timedelta, time, timezone # Add timezone
from flask import Flask, jsonify, request, Response, redirect # Add redirect
from flask_cors import CORS
from .college_transfer_API import CollegeTransferAPI # Use a leading dot
import gridfs
from pymongo import MongoClient
from bson.objectid import ObjectId # Import ObjectId
import fitz
from openai import OpenAI
from dotenv import load_dotenv
import stripe # Import stripe
import json # Import json for webhook parsing
import io # Import io for image processing
from PIL import Image # Import Image for image processing

# --- Google Auth Imports ---
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
# --- End Google Auth Imports ---

# --- Google AI Imports ---
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
# --- End Google AI Imports ---

print("--- Flask app.py loading ---")
load_dotenv()

# --- Config Vars ---
openai_api_key = os.getenv("OPENAI_API_KEY")
MONGO_URI = os.getenv("MONGO_URI")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# --- Stripe Config ---
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
STRIPE_PRICE_ID = os.getenv("STRIPE_PRICE_ID")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173") # Default if not set
# --- End Stripe Config ---

# --- Rate Limits (Example: Daily) ---
FREE_TIER_DAILY_LIMIT = 10
PAID_TIER_DAILY_LIMIT = 200 # Example limit for paid users

# --- Add this print statement ---
print(f"--- Attempting to configure Google AI with Key: '{GOOGLE_API_KEY}' ---")
# --- End print statement ---

# Google AI Client Setup
if not GOOGLE_API_KEY:
    print("Warning; GOOGLE_API_KEY not set. Google AI chat will fail.")
else:
    try:
        genai.configure(api_key=GOOGLE_API_KEY)
        print("Google AI client configured successfully.")
    except Exception as e:
        print(f"CRITICAL: Failed to configure Google AI client: {e}")
# --- End Google AI Client Setup ---

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
    course_maps_collection = db["course_maps"] # Collection for course maps
    users_collection = db["users"] # NEW: Collection for user data and tiers

    # Ensure index on google_user_id and map_id for course maps
    course_maps_collection.create_index([("google_user_id", 1)])
    course_maps_collection.create_index([("google_user_id", 1), ("map_id", 1)], unique=True)

    # NEW: Ensure index on google_user_id for users collection (unique)
    users_collection.create_index([("google_user_id", 1)], unique=True)
    print("MongoDB collections and indexes configured.")

except Exception as e:
    print(f"CRITICAL: Failed to connect to MongoDB or configure collections/indexes: {e}")
    # exit(1) # Consider if you want the app to stop if DB fails

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
        # Minimal check for required fields
        if 'sub' not in idinfo:
             raise ValueError("Token verification failed: Missing 'sub' (user ID).")
        print(f"Token verified for user: {idinfo['sub']}")
        return idinfo
    except ValueError as e:
        print(f"Token verification failed: {e}")
        raise ValueError(f"Invalid Google token: {e}")
    except Exception as e:
        print(f"An unexpected error occurred during token verification: {e}")
        raise ValueError(f"Token verification error: {e}")
# --- End Helper ---

# --- NEW Helper: Get or Create User ---
# Modify get_or_create_user to include Stripe fields if they don't exist
def get_or_create_user(idinfo):
    """
    Finds a user by google_user_id or creates a new one with default free tier.
    Ensures Stripe-related fields exist.
    Returns the user document from MongoDB.
    """
    google_user_id = idinfo.get('sub')
    if not google_user_id:
        raise ValueError("Missing 'sub' (user ID) in token info.")

    user = users_collection.find_one({'google_user_id': google_user_id})

    if not user:
        print(f"User {google_user_id} not found. Creating new user.")
        new_user_data = {
            'google_user_id': google_user_id,
            'email': idinfo.get('email'),
            'name': idinfo.get('name'),
            'tier': 'free', # Default tier
            'requests_used_this_period': 0,
            'period_start_date': datetime.utcnow(),
            'created_at': datetime.utcnow(),
            'last_login': datetime.utcnow(),
            # Add Stripe fields with defaults
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "subscription_status": None,
            "subscription_expires": None
        }
        try:
            users_collection.insert_one(new_user_data)
            print(f"Successfully created new user: {google_user_id}")
            user = users_collection.find_one({'google_user_id': google_user_id})
            if not user:
                 raise Exception(f"Failed to retrieve newly created user {google_user_id}")
        except Exception as e:
            print(f"Error creating user {google_user_id}: {e}")
            raise Exception(f"Database error creating user: {e}")
    else:
        # Ensure Stripe fields exist for older users & update last_login
        update_needed = False
        update_query = {'last_login': datetime.utcnow()} # Always update last login
        if 'stripe_customer_id' not in user:
            update_query['stripe_customer_id'] = None
            update_needed = True
        if 'stripe_subscription_id' not in user:
            update_query['stripe_subscription_id'] = None
            update_needed = True
        if 'subscription_status' not in user:
            update_query['subscription_status'] = None
            update_needed = True
        if 'subscription_expires' not in user:
            update_query['subscription_expires'] = None
            update_needed = True

        users_collection.update_one(
            {'google_user_id': google_user_id},
            {'$set': update_query}
        )
        if update_needed:
             # Re-fetch user data after update if fields were added
             user = users_collection.find_one({"google_user_id": google_user_id})

        print(f"Found existing user: {google_user_id}, Tier: {user.get('tier')}")

    return user
# --- End NEW Helper ---

# --- Helper: Check and Update Usage ---
def check_and_update_usage(user_data):
    """
    Checks if the user is within their daily limit.
    Resets the count if a new day has started.
    Increments the count if the request proceeds.
    Returns True if the user is within limits, False otherwise.
    Raises Exception on database error.
    """
    user_id = user_data['google_user_id']
    tier = user_data.get('tier', 'free')
    requests_used = user_data.get('requests_used_this_period', 0)
    period_start = user_data.get('period_start_date')

    limit = PAID_TIER_DAILY_LIMIT if tier == 'paid' else FREE_TIER_DAILY_LIMIT

    now = datetime.utcnow()
    reset_usage = False

    # Check if period_start exists and is a datetime object
    if period_start and isinstance(period_start, datetime):
        # Check if the period start date is before today (UTC)
        if period_start.date() < now.date():
            print(f"New day detected for user {user_id}. Resetting usage count.")
            requests_used = 0
            period_start = now # Start the new period today
            reset_usage = True
        # else: # Period started today, continue counting
            # print(f"Usage period started today for user {user_id}.")
    else:
        # If period_start is missing or invalid, start a new period now
        print(f"Period start date missing or invalid for user {user_id}. Starting new period.")
        requests_used = 0
        period_start = now
        reset_usage = True

    # Check if limit is exceeded
    if requests_used >= limit:
        print(f"User {user_id} (Tier: {tier}) has reached daily limit of {limit}.")
        return False # Limit exceeded

    # --- If limit is not exceeded, increment count ---
    try:
        update_fields = {
            '$inc': {'requests_used_this_period': 1},
            '$set': {'last_request_timestamp': now} # Optional: track last request time
        }
        # Only update period_start_date if it was reset
        if reset_usage:
            update_fields['$set']['period_start_date'] = period_start
            update_fields['$set']['requests_used_this_period'] = 1 # Start count at 1 for the new period

        result = users_collection.update_one(
            {'google_user_id': user_id},
            update_fields
        )
        if result.modified_count == 0 and not reset_usage:
             # This might happen if the user doc was deleted between fetch and update
             # Or if the increment somehow failed. Handle defensively.
             print(f"Warning: Failed to increment usage count for user {user_id}. Proceeding anyway.")
             # Optionally raise an error or retry
        elif reset_usage:
             print(f"Usage reset and incremented to 1 for user {user_id} for new period starting {period_start.date()}.")
        else:
             print(f"Usage incremented for user {user_id}. New count: {requests_used + 1}/{limit}")

        return True # Within limit, usage incremented

    except Exception as e:
        print(f"Database error updating usage for user {user_id}: {e}")
        # Decide if you want to let the request proceed or block it on DB error
        raise Exception(f"Failed to update usage count: {e}")

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
    sending_institution_id = request.args.get('sendingId')
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
    sending_institution_id = request.args.get('sendingId')
    receiving_institution_id = request.args.get('receivingId')
    print(f"Received sendingId: {sending_institution_id}, receivingId: {receiving_institution_id}")
    try:
        academic_years = api.get_academic_years(int(sending_institution_id),int(receiving_institution_id))
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

# REMOVE or COMMENT OUT old endpoint:
# @app.route('/articulation-agreement', methods=['GET'])
# def get_articulation_agreement(): ...

# NEW Endpoint to get multiple articulation agreement PDF filenames
@app.route('/articulation-agreements', methods=['POST']) # Changed to POST
def get_multiple_articulation_agreements():
    print("Received request for multiple articulation agreements.")
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        sending_ids = data.get('sending_ids')
        print(f"Received sending_ids: {sending_ids}")
        receiving_id = data.get('receiving_id')
        year_id = data.get('year_id')
        major_key = data.get('major_key') # Key like 'Major/fc50cced...' or 'Department/...'

        key_components = major_key.split('/')
        major_id = key_components[-1] if len(key_components) > 1 else None
        category_code = key_components[4] if len(key_components) > 0 else None
        print(f"Extracted major_id: {major_id} from major_key: {major_key} \n")
        if not all([sending_ids, receiving_id, year_id, major_key]) or not isinstance(sending_ids, list):
            return jsonify({"error": "Missing or invalid parameters (sending_ids list, receiving_id, year_id, major_key required)"}), 400

        print(f"Received request for agreements: Sending={sending_ids}, Receiving={receiving_id}, Year={year_id}, MajorKey={major_key}")

        results = []
        for sending_id in sending_ids:
            try:
                # Construct the 'key' needed by the underlying API function
                # Assumes major_key is like 'Major/...' or 'Department/...'
                # Adjust if your major_key format is different
                constructed_key = f"{year_id}/{sending_id}/to/{receiving_id}/{category_code}/{major_id}"
                print(f"Calling api.get_articulation_agreement for key: {constructed_key}")

                # Call the original function for each sending ID
                pdf_filename = api.get_articulation_agreement(
                    int(year_id),
                    int(sending_id),
                    int(receiving_id),
                    constructed_key # Pass the constructed key
                )
                results.append({
                    "sendingId": sending_id, # Return string ID to match frontend state
                    "pdfFilename": pdf_filename
                })
            except ValueError:
                 print(f"Warning: Invalid numeric value for sending_id {sending_id}, skipping.")
                 results.append({"sendingId": sending_id, "pdfFilename": None, "error": "Invalid ID format"})
            except Exception as single_err:
                # Log error for this specific agreement but continue with others
                print(f"Error fetching agreement for sending_id {sending_id}: {single_err}")
                # Optionally include error in response for frontend to display
                results.append({"sendingId": sending_id, "pdfFilename": None, "error": str(single_err)})

        return jsonify({"agreements": results})

    except Exception as e:
        print(f"Error in /articulation-agreements: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to process agreement request: {str(e)}"}), 500

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
    if not GOOGLE_API_KEY: # Check if Google AI is configured
        return jsonify({"error": "Google AI client not configured."}), 500

    # --- Authentication and User Retrieval ---
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token)
        user_data = get_or_create_user(user_info) # Get/Create user record
        user_tier = user_data.get('tier', 'free')
        google_user_id = user_data['google_user_id']
        print(f"[/chat] Request received from user {google_user_id} (Tier: {user_tier})")

    except ValueError as auth_err:
         print(f"[/chat] Authentication error: {auth_err}")
         return jsonify({"error": str(auth_err)}), 401
    except Exception as e:
        print(f"[/chat] Error during user retrieval: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to retrieve user data: {str(e)}"}), 500
    # --- End Authentication ---

    # --- Rate Limiting Check ---
    try:
        # Check usage *before* processing the request
        # The helper function will increment the count if within limits
        if not check_and_update_usage(user_data):
            limit = PAID_TIER_DAILY_LIMIT if user_tier == 'paid' else FREE_TIER_DAILY_LIMIT
            return jsonify({
                "error": f"Daily request limit ({limit}) reached for your tier ({user_tier}). Please try again tomorrow or upgrade for more requests."
            }), 429 # Too Many Requests
    except Exception as usage_err:
        # Handle DB errors during usage check/update
        print(f"[/chat] Error checking/updating usage for user {google_user_id}: {usage_err}")
        traceback.print_exc()
        # Decide if you want to block the request or proceed cautiously
        return jsonify({"error": "Could not verify usage limits. Please try again later."}), 500
    # --- End Rate Limiting Check ---

    # --- Proceed with Chat Logic (if within limits) ---
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Missing JSON payload"}), 400

        new_user_message_text = data.get('new_message')
        history = data.get('history', [])
        image_filenames = data.get('image_filenames', []) # Expecting list of filenames

        if not new_user_message_text:
            return jsonify({"error": "Missing 'new_message' in request"}), 400
        if not isinstance(history, list):
             return jsonify({"error": "'history' must be a list"}), 400
        if not isinstance(image_filenames, list):
             return jsonify({"error": "'image_filenames' must be a list"}), 400

        # --- Prepare Input for Gemini ---
        prompt_parts = []
        # Image processing
        if image_filenames:
            print(f"Processing {len(image_filenames)} image(s)...")
            for img_filename in image_filenames:
                try:
                    grid_out = fs.find_one({"filename": img_filename})
                    if not grid_out:
                        print(f"Warning: Image '{img_filename}' not found in GridFS.")
                        continue # Skip missing images
                    image_bytes = grid_out.read()
                    prompt_parts.append(Image.open(io.BytesIO(image_bytes)))
                except Exception as img_err:
                    print(f"Error processing image {img_filename}: {img_err}")
                    # Decide if you want to fail the request or just skip the image
                    # return jsonify({"error": f"Failed to process image {img_filename}"}), 500

        # Add text message
        prompt_parts.append(new_user_message_text)

        # History conversion
        gemini_history = []
        for msg in history:
            role = "user" if msg.get("role") == "user" else "model"
            text = msg.get("text")
            if text: # Ensure text exists
                 gemini_history.append({'role': role, 'parts': [text]})
            else:
                 print(f"Warning: Skipping history message with no text: {msg}")


        # --- Model Selection based on Tier ---
        if user_tier == 'paid':
            model_name = 'gemini-1.5-pro' # Or your preferred paid model
            print(f"Using PAID tier model: {model_name}")
        else: # Default to free tier model
            model_name = 'gemini-1.5-flash-latest' # Or your preferred free model
            print(f"Using FREE tier model: {model_name}")
        # --- End Model Selection ---

        # --- Initialize Gemini Model and Chat ---
        safety_settings = { # Define your safety settings
             HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
             # ... other categories ...
        }
        model = genai.GenerativeModel(model_name, safety_settings=safety_settings)
        chat = model.start_chat(history=gemini_history)

        print(f"Sending request to Gemini ({model_name}) with {len(prompt_parts)} parts...")
        response = chat.send_message(prompt_parts)
        assistant_reply = response.text
        print("Received reply from Gemini.")

        # --- Usage count was already incremented by check_and_update_usage ---

        return jsonify({"reply": assistant_reply})

    except Exception as e:
        print(f"[/chat] Error during chat processing for user {google_user_id}: {e}")
        traceback.print_exc()
        # Note: Usage count might have been incremented even if this part fails.
        # Consider adding logic to decrement if a failure occurs *after* the increment,
        # though this adds complexity.
        return jsonify({"error": f"An error occurred processing your request: {str(e)}"}), 500
# --- End Chat Endpoint ---


# --- Course Map Endpoints ---

# GET /api/course-maps - List all maps for the user
@app.route('/course-maps', methods=['GET'])
def list_course_maps():
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token) # Verify token first
        user_data = get_or_create_user(user_info) # Get/Create user record
        google_user_id = user_data['google_user_id'] # Use ID from user_data

        # Find maps for the user, projecting only necessary fields
        maps_cursor = course_maps_collection.find(
            {'google_user_id': google_user_id},
            {'_id': 0, 'map_id': 1, 'map_name': 1, 'last_updated': 1} # Project fields
        ).sort('last_updated', -1) # Sort by most recently updated

        map_list = list(maps_cursor)
        print(f"Found {len(map_list)} maps for user {google_user_id} (Tier: {user_data.get('tier')})")
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
        user_data = get_or_create_user(user_info) # Get/Create user record
        google_user_id = user_data['google_user_id']

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
        user_data = get_or_create_user(user_info) # Get/Create user record
        google_user_id = user_data['google_user_id']

        data = request.get_json()
        if not data or 'nodes' not in data or 'edges' not in data:
            return jsonify({"error": "Invalid payload: 'nodes' and 'edges' required"}), 400

        nodes = data['nodes']
        edges = data['edges']
        map_id = data.get('map_id') # Get map_id if provided (for updates)
        map_name = data.get('map_name', 'Untitled Map') # Get name or use default

        current_time = datetime.utcnow()

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
        user_data = get_or_create_user(user_info) # Get/Create user record
        google_user_id = user_data['google_user_id']

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

# --- NEW Endpoint: Get User Status ---
@app.route('/user-status', methods=['GET'])
def get_user_status():
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token)
        user_data = get_or_create_user(user_info)
        google_user_id = user_data['google_user_id']

        tier = user_data.get('tier', 'free')
        requests_used = user_data.get('requests_used_this_period', 0)
        period_start = user_data.get('period_start_date')

        limit = PAID_TIER_DAILY_LIMIT if tier == 'paid' else FREE_TIER_DAILY_LIMIT

        now = datetime.utcnow()
        reset_time = None

        # Calculate reset time (assuming daily reset at UTC midnight)
        # Find the start of the next day in UTC
        tomorrow_midnight = datetime.combine(now.date() + timedelta(days=1), time(0, 0), tzinfo=now.tzinfo)
        reset_time = tomorrow_midnight.isoformat() + "Z" # Format as ISO string with Z for UTC

        # Check if usage needs reset (if period_start is before today)
        # This ensures the returned 'requests_used' is accurate for today
        if period_start and isinstance(period_start, datetime) and period_start.date() < now.date():
            requests_used = 0 # Report 0 if the period hasn't been reset yet by a request

        print(f"User status requested for {google_user_id}: Used={requests_used}, Limit={limit}, Tier={tier}, Resets={reset_time}")

        return jsonify({
            "tier": tier,
            "usageCount": requests_used,
            "usageLimit": limit,
            "resetTime": reset_time # ISO 8601 format string (UTC)
        }), 200

    except ValueError as auth_err:
         return jsonify({"error": str(auth_err)}), 401
    except Exception as e:
        print(f"Error getting user status: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to get user status: {str(e)}"}), 500
# --- End NEW Endpoint ---

# --- NEW: Stripe Checkout Session Endpoint ---
@app.route('/create-checkout-session', methods=['POST'])
def create_checkout_session():
    try:
        # 1. Authenticate User
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token)
        user_data = get_or_create_user(user_info)
        google_user_id = user_data['google_user_id']
        mongo_user_id = str(user_data['_id']) # Use MongoDB _id as client_reference_id

        print(f"Creating checkout session for user: {google_user_id} (Mongo ID: {mongo_user_id})")

        # 2. Create Stripe Checkout Session
        checkout_session = stripe.checkout.Session.create(
            line_items=[
                {
                    'price': STRIPE_PRICE_ID, # Price ID from .env
                    'quantity': 1,
                },
            ],
            mode='subscription',
            success_url=f'{FRONTEND_URL}/payment-success?session_id={{CHECKOUT_SESSION_ID}}',
            cancel_url=f'{FRONTEND_URL}/payment-cancel',
            # Link session to your internal user ID
            client_reference_id=mongo_user_id,
            # Optionally prefill email
            customer_email=user_data.get('email'),
            # If user already has a stripe_customer_id, use it
            customer=user_data.get('stripe_customer_id') if user_data.get('stripe_customer_id') else None,
            # If creating a new customer, attach metadata
            customer_creation='always' if not user_data.get('stripe_customer_id') else None, # Create if not exists
            customer_update={'name': 'auto', 'address': 'auto'} if user_data.get('stripe_customer_id') else None, # Update if exists
            subscription_data={
                'metadata': {
                    'mongo_user_id': mongo_user_id,
                    'google_user_id': google_user_id
                }
            } if not user_data.get('stripe_customer_id') else None, # Add metadata only if creating sub with new customer
        )
        print(f"Stripe session created: {checkout_session.id}")
        return jsonify({'sessionId': checkout_session.id})

    except ValueError as auth_err:
        print(f"[/create-checkout-session] Authentication error: {auth_err}")
        return jsonify({"error": str(auth_err)}), 401
    except stripe.error.StripeError as e:
        print(f"Stripe error creating checkout session: {e}")
        return jsonify({'error': f'Stripe error: {str(e)}'}), 500
    except Exception as e:
        print(f"Error creating checkout session: {e}")
        traceback.print_exc()
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

# --- NEW: Stripe Webhook Endpoint ---
@app.route('/stripe-webhook', methods=['POST'])
def stripe_webhook():
    payload = request.data
    sig_header = request.headers.get('Stripe-Signature')
    event = None

    if not STRIPE_WEBHOOK_SECRET:
        print("Webhook Error: STRIPE_WEBHOOK_SECRET not set.")
        return jsonify({'error': 'Webhook secret not configured'}), 500

    print("\n--- Stripe Webhook Received ---")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
        print(f"Webhook Event Type: {event['type']}")
    except ValueError as e:
        # Invalid payload
        print(f"Webhook Error: Invalid payload - {e}")
        return jsonify({'error': 'Invalid payload'}), 400
    except stripe.error.SignatureVerificationError as e:
        # Invalid signature
        print(f"Webhook Error: Invalid signature - {e}")
        return jsonify({'error': 'Invalid signature'}), 400
    except Exception as e:
        print(f"Webhook Error: Unexpected error constructing event - {e}")
        return jsonify({'error': 'Webhook construction error'}), 500

    # --- Handle the event ---
    try:
        event_type = event['type']
        event_data = event['data']['object']

        # Handle the checkout.session.completed event
        if event_type == 'checkout.session.completed':
            session = event_data
            mongo_user_id = session.get('client_reference_id')
            stripe_customer_id = session.get('customer')
            stripe_subscription_id = session.get('subscription')

            print(f"Checkout session completed for Mongo User ID: {mongo_user_id}")
            print(f"  Stripe Customer ID: {stripe_customer_id}")
            print(f"  Stripe Subscription ID: {stripe_subscription_id}")

            if not mongo_user_id or not stripe_customer_id or not stripe_subscription_id:
                 print("Webhook Error: Missing required data in checkout.session.completed event.")
                 return jsonify({'error': 'Missing data in event'}), 400

            # Retrieve subscription details to get status and period end
            try:
                subscription = stripe.Subscription.retrieve(stripe_subscription_id)
                subscription_status = subscription.status
                # Convert Unix timestamp to datetime (UTC)
                subscription_expires_ts = subscription.current_period_end
                subscription_expires_dt = datetime.fromtimestamp(subscription_expires_ts, tz=timezone.utc) if subscription_expires_ts else None

                print(f"  Subscription Status: {subscription_status}")
                print(f"  Subscription Expires: {subscription_expires_dt}")

                # Update user document in MongoDB
                update_result = users_collection.update_one(
                    {"_id": ObjectId(mongo_user_id)}, # Use ObjectId to find user
                    {"$set": {
                        "tier": "paid",
                        "stripe_customer_id": stripe_customer_id,
                        "stripe_subscription_id": stripe_subscription_id,
                        "subscription_status": subscription_status,
                        "subscription_expires": subscription_expires_dt,
                        # Reset usage count upon successful upgrade
                        "requests_used_this_period": 0,
                        "period_start_date": datetime.utcnow() # Reset period start
                    }}
                )
                if update_result.matched_count == 0:
                     print(f"Webhook Error: User not found for Mongo ID: {mongo_user_id}")
                     # Consider logging this error more formally
                else:
                     print(f"User {mongo_user_id} updated to paid tier.")

            except stripe.error.StripeError as sub_err:
                print(f"Webhook Error: Failed to retrieve subscription {stripe_subscription_id}: {sub_err}")
                # Decide how to handle - maybe retry later or log for manual check
                return jsonify({'error': 'Failed to retrieve subscription details'}), 500
            except Exception as e:
                print(f"Webhook Error: Unexpected error updating user after checkout: {e}")
                traceback.print_exc()
                return jsonify({'error': 'Internal server error updating user'}), 500


        # Handle subscription deleted (canceled immediately or at period end)
        elif event_type in ['customer.subscription.deleted', 'customer.subscription.updated']:
            subscription = event_data
            stripe_subscription_id = subscription.id
            subscription_status = subscription.status # 'canceled', 'active', 'past_due', etc.
            cancel_at_period_end = subscription.cancel_at_period_end

            print(f"Subscription update/deleted event for Sub ID: {stripe_subscription_id}")
            print(f"  Status: {subscription_status}, Cancel at Period End: {cancel_at_period_end}")

            # Downgrade if the subscription is truly canceled or set to cancel at period end
            # We only downgrade if the status becomes 'canceled' or if cancel_at_period_end is true
            # We don't want to downgrade for other updates (e.g., payment method change)
            if subscription_status == 'canceled' or cancel_at_period_end:
                print(f"Downgrading user associated with subscription {stripe_subscription_id}")
                # Find user by subscription ID
                update_result = users_collection.update_one(
                    {"stripe_subscription_id": stripe_subscription_id},
                    {"$set": {
                        "tier": "free",
                        "subscription_status": "canceled" if subscription_status == 'canceled' else "ending", # Indicate if it's ending soon
                        # Keep stripe_subscription_id for history? Or clear? Let's keep it for now.
                        # "stripe_subscription_id": None,
                        "subscription_expires": None # Clear expiration as it's no longer active/renewing
                    }}
                )
                if update_result.matched_count == 0:
                     print(f"Webhook Warning: No user found for subscription ID {stripe_subscription_id} during downgrade.")
                else:
                     print(f"User associated with {stripe_subscription_id} downgraded/marked as ending.")
            elif subscription_status == 'active' and not cancel_at_period_end:
                 # Handle case where subscription was updated but remains active (e.g., plan change, payment update)
                 # Update expiration date and status just in case
                 subscription_expires_ts = subscription.current_period_end
                 subscription_expires_dt = datetime.fromtimestamp(subscription_expires_ts, tz=timezone.utc) if subscription_expires_ts else None
                 update_result = users_collection.update_one(
                    {"stripe_subscription_id": stripe_subscription_id},
                    {"$set": {
                        "subscription_status": subscription_status,
                        "subscription_expires": subscription_expires_dt
                    }}
                 )
                 if update_result.matched_count > 0:
                     print(f"Updated active subscription details for {stripe_subscription_id}.")


        # Handle successful invoice payment (useful for renewals)
        elif event_type == 'invoice.payment_succeeded':
            invoice = event_data
            stripe_subscription_id = invoice.get('subscription')
            stripe_customer_id = invoice.get('customer')

            # Check if it's for a subscription renewal/cycle
            if invoice.billing_reason == 'subscription_cycle' and stripe_subscription_id:
                print(f"Subscription {stripe_subscription_id} renewed (invoice paid).")
                # Retrieve subscription to update expiration date and ensure status is active
                try:
                    subscription = stripe.Subscription.retrieve(stripe_subscription_id)
                    subscription_expires_ts = subscription.current_period_end
                    subscription_expires_dt = datetime.fromtimestamp(subscription_expires_ts, tz=timezone.utc) if subscription_expires_ts else None
                    subscription_status = subscription.status # Should be 'active' after successful payment

                    update_result = users_collection.update_one(
                        {"stripe_subscription_id": stripe_subscription_id},
                        {"$set": {
                            "subscription_status": subscription_status,
                            "subscription_expires": subscription_expires_dt,
                            "tier": "paid" # Ensure tier is set to paid on renewal
                        }}
                    )
                    if update_result.matched_count > 0:
                        print(f"Updated subscription expiration/status for user associated with {stripe_subscription_id}.")
                    else:
                        print(f"Webhook Warning: User not found for subscription {stripe_subscription_id} during renewal update.")

                except stripe.error.StripeError as sub_err:
                    print(f"Webhook Error: Failed to retrieve subscription {stripe_subscription_id} during renewal: {sub_err}")
                    # Log error, but don't necessarily fail the webhook response
                except Exception as e:
                    print(f"Webhook Error: Unexpected error updating user after renewal: {e}")
                    traceback.print_exc()
                    # Log error

        # Handle failed payments (optional but recommended)
        elif event_type == 'invoice.payment_failed':
            invoice = event_data
            stripe_subscription_id = invoice.get('subscription')
            if stripe_subscription_id:
                print(f"Invoice payment failed for subscription {stripe_subscription_id}.")
                # Update user status to reflect payment issue (e.g., 'past_due')
                try:
                    subscription = stripe.Subscription.retrieve(stripe_subscription_id)
                    subscription_status = subscription.status # e.g., 'past_due'

                    update_result = users_collection.update_one(
                        {"stripe_subscription_id": stripe_subscription_id},
                        {"$set": {"subscription_status": subscription_status}}
                    )
                    if update_result.matched_count > 0:
                        print(f"Updated subscription status to '{subscription_status}' for user associated with {stripe_subscription_id}.")
                    else:
                        print(f"Webhook Warning: User not found for subscription {stripe_subscription_id} during payment failure update.")
                except stripe.error.StripeError as sub_err:
                     print(f"Webhook Error: Failed to retrieve subscription {stripe_subscription_id} after payment failure: {sub_err}")
                except Exception as e:
                     print(f"Webhook Error: Unexpected error updating user after payment failure: {e}")
                     traceback.print_exc()


        else:
            print(f"Unhandled event type {event_type}")

    except KeyError as e:
        print(f"Webhook Error: Missing expected key in event data - {e}")
        # Log the event data for debugging
        print("Event Data:", json.dumps(event, indent=2))
        return jsonify({'error': f'Missing key in event data: {e}'}), 400
    except Exception as e:
        print(f"Webhook Error: Error handling event {event.get('type', 'N/A')} - {e}")
        traceback.print_exc()
        # Return 500 but log the error; Stripe might retry.
        return jsonify({'error': 'Internal server error handling webhook'}), 500


    # Acknowledge receipt of the event
    return jsonify({'success': True}), 200
# --- End Stripe Webhook Endpoint ---


if __name__ == '__main__':
    is_debug = os.getenv("FLASK_DEBUG", "False").lower() in ("true", "1", "t")
    print(f"Running Flask app with debug={is_debug}")
    app.run(host='0.0.0.0', port=5000, debug=is_debug)