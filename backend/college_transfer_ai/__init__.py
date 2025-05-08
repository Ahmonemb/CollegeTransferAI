import os
import traceback
from flask import Flask
from flask_cors import CORS

from college_transfer_ai.config import load_configuration
from college_transfer_ai.database import init_db, close_db
from college_transfer_ai.routes.stripe_routes import stripe_bp
from college_transfer_ai.routes.agreement_pdf_routes import agreement_pdf_bp
from college_transfer_ai.routes.chat_routes import init_chat_routes
from college_transfer_ai.routes.course_map_routes import course_map_bp
from college_transfer_ai.routes.user_routes import user_bp
from college_transfer_ai.routes.api_info_routes import api_info_bp
from college_transfer_ai.routes.igetc_routes import igetc_bp

def create_app():
    app = Flask(__name__)

    print("--- Creating Flask App ---")

    try:
        config = load_configuration()
        app.config['APP_CONFIG'] = config
    except Exception as config_err:
        print(f"!!! CRITICAL: Failed to load configuration: {config_err}")
        traceback.print_exc()
        exit(1)

    cors_origins = config.get("FRONTEND_URL", "*")
    CORS(app, resources={r"/*": {"origins": cors_origins}})
    print(f"--- CORS Initialized (Origins: {cors_origins}) ---")

    try:
        init_db(app, config.get('MONGO_URI'))
    except (ConnectionError, ValueError, Exception) as db_err:
        print(f"!!! CRITICAL: Database initialization failed: {db_err}")
        if not isinstance(db_err, (ConnectionError, ValueError)):
             traceback.print_exc()
        exit(1)

    try:
        init_chat_routes(app)
    except Exception as gemini_err:
        print(f"!!! WARNING: Failed to initialize Gemini/Chat: {gemini_err}")

    api_prefix = '/api'
    app.register_blueprint(stripe_bp, url_prefix=api_prefix)
    app.register_blueprint(agreement_pdf_bp, url_prefix=api_prefix)
    app.register_blueprint(course_map_bp, url_prefix=api_prefix)
    app.register_blueprint(user_bp, url_prefix=api_prefix)
    app.register_blueprint(api_info_bp, url_prefix=api_prefix)
    app.register_blueprint(igetc_bp, url_prefix=api_prefix)
    print(f"--- Blueprints Registered (Prefix: {api_prefix}) ---")

    @app.route('/')
    def index():
        return "College Transfer AI Backend is running."

    app.teardown_appcontext(close_db)
    print("--- Database teardown function registered ---")

    print("--- Flask App Creation Complete ---")
    return app