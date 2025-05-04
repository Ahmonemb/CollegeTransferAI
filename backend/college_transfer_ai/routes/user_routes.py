from flask import Blueprint, jsonify, request, current_app
from datetime import datetime, timedelta, time, timezone
import traceback # Import traceback

# Import necessary functions/objects from other modules
from ..utils import verify_google_token, get_or_create_user, FREE_TIER_LIMIT, PREMIUM_TIER_LIMIT

user_bp = Blueprint('user_bp', __name__)

@user_bp.route('/user-status', methods=['GET'])
@verify_google_token
def get_user_status(user_info):
    user_id = user_info.get('sub')
    if not user_id:
        print("Error: 'sub' key missing in user_info provided by verify_google_token.")
        # Return a JSON response for consistency
        return jsonify({"error": "User ID ('sub') not found in verified token information"}), 401

    try:
        user_data = get_or_create_user(user_info)

        if not user_data:
            print(f"Error: Failed to get or create user for google_id {user_id}.")
            return jsonify({"error": "Failed to retrieve or create user profile"}), 500

        # Extract relevant status info
        usage_count = user_data.get("requests_used_this_period", 0) # ADJUST FIELD NAME IF NEEDED
        is_subscribed = user_data.get("is_subscribed", False)
        subscription_expires = user_data.get("subscription_expires")
        expires_str = subscription_expires.isoformat() if subscription_expires and isinstance(subscription_expires, datetime) else None # Add type check
        user_tier = user_data.get('tier', 'free')

        # Calculate the specific usage limit based on tier
        current_usage_limit = PREMIUM_TIER_LIMIT if user_tier == 'premium' else FREE_TIER_LIMIT

        # Calculate the next reset time (assuming daily reset at midnight UTC)
        period_start = user_data.get('period_start_date') # Get the start date from DB
        reset_time_iso = None
        if period_start and isinstance(period_start, datetime): # Add type check
            # Ensure period_start is timezone-aware (assuming it's stored as UTC)
            if period_start.tzinfo is None:
                 period_start = period_start.replace(tzinfo=timezone.utc)
            # Calculate the start of the *next* day in UTC
            today_start_utc = datetime.combine(period_start.date(), time.min, tzinfo=timezone.utc)
            next_reset_utc = today_start_utc + timedelta(days=1)
            reset_time_iso = next_reset_utc.isoformat()
        else: # Handle missing or invalid period_start
             print(f"Warning: period_start_date missing or invalid for user {user_id}. Calculating default reset time.")
             now_utc = datetime.now(timezone.utc)
             today_start_utc = datetime.combine(now_utc.date(), time.min, tzinfo=timezone.utc)
             next_reset_utc = today_start_utc + timedelta(days=1)
             reset_time_iso = next_reset_utc.isoformat()


        # Return the data structure expected by the frontend
        return jsonify({
            "usageCount": usage_count,
            "is_subscribed": is_subscribed,
            "subscription_expires": expires_str,
            "tier": user_tier,
            "usageLimit": current_usage_limit,
            "resetTime": reset_time_iso
        }), 200

    except ValueError as ve: # Catch specific errors if needed
        print(f"ValueError during user status processing for {user_id}: {ve}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to process user information: {ve}"}), 400
    except Exception as e: # General catch-all for 500 errors
        print(f"Unhandled error fetching user status for {user_id}: {e}")
        traceback.print_exc() # Print the full traceback to the console
        return jsonify({"error": "Internal Server Error"}), 500 # Generic message to client
