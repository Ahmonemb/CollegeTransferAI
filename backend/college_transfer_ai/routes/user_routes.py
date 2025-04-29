from flask import Blueprint, jsonify, request, current_app
from datetime import datetime, timedelta, time, timezone
import traceback

# Import necessary functions/objects from other modules
from ..utils import verify_google_token, get_or_create_user, FREE_TIER_LIMIT, PREMIUM_TIER_LIMIT

user_bp = Blueprint('user_bp', __name__)

@user_bp.route('/user-status', methods=['GET'])
def get_user_status():
    print("--- !!! GET /api/user-status endpoint hit !!! ---") # Add this line
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
        user_data = get_or_create_user(user_info)

        tier = user_data.get('tier', 'free')
        limit = PREMIUM_TIER_LIMIT if tier == 'premium' else FREE_TIER_LIMIT
        requests_used = user_data.get('requests_used_this_period', 0)
        period_start = user_data.get('period_start_date')

        now = datetime.now(timezone.utc) # Use timezone-aware
        reset_time_iso = None

        # Calculate reset time (assuming daily reset at UTC midnight)
        try:
            tomorrow = now.date() + timedelta(days=1)
            tomorrow_midnight_utc = datetime.combine(tomorrow, time(0, 0), tzinfo=timezone.utc)
            reset_time_iso = tomorrow_midnight_utc.isoformat(timespec='seconds') # Use ISO format with seconds
        except Exception as time_err:
            print(f"Error calculating reset time: {time_err}")
            reset_time_iso = "Error calculating reset time"


        # Check if usage needs reset for display purposes (doesn't update DB here)
        display_requests_used = requests_used
        if period_start and isinstance(period_start, datetime):
             if period_start.tzinfo is None:
                 period_start = period_start.replace(tzinfo=timezone.utc)
             if period_start.date() < now.date():
                 display_requests_used = 0 # Display as 0 if period has reset

        print(f"User status requested for {user_data.get('google_user_id')}: Used={display_requests_used}, Limit={limit}, Tier={tier}, Resets={reset_time_iso}")

        return jsonify({
            "tier": tier,
            "usageCount": display_requests_used,
            "usageLimit": limit,
            "resetTime": reset_time_iso # ISO 8601 format string (UTC)
        }), 200

    except ValueError as auth_err:
        print(f"[/user-status] Authentication error: {auth_err}")
        return jsonify({"error": str(auth_err)}), 401
    except Exception as e:
        print(f"Error getting user status: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500
