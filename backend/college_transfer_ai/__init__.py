import os
import traceback
from flask import Flask
from flask_cors import CORS

# Import configuration, database setup, and blueprints
from college_transfer_ai.config import load_configuration
# Import init_db and close_db specifically
from college_transfer_ai.database import init_db, close_db
from college_transfer_ai.routes.stripe_routes import stripe_bp
from college_transfer_ai.routes.agreement_pdf_routes import agreement_pdf_bp
from college_transfer_ai.routes.chat_routes import init_chat_routes # Keep this import
from college_transfer_ai.routes.course_map_routes import course_map_bp
from college_transfer_ai.routes.user_routes import user_bp
from college_transfer_ai.routes.api_info_routes import api_info_bp
from college_transfer_ai.routes.igetc_routes import igetc_bp

def create_app():
    """Flask application factory."""
    app = Flask(__name__)

    print("--- Creating Flask App ---")

    try:
        # Load configuration
        config = load_configuration()
        app.config['APP_CONFIG'] = config # Store config for access in blueprints
    except Exception as config_err:
        print(f"!!! CRITICAL: Failed to load configuration: {config_err}")
        traceback.print_exc()
        exit(1)

    # Initialize CORS
    cors_origins = config.get("FRONTEND_URL", "*")
    CORS(app, resources={r"/*": {"origins": cors_origins}})
    print(f"--- CORS Initialized (Origins: {cors_origins}) ---")

    # Initialize Database (but don't register teardown here)
    try:
        init_db(app, config.get('MONGO_URI'))
    except (ConnectionError, ValueError, Exception) as db_err: # Catch specific errors from init_db
        print(f"!!! CRITICAL: Database initialization failed: {db_err}")
        # Optionally print traceback for unexpected errors
        if not isinstance(db_err, (ConnectionError, ValueError)):
             traceback.print_exc()
        exit(1) # Exit if DB is essential

    # Initialize Chat Routes (Pass the app object)
    try:
        # Pass the app object to init_chat_routes
        init_chat_routes(app) # This might still print the GridFS error if it needs it prematurely
    except Exception as gemini_err:
        print(f"!!! WARNING: Failed to initialize Gemini/Chat: {gemini_err}")
        # App can likely continue without Chat, just log the warning

    # Register Blueprints with optional API prefix
    api_prefix = '/api'
    app.register_blueprint(stripe_bp, url_prefix=api_prefix)
    app.register_blueprint(agreement_pdf_bp, url_prefix=api_prefix)
    app.register_blueprint(course_map_bp, url_prefix=api_prefix)
    app.register_blueprint(user_bp, url_prefix=api_prefix)
    app.register_blueprint(api_info_bp, url_prefix=api_prefix)
    app.register_blueprint(igetc_bp, url_prefix=api_prefix)
    print(f"--- Blueprints Registered (Prefix: {api_prefix}) ---")

    # Optional: Add a simple root route for health check or basic info
    @app.route('/')
    def index():
        return "College Transfer AI Backend is running."

    # Register the database teardown function HERE, at the end of app setup
    app.teardown_appcontext(close_db)
    print("--- Database teardown function registered ---")

    print("--- Flask App Creation Complete ---")
    return app