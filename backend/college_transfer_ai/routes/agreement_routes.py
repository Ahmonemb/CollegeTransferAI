import traceback
import base64
import io
import fitz # PyMuPDF
from PIL import Image
from flask import Blueprint, jsonify, request, Response, current_app, send_file, make_response
from bson.objectid import ObjectId
# Remove OpenAI import if not used
# from openai import OpenAI

# Import necessary functions/objects from other modules
from ..utils import verify_google_token, get_or_create_user, check_and_update_usage
from ..database import get_db, get_gridfs # Use getter functions
from ..college_transfer_API import CollegeTransferAPI

# --- Google AI Imports ---
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
# --- End Google AI Imports ---

FREE_TIER_LIMIT = 10
PREMIUM_TIER_LIMIT = 50 # Example limit for paid users

agreement_bp = Blueprint('agreement_bp', __name__)

# --- Initialize Gemini ---
# Store model in app context instead of global? For now, global is simpler.
gemini_model = None
def init_gemini(api_key):
    global gemini_model
    if not api_key:
        print("Warning: GOOGLE_API_KEY not set. Gemini features will be disabled.")
        return
    try:
        genai.configure(api_key=api_key)
        # Consider making model name configurable
        gemini_model = genai.GenerativeModel('gemini-2.5-flash-preview-04-17')
        print("--- Gemini Initialized Successfully ---")
    except Exception as e:
        print(f"!!! Gemini Initialization Error: {e}")
        gemini_model = None # Ensure it's None if init fails

# --- API Instance ---
# Initialize CollegeTransferAPI here or in create_app if needed globally
api = CollegeTransferAPI()

# --- Routes ---
@agreement_bp.route('/', methods=['GET'])
def home():
    # This might conflict if other blueprints also define '/', consider removing or using a specific path like '/api'
    return jsonify({"message": "Welcome to the College Transfer AI Backend (Agreement Routes)!"})

@agreement_bp.route('/institutions', methods=['GET'])
def get_institutions():
    try:
        institutions = api.get_sending_institutions()
        return jsonify(institutions)
    except Exception as e:
        print(f"Error fetching institutions: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch institutions"}), 500

@agreement_bp.route('/receiving-institutions', methods=['GET'])
def get_receiving_institutions():
    sending_institution_id = request.args.get('sendingId')
    if not sending_institution_id:
        return jsonify({"error": "Missing sendingId parameter"}), 400
    try:
        institutions = api.get_receiving_institutions(sending_institution_id)
        return jsonify(institutions)
    except Exception as e:
        print(f"Error fetching receiving institutions for {sending_institution_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch receiving institutions"}), 500

@agreement_bp.route('/academic-years', methods=['GET'])
def get_academic_years():
    sending_institution_id = request.args.get('sendingId')
    receiving_institution_id = request.args.get('receivingId')
    print(f"Received sendingId: {sending_institution_id}, receivingId: {receiving_institution_id}")
    if not sending_institution_id or not receiving_institution_id:
        return jsonify({"error": "Missing sendingInstitutionId or receivingInstitutionId parameter"}), 400
    try:
        years = api.get_academic_years(int(sending_institution_id), int(receiving_institution_id))
        return jsonify(years)
    except Exception as e:
        print(f"Error fetching academic years for {sending_institution_id} -> {receiving_institution_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch academic years"}), 500

@agreement_bp.route('/majors', methods=['GET'])
def get_majors():
    sending_institution_id = request.args.get('sendingId')
    receiving_institution_id = request.args.get('receivingId')
    academic_year_id = request.args.get('academicYearId')
    category_code = request.args.get('categoryCode', 'major') # Default to major

    if not sending_institution_id or not receiving_institution_id or not academic_year_id:
        return jsonify({"error": "Missing required parameters (sending, receiving, year)"}), 400

    try:
        majors = api.get_majors_or_departments(
            sending_institution_id,
            receiving_institution_id,
            academic_year_id,
            category_code
        )
        return jsonify(majors)
    except Exception as e:
        print(f"Error fetching {category_code}s: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to fetch {category_code}s"}), 500

