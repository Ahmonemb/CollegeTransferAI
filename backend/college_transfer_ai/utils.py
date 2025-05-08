import os
import traceback
from datetime import datetime, timedelta, time, timezone
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from bson.objectid import ObjectId
from .database import get_users_collection

FREE_TIER_LIMIT = 10
PREMIUM_TIER_LIMIT = 100

def verify_google_token(token, client_id):
    try:
        idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), client_id)
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            raise ValueError('Wrong issuer.')
        return idinfo
    except ValueError as ve:
        print(f"Google token verification failed: {ve}")
        traceback.print_exc()
        raise ValueError(f"Invalid token: {ve}")
    except Exception as e:
        print(f"An unexpected error occurred during Google token verification: {e}")
        traceback.print_exc()
        raise Exception(f"Token verification failed due to an unexpected error: {e}")

def get_or_create_user(idinfo):
    users_collection = get_users_collection()

    google_user_id = idinfo.get('sub')
    if not google_user_id:
        raise ValueError("Missing 'sub' (user ID) in token info.")

    user = users_collection.find_one({'google_user_id': google_user_id})

    if not user:
        new_user_data = {
            'google_user_id': google_user_id,
            'email': idinfo.get('email'),
            'name': idinfo.get('name'),
            'tier': 'free',
            'requests_used_this_period': 0,
            'period_start_date': datetime.now(timezone.utc),
            'created_at': datetime.now(timezone.utc),
            'last_login': datetime.now(timezone.utc),
            "stripe_customer_id": None,
            "stripe_subscription_id": None,
            "subscription_status": None,
            "subscription_expires": None
        }
        try:
            insert_result = users_collection.insert_one(new_user_data)
            user = users_collection.find_one({'_id': insert_result.inserted_id})
            if not user:
                raise Exception(f"Failed to retrieve newly created user {google_user_id}")
        except Exception as e:
            raise Exception(f"Database error creating user: {e}")
    else:
        update_query = {'last_login': datetime.now(timezone.utc)}
        set_fields = {}
        if 'tier' not in user: set_fields['tier'] = 'free'
        if 'requests_used_this_period' not in user: set_fields['requests_used_this_period'] = 0
        if 'period_start_date' not in user: set_fields['period_start_date'] = datetime.now(timezone.utc)
        if 'stripe_customer_id' not in user: set_fields['stripe_customer_id'] = None
        if 'stripe_subscription_id' not in user: set_fields['stripe_subscription_id'] = None
        if 'subscription_status' not in user: set_fields['subscription_status'] = None
        if 'subscription_expires' not in user: set_fields['subscription_expires'] = None

        if set_fields:
            update_query.update(set_fields)
            users_collection.update_one(
                {'google_user_id': google_user_id},
                {'$set': update_query}
            )
            user = users_collection.find_one({"google_user_id": google_user_id})
        else:
            users_collection.update_one(
                {'google_user_id': google_user_id},
                {'$set': {'last_login': update_query['last_login']}}
            )

    return user

def check_and_update_usage(user_data):
    users_collection = get_users_collection()

    tier = user_data.get('tier', 'free')
    limit = PREMIUM_TIER_LIMIT if tier == 'premium' else FREE_TIER_LIMIT
    requests_used = user_data.get('requests_used_this_period', 0)
    period_start = user_data.get('period_start_date')
    google_user_id = user_data.get('google_user_id')

    now = datetime.now(timezone.utc)
    reset_usage = False

    if period_start and isinstance(period_start, datetime):
        if period_start.tzinfo is None:
            period_start = period_start.replace(tzinfo=timezone.utc)

        if period_start.date() < now.date():
            requests_used = 0
            period_start = now
            reset_usage = True
    else:
        requests_used = 0
        period_start = now
        reset_usage = True

    if requests_used >= limit:
        return False

    try:
        if reset_usage:
            update_fields = {
                '$set': {
                    'requests_used_this_period': 1,
                    'period_start_date': period_start,
                    'last_request_timestamp': now
                }
            }
        else:
            update_fields = {
                '$inc': {'requests_used_this_period': 1},
                '$set': {'last_request_timestamp': now}
            }

        result = users_collection.update_one(
            {'google_user_id': google_user_id},
            update_fields
        )
        if result.matched_count == 0:
            raise Exception(f"User {google_user_id} not found during usage update.")

        return True
    except Exception as e:
        traceback.print_exc()
        raise Exception(f"Failed to update usage count: {e}")

def calculate_intersection(results):
    if not results or any(res is None for res in results):
        return {}

    valid_results = [res for res in results if isinstance(res, dict) and res]

    if not valid_results:
        return {}

    try:
        common_ids = set(str(v) for v in valid_results[0].values())
    except Exception as e:
        return {}

    for i in range(1, len(valid_results)):
        try:
            current_ids = set(str(v) for v in valid_results[i].values())
            common_ids.intersection_update(current_ids)
        except Exception as e:
            continue

    intersection = {}
    name_map_source = valid_results[0]
    try:
        id_to_name_map = {str(v): k for k, v in name_map_source.items()}
    except Exception as e:
        id_to_name_map = {}

    for common_id in common_ids:
        name = id_to_name_map.get(common_id)
        if name:
            original_id = next((v for v in name_map_source.values() if str(v) == common_id), common_id)
            intersection[name] = original_id
        else:
            found = False
            for res in valid_results:
                try:
                    for k, v in res.items():
                        if str(v) == common_id:
                            intersection[k] = v
                            found = True
                            break
                except Exception:
                    continue
                if found: break

    return intersection