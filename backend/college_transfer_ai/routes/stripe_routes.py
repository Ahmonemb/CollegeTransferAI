import stripe
import traceback
from flask import Blueprint, jsonify, request, current_app
from bson.objectid import ObjectId
from datetime import datetime, timezone

from ..utils import verify_google_token, get_or_create_user
from ..database import get_users_collection 

stripe_bp = Blueprint('stripe_bp', __name__)

@stripe_bp.route('/create-checkout-session', methods=['POST'])
def create_checkout_session():
    config = current_app.config['APP_CONFIG']
    STRIPE_PRICE_ID = config.get('STRIPE_PRICE_ID')
    FRONTEND_URL = config.get('FRONTEND_URL')
    GOOGLE_CLIENT_ID = config.get('GOOGLE_CLIENT_ID')
    STRIPE_SECRET_KEY = config.get('STRIPE_SECRET_KEY')

    if not STRIPE_PRICE_ID:
        return jsonify({"error": "Stripe Price ID not configured on backend."}), 500
    if not FRONTEND_URL:
        return jsonify({"error": "Frontend URL not configured on backend."}), 500
    if not GOOGLE_CLIENT_ID:
         return jsonify({"error": "Google Client ID not configured."}), 500
    if not STRIPE_SECRET_KEY:
         return jsonify({"error": "Stripe Secret Key not configured."}), 500

    stripe.api_key = STRIPE_SECRET_KEY

    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token, GOOGLE_CLIENT_ID)
        user_data = get_or_create_user(user_info)
        google_user_id = user_data['google_user_id']
        mongo_user_id = str(user_data['_id']) 

        print(f"Creating checkout session for user: {google_user_id} (Mongo ID: {mongo_user_id})")
        print(f'Frontend url: {FRONTEND_URL}')

        checkout_session_params = {
            'line_items': [
                {
                    'price': STRIPE_PRICE_ID, 
                    'quantity': 1,
                },
            ],
            'mode': 'subscription',
            'success_url': f'{FRONTEND_URL}/payment-success?session_id={{CHECKOUT_SESSION_ID}}',
            'cancel_url': f'{FRONTEND_URL}/payment-cancel',
            'client_reference_id': mongo_user_id,
            'customer_email': user_data.get('email'),
        }

        stripe_customer_id = user_data.get('stripe_customer_id')

        if stripe_customer_id:
            checkout_session_params['customer'] = stripe_customer_id
            checkout_session_params['customer_update'] = {'name': 'auto', 'address': 'auto'}
        else:
            checkout_session_params['subscription_data'] = {
                'metadata': {
                    'mongo_user_id': mongo_user_id,
                    'google_user_id': google_user_id
                }
            }

        checkout_session = stripe.checkout.Session.create(**checkout_session_params)

        print(f"Stripe session created: {checkout_session.id}")
        return jsonify({'sessionId': checkout_session.id})

    except ValueError as auth_err:
        print(f"[/create-checkout-session] Authentication error: {auth_err}")
        return jsonify({"error": str(auth_err)}), 401
    except stripe.error.StripeError as e:
        print(f"Stripe error creating checkout session: {e}")
        user_message = getattr(e, 'user_message', str(e))
        return jsonify({'error': f'Stripe error: {user_message}'}), e.http_status or 500
    except Exception as e:
        print(f"Error creating checkout session: {e}")
        traceback.print_exc()
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@stripe_bp.route('/stripe-webhook', methods=['POST'])
def stripe_webhook():
    config = current_app.config['APP_CONFIG']
    STRIPE_WEBHOOK_SECRET = config.get('STRIPE_WEBHOOK_SECRET')
    STRIPE_SECRET_KEY = config.get('STRIPE_SECRET_KEY')

    if not STRIPE_WEBHOOK_SECRET:
        print("Webhook Error: STRIPE_WEBHOOK_SECRET not set.")
        return jsonify({'error': 'Webhook secret not configured'}), 500
    if not STRIPE_SECRET_KEY:
        print("Webhook Error: STRIPE_SECRET_KEY not set.")
        return jsonify({'error': 'Stripe secret key not configured'}), 500

    stripe.api_key = STRIPE_SECRET_KEY
    users_collection = get_users_collection() 

    payload = request.data
    sig_header = request.headers.get('Stripe-Signature')
    event = None

    print("--- Stripe Webhook Received ---")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
        print(f"Webhook Event Type: {event['type']}")
    except ValueError as e:
        print(f"Webhook Error: Invalid payload - {e}")
        return jsonify({'error': 'Invalid payload'}), 400
    except stripe.error.SignatureVerificationError as e:
        print(f"Webhook Error: Invalid signature - {e}")
        return jsonify({'error': 'Invalid signature'}), 400
    except Exception as e:
        print(f"Webhook Error: Unexpected error constructing event - {e}")
        return jsonify({'error': 'Webhook construction error'}), 500

    try:
        event_type = event['type']
        event_data = event['data']['object']

        if event_type == 'checkout.session.completed':
            session = event_data
            mongo_user_id = session.get('client_reference_id')
            stripe_customer_id = session.get('customer')
            stripe_subscription_id = session.get('subscription')

            print(f"Checkout session completed for Mongo User ID: {mongo_user_id}")
            print(f"  Stripe Customer ID: {stripe_customer_id}")
            print(f"  Stripe Subscription ID: {stripe_subscription_id}")

            if not mongo_user_id or not stripe_customer_id or not stripe_subscription_id:
                 print("Webhook Error: Missing required data in checkout.session.completed event.")
                 return jsonify({'error': 'Missing data in event'}), 400

            try:
                update_result = users_collection.update_one(
                    {"_id": ObjectId(mongo_user_id)},
                    {"$set": {
                        "stripe_customer_id": stripe_customer_id,
                        "stripe_subscription_id": stripe_subscription_id,
                        "subscription_status": "processing" 
                    }}
                )
                if update_result.matched_count == 0:
                     print(f"Webhook Error: User not found for Mongo ID: {mongo_user_id} during checkout completion.")
                else:
                     print(f"User {mongo_user_id} linked with Stripe IDs (status: processing).")
            except Exception as e:
                 print(f"Webhook Error: DB error linking Stripe IDs for user {mongo_user_id}: {e}")
                 traceback.print_exc()
                 return jsonify({'error': 'Internal server error linking user'}), 500

        elif event_type in ['customer.subscription.deleted', 'customer.subscription.updated']:
            subscription = event_data
            stripe_subscription_id = subscription.id
            subscription_status = subscription.status
            cancel_at_period_end = subscription.cancel_at_period_end

            print(f"Subscription update/deleted event for Sub ID: {stripe_subscription_id}")
            print(f"  Status: {subscription_status}, Cancel at Period End: {cancel_at_period_end}")

            update_data = {
                "subscription_status": subscription_status,
            }
            if subscription_status == 'canceled' or cancel_at_period_end:
                print(f"Downgrading user associated with subscription {stripe_subscription_id}")
                update_data["tier"] = "free"
                update_data["subscription_expires"] = None
                if subscription_status != 'canceled': 
                    update_data["subscription_status"] = "ending"
            elif subscription_status == 'active' and not cancel_at_period_end:
                 subscription_expires_ts = subscription.current_period_end
                 subscription_expires_dt = datetime.fromtimestamp(subscription_expires_ts, tz=timezone.utc) if subscription_expires_ts else None
                 update_data["subscription_expires"] = subscription_expires_dt
                 update_data["tier"] = "premium"

            update_result = users_collection.update_one(
                {"stripe_subscription_id": stripe_subscription_id},
                {"$set": update_data}
            )
            if update_result.matched_count == 0:
                 print(f"Webhook Warning: No user found for subscription ID {stripe_subscription_id} during update/delete.")
            else:
                 print(f"User associated with {stripe_subscription_id} status updated.")


        elif event_type == 'invoice.payment_succeeded':
            print("Invoice payment succeeded event received.")
            invoice = event_data
            stripe_customer_id = invoice.get('customer')
            billing_reason = invoice.billing_reason

            print("Invoice details:")
            print(f"  Customer ID (from invoice): {stripe_customer_id}")
            print(f"  Billing Reason: {billing_reason}")

            if stripe_customer_id:
                print(f"Attempting to find user by Stripe Customer ID: {stripe_customer_id}")
                try:
                    user_doc = users_collection.find_one({"stripe_customer_id": stripe_customer_id})

                    if user_doc:
                        stripe_subscription_id = user_doc.get('stripe_subscription_id')

                        if stripe_subscription_id:
                            print(f"  User found (Mongo ID: {user_doc['_id']}) with linked Sub ID: {stripe_subscription_id}.")
                            try:
                                print(f"    Retrieving subscription details for {stripe_subscription_id}...")
                                subscription = stripe.Subscription.retrieve(stripe_subscription_id)
                                print(f"    Retrieved subscription object: {subscription}") 

                                subscription_expires_ts = None
                                subscription_status = subscription.get('status', 'unknown') 

                                if subscription.get('items') and subscription['items'].get('data'):
                                    first_item = subscription['items']['data'][0]
                                    subscription_expires_ts = first_item.get('current_period_end')

                                if subscription_expires_ts is None:
                                     print(f"    Webhook Warning: 'current_period_end' not found on first subscription item for {stripe_subscription_id}. Cannot set expiration.")
                                     subscription_expires_dt = None 
                                else:
                                     subscription_expires_dt = datetime.fromtimestamp(subscription_expires_ts, tz=timezone.utc)

                                print(f"    Subscription Status: {subscription_status}, Expires TS: {subscription_expires_ts}")



                                update_data = {
                                    "subscription_status": subscription_status,
                                    "subscription_expires": subscription_expires_dt, 
                                    "tier": "premium" 
                                }

                                if billing_reason in ['subscription_create', 'subscription_cycle']:
                                    print(f"  Subscription payment ({billing_reason}). Resetting usage.")
                                    update_data["requests_used_this_period"] = 0
                                    update_data["period_start_date"] = datetime.now(timezone.utc)

                                update_result = users_collection.update_one(
                                    {"stripe_subscription_id": stripe_subscription_id}, 
                                    {"$set": update_data}
                                )
                                if update_result.matched_count > 0:
                                    print(f"  Successfully updated subscription details/tier for user associated with {stripe_subscription_id}.")
                                else:
                                    print(f"Webhook Warning: User update failed for subscription {stripe_subscription_id} during {billing_reason} update, even after finding user.")
                                    return jsonify({'error': 'Internal server error updating user'}), 500

                            except stripe.error.StripeError as sub_err:
                                print(f"Webhook Error: Failed to retrieve Stripe subscription {stripe_subscription_id} during {billing_reason}: {sub_err}")
                                return jsonify({'error': 'Stripe API error retrieving subscription'}), 500
                            except Exception as e:
                                print(f"Webhook Error: Unexpected error updating user after {billing_reason} for sub {stripe_subscription_id}: {e}")
                                traceback.print_exc()
                                return jsonify({'error': 'Internal server error processing subscription'}), 500
                        else:
                            print(f"Webhook Info: User found for customer {stripe_customer_id}, but stripe_subscription_id not linked yet. Requesting retry.")
                            return jsonify({'error': 'Subscription data not ready, please retry'}), 503
                    else:
                        print(f"Webhook Info: No user found in DB for Stripe Customer ID: {stripe_customer_id}. Checkout session likely not processed yet. Requesting retry.")
                        return jsonify({'error': 'User data not ready, please retry'}), 503

                except Exception as db_err:
                    print(f"Webhook Error: Database error finding user by customer ID {stripe_customer_id}: {db_err}")
                    traceback.print_exc()
                    return jsonify({'error': 'Internal server error finding user'}), 500
            else:
                print(f"Webhook Error: Skipping invoice.payment_succeeded because 'customer' ID was missing from the invoice object.")
                return jsonify({'error': 'Missing customer ID in invoice event'}), 400

        elif event_type == 'invoice.payment_failed':
            invoice = event_data
            stripe_subscription_id = invoice.get('subscription')
            if stripe_subscription_id:
                print(f"Invoice payment failed for subscription {stripe_subscription_id}.")
                try:
                    subscription = stripe.Subscription.retrieve(stripe_subscription_id)
                    subscription_status = subscription.status
                    update_result = users_collection.update_one(
                        {"stripe_subscription_id": stripe_subscription_id},
                        {"$set": {"subscription_status": subscription_status}} 
                    )
                    if update_result.matched_count > 0:
                        print(f"Updated subscription status to '{subscription_status}' for user associated with {stripe_subscription_id}.")
                    else:
                        print(f"Webhook Warning: User not found for subscription {stripe_subscription_id} during payment failure update.")
                except stripe.error.StripeError as sub_err:
                     print(f"Webhook Error: Failed to retrieve subscription {stripe_subscription_id} after payment failure: {sub_err}")
                except Exception as e:
                     print(f"Webhook Error: Unexpected error updating user after payment failure: {e}")
                     traceback.print_exc()

        else:
            pass 

    except KeyError as e:
        print(f"Webhook Error: Missing expected key in event data - {e}")
        return jsonify({'error': f'Missing key in event data: {e}'}), 400
    except Exception as e:
        print(f"Webhook Error: Error handling event {event.get('type', 'N/A')} - {e}")
        traceback.print_exc()
        return jsonify({'error': 'Internal server error handling webhook'}), 500

    print("Webhook processing complete, acknowledging event.")
    return jsonify({'success': True}), 200
