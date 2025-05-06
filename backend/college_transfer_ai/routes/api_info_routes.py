# filepath: backend/college_transfer_ai/routes/api_info_routes.py
import traceback
from flask import Blueprint, jsonify, request, make_response
# Import the client instance and the helper function
from ..assist_api_client import assist_client
from ..utils import calculate_intersection # Moved to utils

api_info_bp = Blueprint('api_info_bp', __name__)

@api_info_bp.route('/institutions', methods=['GET'])
def get_institutions():
    try:
        # Use the imported client instance
        institutions = assist_client.get_sending_institutions()
        return jsonify(institutions)
    except Exception as e:
        print(f"Error fetching institutions: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch institutions"}), 500

@api_info_bp.route('/receiving-institutions', methods=['GET'])
def get_receiving_institutions():
    """
    Gets common receiving institutions for one or more sending institutions.
    Accepts comma-separated 'sendingId' query parameter.
    """
    sending_ids_str = request.args.get('sendingId')
    if not sending_ids_str:
        return jsonify({"error": "Missing required parameter 'sendingId'"}), 400

    sending_ids = [s_id.strip() for s_id in sending_ids_str.split(',') if s_id.strip()]
    if not sending_ids:
        return jsonify({"error": "Invalid 'sendingId' parameter"}), 400

    try:
        all_results = []
        errors = []
        for s_id in sending_ids:
            try:
                # Use the imported client instance
                data = assist_client.get_receiving_institutions(s_id)
                all_results.append(data or {})
            except Exception as e:
                print(f"Error fetching receiving institutions for sender {s_id}: {e}")
                errors.append({"sendingId": s_id, "error": str(e)})
                all_results.append({})

        if not all_results and errors:
             return jsonify({"error": "Failed to fetch receiving institutions for all senders.", "details": errors}), 500

        # Use imported calculate_intersection
        intersection = calculate_intersection(all_results)

        response_data = intersection
        status_code = 200
        if errors:
            response_data = {"institutions": intersection, "warnings": errors}
            status_code = 207 # Multi-Status

        response = make_response(jsonify(response_data), status_code)
        response.headers['Cache-Control'] = 'public, max-age=3600000'
        return response

    except Exception as e:
        print(f"Error processing receiving institutions intersection: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to process receiving institutions"}), 500

@api_info_bp.route('/academic-years', methods=['GET'])
def get_academic_years():
    """
    Gets common academic years for one or more sending institutions and one receiving institution.
    Accepts comma-separated 'sendingId' and single 'receivingId'.
    """
    sending_ids_str = request.args.get('sendingId')
    receiving_id = request.args.get('receivingId')

    if not sending_ids_str or not receiving_id:
        return jsonify({"error": "Missing required parameters 'sendingId' and 'receivingId'"}), 400

    sending_ids = [s_id.strip() for s_id in sending_ids_str.split(',') if s_id.strip()]
    if not sending_ids:
        return jsonify({"error": "Invalid 'sendingId' parameter"}), 400

    try:
        all_results = []
        errors = []
        for s_id in sending_ids:
            try:
                # Use the imported client instance
                data = assist_client.get_academic_years(s_id, receiving_id)
                all_results.append(data or {})
            except Exception as e:
                print(f"Error fetching academic years for sender {s_id}, receiver {receiving_id}: {e}")
                errors.append({"sendingId": s_id, "receivingId": receiving_id, "error": str(e)})
                all_results.append({})

        if not all_results and errors:
             return jsonify({"error": "Failed to fetch academic years for all combinations.", "details": errors}), 500

        # Use imported calculate_intersection
        intersection = calculate_intersection(all_results)

        response_data = intersection
        status_code = 200
        if errors:
            response_data = {"years": intersection, "warnings": errors}
            status_code = 207 # Multi-Status

        response = make_response(jsonify(response_data), status_code)
        response.headers['Cache-Control'] = 'public, max-age=3600000'
        return response

    except Exception as e:
        print(f"Error processing academic years intersection: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to process academic years"}), 500

@api_info_bp.route('/majors', methods=['GET'])
def get_majors():
    sending_institution_id = request.args.get('sendingId')
    receiving_institution_id = request.args.get('receivingId')
    academic_year_id = request.args.get('academicYearId')
    category_code = request.args.get('categoryCode', 'major') # Default to major

    if not sending_institution_id or not receiving_institution_id or not academic_year_id:
        return jsonify({"error": "Missing required parameters (sending, receiving, year)"}), 400

    try:
        # Use the imported client instance
        majors = assist_client.get_majors_or_departments(
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
