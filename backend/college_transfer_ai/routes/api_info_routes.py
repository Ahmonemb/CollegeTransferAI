import traceback
from flask import Blueprint, jsonify, request, current_app
from ..assist_api_client import assist_client
from ..utils import calculate_intersection

api_info_bp = Blueprint('api_info_bp', __name__)

@api_info_bp.route('/institutions', methods=['GET'])
def get_institutions():
    try:
        institutions = assist_client.get_institutions()
        if institutions:
            return jsonify(institutions), 200
        else:
            return jsonify({"error": "Failed to fetch institutions from Assist.org"}), 502
    except Exception as e:
        print(f"Error fetching institutions: {e}")
        traceback.print_exc()
        return jsonify({"error": "An internal error occurred"}), 500

@api_info_bp.route('/academic-years', methods=['GET'])
def get_academic_years_route():
    sending_id_str = request.args.get('sendingId')
    receiving_id_str = request.args.get('receivingId')

    if not sending_id_str or not receiving_id_str:
        return jsonify({"error": "Missing sendingId or receivingId parameter"}), 400

    try:
        sending_ids = [int(id_str) for id_str in sending_id_str.split(',')]
        receiving_id = int(receiving_id_str)
    except ValueError:
        return jsonify({"error": "Invalid ID format. IDs must be integers."}), 400

    all_results = []
    errors = []
    warnings = []

    for s_id in sending_ids:
        try:
            years = assist_client.get_academic_years(s_id)
            if years:
                all_results.append(years)
            else:
                warnings.append(f"No academic years found for sending institution {s_id}.")
        except Exception as e:
            error_msg = f"Error fetching academic years for sending institution {s_id}: {e}"
            print(error_msg)
            traceback.print_exc()
            errors.append(error_msg)

    try:
        receiving_years = assist_client.get_academic_years(receiving_id)
        if receiving_years:
            all_results.append(receiving_years)
        else:
            warnings.append(f"No academic years found for receiving institution {receiving_id}.")
    except Exception as e:
        error_msg = f"Error fetching academic years for receiving institution {receiving_id}: {e}"
        print(error_msg)
        traceback.print_exc()
        errors.append(error_msg)

    if errors and not all_results:
        return jsonify({"error": "Failed to fetch any academic years.", "details": errors}), 502

    common_years = calculate_intersection(all_results)

    response_data = {"years": common_years}
    status_code = 200

    if warnings:
        response_data["warnings"] = warnings
        if not common_years:
            status_code = 207 
    if errors:
        response_data["errors"] = errors
        status_code = 207 if common_years else 500 

    if not common_years and not warnings and not errors:
        response_data["message"] = "No common academic years found for the selected combination."

    return jsonify(response_data), status_code


@api_info_bp.route('/majors', methods=['GET'])
def get_majors_route():
    sending_id_str = request.args.get('sendingId')
    receiving_id_str = request.args.get('receivingId')
    year_id_str = request.args.get('yearId')

    if not sending_id_str or not receiving_id_str or not year_id_str:
        return jsonify({"error": "Missing sendingId, receivingId, or yearId parameter"}), 400

    try:
        sending_ids = [int(id_str) for id_str in sending_id_str.split(',')]
        receiving_id = int(receiving_id_str)
        year_id = int(year_id_str)
    except ValueError:
        return jsonify({"error": "Invalid ID format. IDs must be integers."}), 400

    all_majors_results = []
    errors = []
    warnings = []

    for s_id in sending_ids:
        try:
            majors = assist_client.get_agreements(receiving_id, s_id, year_id)
            if majors and majors.get('reports'):
                all_majors_results.append(majors)
            else:
                warnings.append(f"No majors found for sending institution {s_id} with receiving {receiving_id} for year {year_id}.")
        except Exception as e:
            error_msg = f"Error fetching majors for sending institution {s_id}: {e}"
            print(error_msg)
            traceback.print_exc()
            errors.append(error_msg)

    if errors and not all_majors_results:
        return jsonify({"error": "Failed to fetch any majors.", "details": errors}), 502

    if not all_majors_results:
        response_data = {"majors": [], "message": "No majors found for the selected criteria."}
        if warnings: response_data["warnings"] = warnings
        if errors: response_data["errors"] = errors
        return jsonify(response_data), 200 if not errors else 500

    combined_majors = {}
    if len(sending_ids) == 1 and all_majors_results:
        combined_majors = {report['label']: report['key'] for report in all_majors_results[0].get('reports', [])}
    else:
        major_label_to_keys = {}
        for result_set in all_majors_results:
            for report in result_set.get('reports', []):
                label = report['label']
                key = report['key']
                if label not in major_label_to_keys:
                    major_label_to_keys[label] = []
                major_label_to_keys[label].append(key)
        
        for label, keys in major_label_to_keys.items():
            if len(keys) == len(sending_ids):
                combined_majors[label] = keys[0]

    response_data = {"majors": combined_majors}
    status_code = 200

    if warnings:
        response_data["warnings"] = warnings
        if not combined_majors:
            status_code = 207
    if errors:
        response_data["errors"] = errors
        status_code = 207 if combined_majors else 500
    
    if not combined_majors and not warnings and not errors:
         response_data["message"] = "No common majors found across all selected sending institutions for the specified receiving institution and year."

    return jsonify(response_data), status_code
