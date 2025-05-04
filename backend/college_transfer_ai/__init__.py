import os
import traceback
from flask import Flask, jsonify, request
from flask_cors import CORS

# Import configuration, database setup, and blueprints
from .config import load_configuration
from .database import init_db, close_db
from .routes.stripe_routes import stripe_bp
# Remove init_gemini import from agreement_routes
# from .routes.agreement_routes import agreement_bp, init_gemini # Import init_gemini
from .routes.agreement_routes import agreement_bp
from .routes.course_map_routes import course_map_bp
from .routes.user_routes import user_bp
# Import the correct init function from llm_service
from .llm_service import init_llm

def create_app():
    """Flask application factory."""
    app = Flask(__name__)
    print("--- Creating Flask App ---")

    config = None # Initialize config variable
    try:
        # Load configuration
        config = load_configuration()
        app.config['APP_CONFIG'] = config # Store config for access in blueprints if needed
    except Exception as config_err:
        print(f"!!! CRITICAL: Failed to load configuration: {config_err}")
        # Decide if the app should exit or continue with defaults/limited functionality
        # For now, let it continue, but LLM/DB might fail later
        config = {} # Use an empty config to avoid None errors later

    # Initialize CORS (using config)
    frontend_url = config.get("FRONTEND_URL", "http://localhost:5173") # Default if missing
    CORS(app, resources={r"/api/*": {"origins": frontend_url}}, supports_credentials=True)
    print(f"--- CORS Initialized (Origins: {frontend_url}) ---")

    # Initialize Database (using config)
    try:
        mongo_uri = config.get("MONGO_URI")
        if not mongo_uri:
            raise ValueError("MONGO_URI not found in configuration.")
        init_db(mongo_uri)
    except Exception as db_err:
        print(f"!!! CRITICAL: Failed to initialize Database: {db_err}")
        # Decide if the app should exit

    # Initialize LLM Service (passing config)
    try:
        print("Initializing LLM Service...")
        init_llm(config) # <-- Pass the loaded config dictionary
    except Exception as llm_err:
        print(f"!!! WARNING: Failed to initialize LLM Service: {llm_err}")
        traceback.print_exc()
        # App can likely continue without LLM, just log the warning

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

if __name__ == '__main__':
    app = create_app()
    print("--- Starting Flask Server ---")
    # Use host/port from config or defaults
    debug_mode = True # Or get from config/env
    app.run(host='0.0.0.0', port=5000, debug=debug_mode)