import os
import traceback
from flask import Flask
from flask_cors import CORS

# Import configuration, database setup, and blueprints
from .config import load_configuration
from .database import init_db
from .routes.stripe_routes import stripe_bp
from .routes.agreement_routes import agreement_bp, init_gemini # Import init_gemini
from .routes.course_map_routes import course_map_bp
from .routes.user_routes import user_bp

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
        # Exit if config is essential and failed to load
        exit(1)

    # Initialize CORS
    # Be more specific with origins in production
    cors_origins = config.get("FRONTEND_URL", "*") # Default to '*' if not set
    CORS(app, resources={r"/*": {"origins": cors_origins}})
    print(f"--- CORS Initialized (Origins: {cors_origins}) ---")

    # Initialize Database
    try:
        init_db(config.get('MONGO_URI'))
    except ConnectionError as db_err:
        print(f"!!! CRITICAL: Could not connect to database on startup: {db_err}")
        # Depending on requirements, you might exit or continue with DB unavailable
        exit(1) # Example: Exit if DB is essential
    except Exception as general_db_err:
        print(f"!!! CRITICAL: Unexpected error initializing database: {general_db_err}")
        traceback.print_exc()
        exit(1)


    # Initialize Gemini (if using GOOGLE_API_KEY)
    try:
        init_gemini(config.get('GOOGLE_API_KEY'))
    except Exception as gemini_err:
        print(f"!!! WARNING: Failed to initialize Gemini: {gemini_err}")
        # App can likely continue without Gemini, just log the warning

    # Register Blueprints with optional API prefix
    api_prefix = '/api' # Example prefix, adjust as needed or remove if using '/'
    app.register_blueprint(stripe_bp, url_prefix=api_prefix)
    app.register_blueprint(agreement_bp, url_prefix=api_prefix)
    app.register_blueprint(course_map_bp, url_prefix=api_prefix)
    app.register_blueprint(user_bp, url_prefix=api_prefix)
    print(f"--- Blueprints Registered (Prefix: {api_prefix}) ---")

    # Optional: Add a simple root route for health check or basic info
    @app.route('/')
    def index():
        return "College Transfer AI Backend is running."

    print("--- Flask App Creation Complete ---")
    return app