@agreement_bp.route('/articulation-agreements', methods=['POST'])
def get_articulation_agreements():
    data = request.get_json()
    sending_ids = data.get('sending_ids') # Expecting a list
    receiving_id = data.get('receiving_id')
    year_id = data.get('year_id')
    major_key = data.get('major_key')

    if not sending_ids or not isinstance(sending_ids, list) or not receiving_id or not year_id or not major_key:
        return jsonify({"error": "Missing or invalid parameters (sending_ids list, receiving_id, year_id, major_key)"}), 400

    results = []
    errors = []

    for sending_id in sending_ids:
        sending_name = f"ID {sending_id}" # Default name
        try:
            # Fetch name first (assuming it's less likely to fail than PDF fetch)
            try:
                 sending_name = api.get_institution_name(sending_id) # Hypothetical method
            except Exception as name_err:
                 print(f"Warning: Could not fetch name for sending ID {sending_id}: {name_err}")

            pdf_filename = api.get_articulation_agreement(year_id, sending_id, receiving_id, major_key)

            results.append({
                 "sendingId": sending_id,
                 "sendingName": sending_name,
                 "pdfFilename": pdf_filename # Will be None if not found
            })
            if not pdf_filename:
                 print(f"No agreement PDF found for Sending ID {sending_id} / Major {major_key}.")
                 # No need to add to errors list if it's just 'not found'

        except Exception as e:
            error_msg = f"Error fetching agreement for Sending ID {sending_id}: {e}"
            print(error_msg)
            traceback.print_exc()
            errors.append(error_msg)
            # Add entry with error status? Or just rely on errors list?
            # For now, just add to errors list. The loop continues.
            # Ensure name is included even on error
            results.append({
                 "sendingId": sending_id,
                 "sendingName": sending_name,
                 "pdfFilename": None,
                 "error": str(e) # Add error detail to the specific item
            })


    if not results and errors:
         # If only errors occurred across all attempts
         return jsonify({"error": "Failed to fetch any agreements.", "details": errors}), 500
    elif errors:
         # If some succeeded and some failed
         print(f"Partial success fetching agreements. Errors: {errors}")
         # Return the results including those with errors, plus a general warning
         return jsonify({"agreements": results, "warnings": errors}), 207 # Multi-Status
    elif not any(item.get('pdfFilename') for item in results):
         # If no errors but also no PDFs found for any sending ID
         return jsonify({"agreements": results, "message": "No articulation agreements found for the selected criteria."}), 200 # Or 404? 200 is okay.
    else:
         # At least one PDF found, potentially with other non-PDF results or errors handled above
         return jsonify({"agreements": results}), 200


@agreement_bp.route('/pdf-images/<path:filename>', methods=['GET'])
def get_pdf_images(filename):
    """
    Checks if images for a PDF exist in GridFS. If not, generates, stores,
    and returns them. If they exist, returns the existing filenames.
    """
    fs = get_gridfs() # Get GridFS instance

    try:
        # Check if images already exist (using metadata)
        existing_images = list(fs.find({"metadata.original_pdf": filename, "contentType": "image/png"}))

        if existing_images:
            image_filenames = [img.filename for img in existing_images]
            # Sort filenames numerically based on page number in metadata
            try:
                image_filenames.sort(key=lambda f: fs.find_one({"filename": f}).metadata.get("page_number", float('inf')))
            except Exception as sort_err:
                print(f"Warning: Could not sort images by page number metadata for {filename}: {sort_err}. Using alphabetical sort.")
                image_filenames.sort() # Fallback sort

            print(f"Found {len(image_filenames)} existing images for {filename}")
            return jsonify({"image_filenames": image_filenames})

        # If images don't exist, generate them
        print(f"Generating images for {filename}...")
        # 1. Retrieve PDF from GridFS
        grid_out = fs.find_one({"filename": filename})
        if not grid_out:
            return jsonify({"error": f"PDF file '{filename}' not found in storage."}), 404

        pdf_data = grid_out.read()

        # 2. Generate images using PyMuPDF
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        image_filenames = []
        zoom = 2 # Increase zoom for higher resolution (2 = 200%)
        mat = fitz.Matrix(zoom, zoom)
        generated_files_metadata = [] # Store metadata for sorting later

        for i, page in enumerate(doc):
            try:
                pix = page.get_pixmap(matrix=mat)
                img_bytes = pix.tobytes("png") # Output as PNG

                # Create a unique filename for the image page
                image_filename = f"{filename}_page_{i}.png"

                # Store image in GridFS with metadata linking to original PDF
                fs.put(
                    img_bytes,
                    filename=image_filename,
                    contentType="image/png",
                    metadata={"original_pdf": filename, "page_number": i}
                )
                generated_files_metadata.append({"filename": image_filename, "page_number": i})
            except Exception as page_err:
                 print(f"Error processing page {i} for {filename}: {page_err}")
                 # Decide if you want to skip the page or fail the whole process
                 # For now, skip the page and continue
                 # return jsonify({"error": f"Failed to process page {i} of PDF '{filename}'"}), 500

        doc.close()
        # Sort the generated filenames based on page number
        generated_files_metadata.sort(key=lambda x: x["page_number"])
        image_filenames = [item["filename"] for item in generated_files_metadata]

        print(f"Stored {len(image_filenames)} images for {filename}")
        return jsonify({"image_filenames": image_filenames})

    except Exception as e:
        print(f"Error getting/generating images for {filename}: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to process PDF '{filename}': {str(e)}"}), 500

