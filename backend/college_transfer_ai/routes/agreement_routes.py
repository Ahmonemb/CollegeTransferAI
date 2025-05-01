import traceback
import base64
import io
import fitz # PyMuPDF
from PIL import Image
from flask import Blueprint, jsonify, request, Response, current_app
from bson.objectid import ObjectId
from datetime import datetime, timezone # Import datetime
# Remove OpenAI import if not used
# from openai import OpenAI

# Import necessary functions/objects from other modules
from ..utils import verify_google_token, get_or_create_user, check_and_update_usage
# Use getter functions for all collections now
# from ..database import get_db, get_gridfs, get_agreement_summaries_collection # Removed get_agreement_summaries_collection
from ..database import get_db, get_gridfs # Updated import
from ..college_transfer_API import CollegeTransferAPI
# Import LLM service functions
from ..llm_service import generate_chat_response as llm_generate_chat_response, init_llm as llm_init_llm

# --- Remove Gemini-specific imports ---
# import google.generativeai as genai # Removed
# from PIL import Image # Keep PIL if used elsewhere (e.g., image processing)
# import io # Keep io if used elsewhere (e.g., image processing)
# --- End Remove Gemini-specific imports ---

FREE_TIER_LIMIT = 10
PREMIUM_TIER_LIMIT = 200 # Example limit for paid users

agreement_bp = Blueprint('agreement_bp', __name__)

# --- Remove Gemini Initialization ---
# gemini_model = None # Removed
# safety_settings = [...] # Removed
# generation_config = ... # Removed
# def init_gemini(): # Removed
#     global gemini_model
#     # ... removed initialization logic ...
# --- End Remove Gemini Initialization ---

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
    # sending_ids = data.get('sending_ids') # Expecting a list - Changed key name
    sending_ids = data.get('sendingInstitutionIds') # Match frontend key
    # receiving_id = data.get('receiving_id') # Changed key name
    receiving_id = data.get('receivingInstitutionId') # Match frontend key
    # year_id = data.get('year_id') # Changed key name
    year_id = data.get('academicYearId') # Match frontend key
    major_key = data.get('majorKey') # Match frontend key

    if not sending_ids or not isinstance(sending_ids, list) or not receiving_id or not year_id or not major_key:
        # return jsonify({"error": "Missing or invalid parameters (sending_ids list, receiving_id, year_id, major_key)"}), 400
        return jsonify({"error": "Missing or invalid parameters (sendingInstitutionIds list, receivingInstitutionId, academicYearId, majorKey)"}), 400


    results = []
    errors = []

    for sending_id in sending_ids:
        sending_name = f"ID {sending_id}" # Default name
        try:
            # Fetch name first (assuming it's less likely to fail than PDF fetch)
            try:
                 # Ensure ID is integer if API expects it
                 sending_name = api.get_institution_name(int(sending_id)) or sending_name
            except Exception as name_err:
                 print(f"Warning: Could not fetch name for sending ID {sending_id}: {name_err}")

            # Ensure IDs are integers if API expects it
            pdf_filename = api.get_articulation_agreement(int(year_id), int(sending_id), int(receiving_id), major_key)


            results.append({
                 "sendingId": sending_id, # Keep original ID format from request
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
                 "sendingId": sending_id, # Keep original ID format from request
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

# --- NEW IGETC Route ---
@agreement_bp.route('/igetc-agreement', methods=['GET'])
def get_igetc_agreement_route():
    """
    Fetches the IGETC agreement PDF filename for a given sending institution and year.
    """
    academic_year_id = request.args.get('academicYearId')
    sending_institution_id = request.args.get('sendingId')

    if not academic_year_id or not sending_institution_id:
        return jsonify({"error": "Missing required parameters (academicYearId, sendingId)"}), 400

    try:
        # Convert IDs to integers if necessary (depends on your API method)
        year_id = int(academic_year_id)
        sending_id = int(sending_institution_id)

        print(f"Fetching IGETC agreement for Sending ID: {sending_id}, Year ID: {year_id}")
        pdf_filename = api.get_igetc_courses(year_id, sending_id)

        if pdf_filename:
            print(f"Found/Generated IGETC PDF: {pdf_filename}")
            return jsonify({"pdfFilename": pdf_filename}), 200
        else:
            print(f"Could not find or generate IGETC PDF for Sending ID: {sending_id}, Year ID: {year_id}")
            return jsonify({"error": "IGETC agreement not found or could not be generated."}), 404

    except ValueError:
        return jsonify({"error": "Invalid ID format. IDs must be integers."}), 400
    except Exception as e:
        error_msg = f"Error fetching IGETC agreement for Sending ID {sending_institution_id}: {e}"
        print(error_msg)
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch IGETC agreement.", "details": str(e)}), 500
# --- End NEW IGETC Route ---

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
    """Serves an image file directly from GridFS."""
    fs = get_gridfs() # Get GridFS instance
    try:
        grid_out = fs.find_one({"filename": filename})
        if not grid_out:
            return jsonify({"error": "Image not found"}), 404

        response = Response(grid_out.read(), mimetype=grid_out.contentType)
        # Optional: Add cache headers
        # response.headers['Cache-Control'] = 'public, max-age=3600' # Cache for 1 hour
        return response
    except Exception as e:
        print(f"Error serving image {filename}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to serve image"}), 500

# --- Chat Endpoint ---
@agreement_bp.route('/chat', methods=['POST'])
@verify_google_token
def handle_chat(user_info):
    llm_init_llm()

    data = request.get_json()
    new_message = data.get('new_message')
    history = data.get('history', [])
    # Always try to get image_filenames from the request
    image_filenames = data.get('image_filenames') # Could be None or []

    if not new_message:
        return jsonify({"error": "No message provided"}), 400

    user_id = user_info.get('user_id')
    if not user_id:
         return jsonify({"error": "User ID not found in token"}), 401

    usage_allowed, usage_message = check_and_update_usage(user_id)
    if not usage_allowed:
        return jsonify({"error": usage_message}), 429

    # --- Simplified Logic ---
    # No longer need to distinguish initial vs. follow-up for image handling here
    print(f"Handling chat message. Including {len(image_filenames) if image_filenames else 0} images.")

    try:
        # Call the imported LLM function, always passing image_filenames
        # The llm_service function will handle if image_filenames is None or empty
        llm_reply = llm_generate_chat_response(new_message, history, image_filenames)

        if llm_reply and not llm_reply.startswith("[LLM response blocked"):
            return jsonify({"reply": llm_reply})
        elif llm_reply: # Handle block message
             print(f"LLM response blocked: {llm_reply}")
             # Return a user-friendly error, maybe masking the specific block reason
             return jsonify({"error": "Failed to get response due to content restrictions."}), 500
             # Or return the specific block message if desired:
             # return jsonify({"error": f"Failed to get response: {llm_reply}"}), 500
        else:
            # Handle LLM generation failure (returned None)
            return jsonify({"error": "Failed to get response from LLM."}), 500

    except Exception as e:
        print(f"Error during chat processing: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Server error during chat: {e}"}), 500
