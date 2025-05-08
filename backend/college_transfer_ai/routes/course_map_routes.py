import uuid
import traceback
from flask import Blueprint, jsonify, request, current_app
from bson.objectid import ObjectId
from datetime import datetime, timezone

from ..utils import verify_google_token, get_or_create_user
from ..database import get_course_maps_collection

course_map_bp = Blueprint('course_map_bp', __name__)

@course_map_bp.route('/course-maps', methods=['POST'])
def save_course_map():
    config = current_app.config['APP_CONFIG']
    GOOGLE_CLIENT_ID = config.get('GOOGLE_CLIENT_ID')
    if not GOOGLE_CLIENT_ID:
         return jsonify({"error": "Google Client ID not configured."}), 500

    course_maps_collection = get_course_maps_collection()

    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token, GOOGLE_CLIENT_ID)
        user_data = get_or_create_user(user_info)
        google_user_id = user_data['google_user_id']

    except ValueError as auth_err:
        return jsonify({"error": str(auth_err)}), 401
    except Exception as usage_err:
        print(f"Error during auth/user check for saving map: {usage_err}")
        traceback.print_exc()
        return jsonify({"error": "Could not verify user or usage limits."}), 500

    data = request.get_json()
    nodes = data.get('nodes')
    edges = data.get('edges')
    map_name = data.get('name', 'Untitled Course Map')

    if nodes is None or edges is None:
        return jsonify({"error": "Missing 'nodes' or 'edges' in request body"}), 400

    try:
        map_id = str(uuid.uuid4())
        map_document = {
            "_id": map_id,
            "google_user_id": google_user_id,
            "name": map_name,
            "nodes": nodes,
            "edges": edges,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        course_maps_collection.insert_one(map_document)
        print(f"Course map '{map_name}' ({map_id}) saved for user {google_user_id}")
        return jsonify({"message": "Course map saved successfully", "map_id": map_id}), 201

    except Exception as e:
        print(f"Error saving course map for user {google_user_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to save course map"}), 500

@course_map_bp.route('/course-maps', methods=['GET'])
def get_user_course_maps():
    config = current_app.config['APP_CONFIG']
    GOOGLE_CLIENT_ID = config.get('GOOGLE_CLIENT_ID')
    if not GOOGLE_CLIENT_ID:
         return jsonify({"error": "Google Client ID not configured."}), 500

    course_maps_collection = get_course_maps_collection()
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token, GOOGLE_CLIENT_ID)
        google_user_id = user_info['sub']

    except ValueError as auth_err:
        return jsonify({"error": str(auth_err)}), 401
    except Exception as e:
        print(f"Error during authentication for getting maps: {e}")
        traceback.print_exc()
        return jsonify({"error": "Authentication failed."}), 500

    try:
        user_maps = list(course_maps_collection.find(
            {"google_user_id": google_user_id},
            {"nodes": 0, "edges": 0}
        ).sort("updated_at", -1))

        print(f"Found {len(user_maps)} course maps for user {google_user_id}")
        return jsonify(user_maps), 200

    except Exception as e:
        print(f"Error fetching course maps for user {google_user_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch course maps"}), 500

@course_map_bp.route('/course-map/<map_id>', methods=['GET'])
def get_course_map_details(map_id):
    config = current_app.config['APP_CONFIG']
    GOOGLE_CLIENT_ID = config.get('GOOGLE_CLIENT_ID')
    if not GOOGLE_CLIENT_ID:
         return jsonify({"error": "Google Client ID not configured."}), 500

    course_maps_collection = get_course_maps_collection()

    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token, GOOGLE_CLIENT_ID)
        google_user_id = user_info['sub']

    except ValueError as auth_err:
        return jsonify({"error": str(auth_err)}), 401
    except Exception as e:
        print(f"Error during authentication for getting map details: {e}")
        traceback.print_exc()
        return jsonify({"error": "Authentication failed."}), 500

    try:
        course_map = course_maps_collection.find_one({"_id": map_id})

        if not course_map:
            return jsonify({"error": "Course map not found"}), 404

        if course_map.get("google_user_id") != google_user_id:
            print(f"Authorization failed: User {google_user_id} tried to access map {map_id} owned by {course_map.get('google_user_id')}")
            return jsonify({"error": "Not authorized to access this course map"}), 403

        print(f"Fetched details for course map {map_id}")
        return jsonify(course_map), 200

    except Exception as e:
        print(f"Error fetching course map details for map {map_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch course map details"}), 500