@agreement_bp.route('/image/<path:filename>', methods=['GET'])
def get_image(filename):
    """Serves an image file directly from GridFS with cache headers."""
    fs = get_gridfs() # Get GridFS instance
    grid_out = None
    try:
        grid_out = fs.find_one({"filename": filename})
        if not grid_out:
            return jsonify({"error": "Image not found"}), 404

        # Create a file-like object from the GridFS data
        image_data_stream = io.BytesIO(grid_out.read())

        # Create a response object using send_file
        response = make_response(send_file(
            image_data_stream,
            mimetype=grid_out.contentType or 'image/png', # Use stored content type or default
            as_attachment=False, # Serve inline
            download_name=grid_out.filename # Optional: helps browser name if saved
        ))

        # --- Add Cache-Control Header ---
        response.headers['Cache-Control'] = 'public, max-age=8640000'

        return response

    except Exception as e:
        print(f"Error serving image {filename}: {e}")
        traceback.print_exc()
        # Note: grid_out.read() reads the whole file, no explicit close needed here
        return jsonify({"error": "Failed to serve image"}), 500
    # finally: # GridFS find_one().read() doesn't require explicit closing like open_download_stream
        # if grid_out and hasattr(grid_out, 'close'): # Check if grid_out is a file-like object that needs closing
        #     grid_out.close() # This block is likely not needed with find_one().read()


