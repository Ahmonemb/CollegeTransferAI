import traceback
from flask import Blueprint, jsonify, request, current_app
# Import the specific PDF fetching function
from ..pdf_service import PdfService
from ..utils import verify_google_token
# Import the Assist API client if needed by PdfService initialization (check your __init__.py or app factory)
from ..assist_api_client import assist_client # Assuming you have this

igetc_bp = Blueprint('igetc_bp', __name__)

# Initialize PdfService instance - This might be done in your app factory (__init__.py) instead.
# If it's initialized globally in the app factory and passed via current_app.extensions or similar,
# you would access it differently, e.g., pdf_service = current_app.extensions['pdf_service']
# For this example, we assume direct instantiation here or that it's correctly imported.
pdf_service = PdfService(assist_client) # Ensure assist_client is available

@igetc_bp.route('/igetc-agreement', methods=['GET'])
def get_igetc_agreement():
    # --- Authentication/Authorization ---
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
        if not user_info:
             raise ValueError("Invalid token or user not found.")
    except ValueError as auth_err:
        return jsonify({"error": str(auth_err)}), 401
    except Exception as e:
        print(f"Error during IGETC auth check: {e}")
        traceback.print_exc()
        return jsonify({"error": "Authentication failed."}), 500
    # --- End Auth ---

    sending_institution_id = request.args.get('sendingId')
    academic_year_id = request.args.get('academicYearId')

    if not sending_institution_id or not academic_year_id:
        return jsonify({"error": "Missing sendingId or academicYearId parameter"}), 400

    try:
        # Call the correct function from the pdf_service instance
        pdf_filename = pdf_service.get_igetc_courses( # Changed function call
            int(academic_year_id), int(sending_institution_id)
        )

        if pdf_filename:
            return jsonify({"pdfFilename": pdf_filename}), 200
        else:
            # pdf_service handles logging, return appropriate error
            return jsonify({"error": "IGETC agreement PDF not found or could not be generated/saved."}), 404 # Or 500 if it implies an error

    except ValueError:
         return jsonify({"error": "Invalid ID format. IDs must be integers."}), 400
    except Exception as e:
        print(f"Error processing IGETC request for {sending_institution_id} / {academic_year_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to process IGETC agreement request"}), 500