@course_map_bp.route('/course-map/<map_id>', methods=['PUT'])
def update_course_map(map_id):
    config = current_app.config['APP_CONFIG']
    GOOGLE_CLIENT_ID = config.get('GOOGLE_CLIENT_ID')
    if not GOOGLE_CLIENT_ID:
         return jsonify({"error": "Google Client ID not configured."}), 500

    course_maps_collection = get_course_maps_collection()

    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token, GOOGLE_CLIENT_ID)
        google_user_id = user_info['sub']

    except ValueError as auth_err:
        return jsonify({"error": str(auth_err)}), 401
    except Exception as e:
        print(f"Error during authentication for updating map: {e}")
        traceback.print_exc()
        return jsonify({"error": "Authentication failed."}), 500

    data = request.get_json()
    nodes = data.get('nodes')
    edges = data.get('edges')
    map_name = data.get('name')

    if nodes is None and edges is None and map_name is None:
        return jsonify({"error": "No update data provided (nodes, edges, or name)"}), 400

    try:
        existing_map = course_maps_collection.find_one({"_id": map_id})
        if not existing_map:
            return jsonify({"error": "Course map not found"}), 404
        if existing_map.get("google_user_id") != google_user_id:
            return jsonify({"error": "Not authorized to update this course map"}), 403

    except Exception as e:
        print(f"Error finding map {map_id} for update: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to find course map for update"}), 500

    try:
        update_fields = {"updated_at": datetime.now(timezone.utc)}
        if nodes is not None: update_fields["nodes"] = nodes
        if edges is not None: update_fields["edges"] = edges
        if map_name is not None: update_fields["name"] = map_name

        result = course_maps_collection.update_one(
            {"_id": map_id},
            {"$set": update_fields}
        )

        if result.matched_count == 0:
             return jsonify({"error": "Course map not found during update"}), 404

        print(f"Course map {map_id} updated successfully by user {google_user_id}")
        return jsonify({"message": "Course map updated successfully"}), 200

    except Exception as e:
        print(f"Error updating course map {map_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to update course map"}), 500

@course_map_bp.route('/course-map/<map_id>', methods=['DELETE'])
def delete_course_map(map_id):
    config = current_app.config['APP_CONFIG']
    GOOGLE_CLIENT_ID = config.get('GOOGLE_CLIENT_ID')
    if not GOOGLE_CLIENT_ID:
         return jsonify({"error": "Google Client ID not configured."}), 500

    course_maps_collection = get_course_maps_collection()

    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token, GOOGLE_CLIENT_ID)
        google_user_id = user_info['sub']

    except ValueError as auth_err:
        return jsonify({"error": str(auth_err)}), 401
    except Exception as e:
        print(f"Error during authentication for deleting map: {e}")
        traceback.print_exc()
        return jsonify({"error": "Authentication failed."}), 500

    try:
        existing_map = course_maps_collection.find_one({"_id": map_id})
        if not existing_map:
            return jsonify({"error": "Course map not found"}), 404
        if existing_map.get("google_user_id") != google_user_id:
            return jsonify({"error": "Not authorized to delete this course map"}), 403

    except Exception as e:
        print(f"Error finding map {map_id} for deletion: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to find course map for deletion"}), 500

    try:
        result = course_maps_collection.delete_one({"_id": map_id})

        if result.deleted_count == 0:
            return jsonify({"error": "Course map not found during deletion"}), 404

        print(f"Course map {map_id} deleted successfully by user {google_user_id}")
        return jsonify({"message": "Course map deleted successfully"}), 200

    except Exception as e:
        print(f"Error deleting course map {map_id}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to delete course map"}), 500