# --- Chat Endpoint ---
@agreement_bp.route('/chat', methods=['POST'])
def chat_endpoint():
    config = current_app.config['APP_CONFIG']
    GOOGLE_CLIENT_ID = config.get('GOOGLE_CLIENT_ID')
    # GOOGLE_API_KEY is implicitly used by genai.configure in init_gemini

    if not GOOGLE_CLIENT_ID:
         return jsonify({"error": "Google Client ID not configured."}), 500
    if not gemini_model: # Check if Gemini was initialized
         return jsonify({"error": "Chat feature disabled: Gemini model not available."}), 503 # Service Unavailable

    fs = get_gridfs() # Get GridFS instance

    # 1. Authentication & Authorization
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token, GOOGLE_CLIENT_ID)
        user_data = get_or_create_user(user_info)

        # 2. Rate Limiting / Usage Check
        if not check_and_update_usage(user_data):
            # Prepare message about limit exceeded, including reset time
            from datetime import datetime, timedelta, time, timezone # Ensure imports
            now = datetime.now(timezone.utc)
            tomorrow = now.date() + timedelta(days=1)
            tomorrow_midnight_utc = datetime.combine(tomorrow, time(0, 0), tzinfo=timezone.utc)
            reset_time_str = tomorrow_midnight_utc.strftime('%Y-%m-%d %H:%M:%S %Z')
            limit = PREMIUM_TIER_LIMIT if user_data.get('tier') == 'premium' else FREE_TIER_LIMIT
            return jsonify({
                "error": f"Usage limit ({limit} requests/day) exceeded for your tier ('{user_data.get('tier')}'). Please try again after {reset_time_str}."
            }), 429 # Too Many Requests

    except ValueError as auth_err:
        return jsonify({"error": str(auth_err)}), 401
    except Exception as usage_err:
        # Handle potential errors from check_and_update_usage (e.g., DB error)
        print(f"Error during usage check: {usage_err}")
        traceback.print_exc()
        return jsonify({"error": "Could not verify usage limits."}), 500

    # 3. Process Request Data
    data = request.get_json()
    if not data or 'new_message' not in data:
        return jsonify({"error": "Missing 'new_message' in request body"}), 400

    new_message_text = data['new_message']
    history = data.get('history', []) # List of {'role': 'user'/'assistant', 'content': '...'}
    image_filenames = data.get('image_filenames', []) # Only expected for initial analysis

    # 4. Prepare Content for Gemini
    prompt_parts = []

    # Add image data if provided (for initial analysis)
    if image_filenames:
        print(f"Processing {len(image_filenames)} images for chat...")
        image_mime_type = "image/png" # Assuming PNG from our generation step
        for img_filename in image_filenames:
            try:
                grid_out = fs.find_one({"filename": img_filename})
                if grid_out:
                    image_data = grid_out.read()
                    prompt_parts.append({"mime_type": image_mime_type, "data": image_data})
                else:
                    print(f"Warning: Image '{img_filename}' not found in GridFS.")
            except Exception as img_err:
                print(f"Error reading image '{img_filename}' from GridFS: {img_err}")
                # Decide how to handle missing images - skip or return error?
                # For now, just skip the missing image
                # return jsonify({"error": f"Failed to load image {img_filename}"}), 500

    # Add the latest user message text
    prompt_parts.append(new_message_text)

    # 5. Call Gemini API
    try:
        print("Sending request to Gemini...")
        # Construct conversation history for the API
        api_history = []
        for msg in history:
             # Map 'assistant' role from frontend/db to 'model' for Gemini API
             role = 'model' if msg.get('role') == 'assistant' else msg.get('role')
             # Ensure role is valid and content exists
             if role in ['user', 'model'] and msg.get('content'):
                 api_history.append({'role': role, 'parts': [msg['content']]})

        # Start chat session if history exists
        chat_session = gemini_model.start_chat(history=api_history)
        response = chat_session.send_message(
            prompt_parts,
            stream=False, # Set to True for streaming response
            safety_settings={ # Adjust safety settings as needed
                HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            }
        )

        # Check for safety blocks or empty response
        if not response.parts:
             # Investigate response.prompt_feedback if needed
             print("Gemini response blocked or empty. Feedback:", response.prompt_feedback)
             try:
                 # Attempt to access safety ratings safely
                 safety_feedback = response.prompt_feedback.safety_ratings if response.prompt_feedback else "No feedback available."
             except Exception as feedback_err:
                 safety_feedback = f"Error accessing feedback: {feedback_err}"
             return jsonify({"error": "Response blocked due to safety settings or empty response.", "details": str(safety_feedback)}), 400

        reply_text = response.text
        print("Received reply from Gemini.")
        return jsonify({"reply": reply_text})

    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        traceback.print_exc()
        # Provide a more generic error to the user
        return jsonify({"error": "Failed to get response from AI assistant."}), 500
    
# --- NEW: IGETC Agreement Endpoint ---
@agreement_bp.route('/igetc-agreement', methods=['GET'])
def get_igetc_agreement():
    # --- Optional: Add Authentication/Authorization ---
    config = current_app.config['APP_CONFIG']
    GOOGLE_CLIENT_ID = config.get('GOOGLE_CLIENT_ID')
    if not GOOGLE_CLIENT_ID:
         return jsonify({"error": "Google Client ID not configured."}), 500

    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token, GOOGLE_CLIENT_ID)
        # You might not need get_or_create_user here if just checking validity
        if not user_info:
             raise ValueError("Invalid token or user not found.")
    except ValueError as auth_err:
        return jsonify({"error": str(auth_err)}), 401
    except Exception as e:
        print(f"Error during IGETC auth check: {e}")
        traceback.print_exc()
        return jsonify({"error": "Authentication failed."}), 500
    # --- End Optional Auth ---

    sending_institution_id = request.args.get('sendingId')
    academic_year_id = request.args.get('academicYearId')

    if not sending_institution_id or not academic_year_id:
        return jsonify({"error": "Missing sendingId or academicYearId parameter"}), 400

    try:
        # Assuming api is your CollegeTransferAPI instance
        pdf_filename = api.get_igetc_courses(int(academic_year_id), int(sending_institution_id))

        if pdf_filename:
            return jsonify({"pdfFilename": pdf_filename}), 200
        else:
            # Distinguish between "not found" and an error during fetch/save
            # The get_igetc_courses function should ideally return None if not found
            # and raise an exception for other errors, but we'll handle None here.
            return jsonify({"error": "IGETC agreement PDF not found or could not be generated."}), 404

    except ValueError:
         return jsonify({"error": "Invalid ID format. IDs must be integers."}), 400
    except Exception as e:
        print(f"Error fetching IGETC agreement for {sending_institution_id} / {academic_year_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch IGETC agreement"}), 500
# --- End IGETC Endpoint ---