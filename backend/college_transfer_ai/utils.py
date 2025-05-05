import os
import traceback
from datetime import datetime, timedelta, time, timezone
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from bson.objectid import ObjectId
# Import collection getter functions instead of direct collection objects
from .database import get_users_collection

# --- Rate Limits (Example: Daily) ---
FREE_TIER_LIMIT = 10
PREMIUM_TIER_LIMIT = 100 # Example limit for paid users

# --- Helper: Verify Google Token ---
def verify_google_token(token, client_id):
    """Verifies Google ID token and returns user info."""
    if not client_id:
        raise ValueError("Google Client ID not configured for verification.")
    try:
        idinfo = id_token.verify_oauth2_token(
            token, google_requests.Request(), client_id
        )
        print(f"Token verified for user: {idinfo.get('sub')}")
        return idinfo
    except ValueError as e:
        print(f"Token verification failed: {e}")
        raise ValueError(f"Invalid token: {e}")
    except Exception as e:
        print(f"Unexpected error during token verification: {e}")
        raise Exception(f"Token verification error: {e}")

# --- Helper: Get or Create User ---
def get_or_create_user(idinfo):
    """
    Finds a user by google_user_id or creates a new one with default free tier.
    Ensures Stripe-related fields exist.
    Returns the user document from MongoDB.
    """
    users_collection = get_users_collection() # Get collection via function

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
            'period_start_date': datetime.now(timezone.utc), # Use timezone-aware
            'created_at': datetime.now(timezone.utc), # Use timezone-aware
            'last_login': datetime.now(timezone.utc), # Use timezone-aware
            # Add Stripe fields with defaults
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "subscription_status": None,
            "subscription_expires": None
        }
        try:
            insert_result = users_collection.insert_one(new_user_data)
            print(f"Successfully created new user: {google_user_id} with ID: {insert_result.inserted_id}")
            # Fetch the newly created user to return it
            user = users_collection.find_one({'_id': insert_result.inserted_id})
            if not user:
                 raise Exception(f"Failed to retrieve newly created user {google_user_id}")
        except Exception as e:
            print(f"Error creating user {google_user_id}: {e}")
            raise Exception(f"Database error creating user: {e}")
    else:
        # Ensure essential fields exist for older users & update last_login
        update_query = {'last_login': datetime.now(timezone.utc)} # Use timezone-aware
        set_fields = {}
        if 'tier' not in user: set_fields['tier'] = 'free'
        if 'requests_used_this_period' not in user: set_fields['requests_used_this_period'] = 0
        if 'period_start_date' not in user: set_fields['period_start_date'] = datetime.now(timezone.utc)
        if 'stripe_customer_id' not in user: set_fields['stripe_customer_id'] = None
        if 'stripe_subscription_id' not in user: set_fields['stripe_subscription_id'] = None
        if 'subscription_status' not in user: set_fields['subscription_status'] = None
        if 'subscription_expires' not in user: set_fields['subscription_expires'] = None

        if set_fields: # Only update if fields were missing
             update_query.update(set_fields)
             users_collection.update_one(
                 {'google_user_id': google_user_id},
                 {'$set': update_query}
             )
             # Re-fetch user data after update if fields were added
             user = users_collection.find_one({"google_user_id": google_user_id})
        else: # Just update last_login if no fields were missing
             users_collection.update_one(
                 {'google_user_id': google_user_id},
                 {'$set': {'last_login': update_query['last_login']}}
             )


        print(f"Found existing user: {google_user_id}, Tier: {user.get('tier')}")

    return user

# --- Helper: Check and Update Usage ---
def check_and_update_usage(user_data):
    """
    Checks if the user is within their usage limit based on tier.
    Resets daily usage if necessary. Increments usage count if within limit.
    Returns True if usage is allowed, False otherwise.
    Raises Exception on database error.
    """
    users_collection = get_users_collection() # Get collection via function

    tier = user_data.get('tier', 'free')
    limit = PREMIUM_TIER_LIMIT if tier == 'premium' else FREE_TIER_LIMIT
    requests_used = user_data.get('requests_used_this_period', 0)
    period_start = user_data.get('period_start_date')
    google_user_id = user_data.get('google_user_id')

    now = datetime.now(timezone.utc) # Use timezone-aware
    reset_usage = False

    # --- Check if usage period needs reset (daily reset logic) ---
    if period_start and isinstance(period_start, datetime):
        # Ensure period_start is timezone-aware for comparison
        if period_start.tzinfo is None:
             period_start = period_start.replace(tzinfo=timezone.utc)

        if period_start.date() < now.date():
            print(f"Resetting daily usage for user {google_user_id}")
            requests_used = 0
            period_start = now # Use timezone-aware now
            reset_usage = True
    else:
        # If period_start is missing or invalid, reset it
        print(f"Initializing/Resetting usage period for user {google_user_id}")
        requests_used = 0
        period_start = now # Use timezone-aware now
        reset_usage = True

    # --- Check if limit is exceeded ---
    if requests_used >= limit:
        print(f"Usage limit exceeded for user {google_user_id} (Tier: {tier}, Used: {requests_used}, Limit: {limit})")
        return False # Limit exceeded

    # --- If limit is not exceeded, increment count ---
    try:
        # Construct update_fields based on whether usage is being reset
        if reset_usage:
            # If resetting, SET the count to 1 and update the start date
            update_fields = {
                '$set': {
                    'requests_used_this_period': 1,
                    'period_start_date': period_start, # Use timezone-aware period_start
                    'last_request_timestamp': now # Use timezone-aware now
                }
            }
            print(f"  Applying reset update for user {google_user_id}") # Debugging print
        else:
            # If not resetting, just INCREMENT the count and update the timestamp
            update_fields = {
                '$inc': {'requests_used_this_period': 1},
                '$set': {'last_request_timestamp': now} # Use timezone-aware now
            }
            print(f"  Applying increment update for user {google_user_id}") # Debugging print


        result = users_collection.update_one(
            {'google_user_id': google_user_id},
            update_fields
        )
        if result.matched_count == 0:
             # This case should ideally not happen if get_or_create_user worked
             raise Exception(f"User {google_user_id} not found during usage update.")

        print(f"Usage updated for user {google_user_id}: {requests_used + 1}/{limit}")
        return True # Usage allowed and updated
    except Exception as e:
        print(f"Error updating usage count for user {google_user_id}: {e}")
        # Add traceback here if it's not already in the calling function's handler
        traceback.print_exc()
        raise Exception(f"Failed to update usage count: {e}")