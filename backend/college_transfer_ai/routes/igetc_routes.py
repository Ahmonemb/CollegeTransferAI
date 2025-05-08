import traceback
from flask import Blueprint, jsonify, request, current_app
from ..pdf_service import PdfService
from ..utils import verify_google_token
from ..assist_api_client import assist_client 

igetc_bp = Blueprint('igetc_bp', __name__)

pdf_service = PdfService(assist_client) 

@igetc_bp.route('/igetc-agreement', methods=['GET'])
def get_igetc_agreement():
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

    sending_institution_id = request.args.get('sendingId')
    academic_year_id = request.args.get('academicYearId')

    if not sending_institution_id or not academic_year_id:
        return jsonify({"error": "Missing sendingId or academicYearId parameter"}), 400

    try:
        pdf_filename = pdf_service.get_igetc_courses( 
            int(academic_year_id), int(sending_institution_id)
        )

        if pdf_filename:
            return jsonify({"pdfFilename": pdf_filename}), 200
        else:
            return jsonify({"error": "IGETC agreement PDF not found or could not be generated/saved."}), 404 

    except ValueError:
         return jsonify({"error": "Invalid ID format. IDs must be integers."}), 400
    except Exception as e:
        print(f"Error processing IGETC request for {sending_institution_id} / {academic_year_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to process IGETC agreement request"}), 500
