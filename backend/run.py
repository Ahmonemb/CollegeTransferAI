import os
import traceback
# Ensure the college_transfer_ai package is importable
# This might require adjusting PYTHONPATH or running from the correct directory
try:
    from college_transfer_ai import create_app
except ImportError as e:
    print(f"ImportError: {e}")
    print("Ensure you are running this script from the 'backend' directory or that the project root is in your PYTHONPATH.")
    exit(1)


try:
    app = create_app()
except Exception as app_create_err:
    print(f"!!! CRITICAL: Failed to create Flask app: {app_create_err}")
    traceback.print_exc()
    exit(1)


if __name__ == '__main__':
    # Use environment variables for host, port, and debug mode is recommended
    host = os.environ.get('FLASK_RUN_HOST', '0.0.0.0')
    # Default port to 5000 if not set
    port = int(os.environ.get('FLASK_RUN_PORT', os.environ.get('PORT', 5000)))
    # Default debug to True if FLASK_DEBUG is not 'false' or '0'
    debug_str = os.environ.get('FLASK_DEBUG', 'True').lower()
    debug = debug_str not in ['false', '0', 'f']

    print(f"--- Starting Flask Server ---")
    print(f"Host: {host}")
    print(f"Port: {port}")
    print(f"Debug Mode: {debug}")

    try:
        # Use waitress or gunicorn in production instead of app.run
        if debug:
            app.run(debug=True, host=host, port=port)
        else:
            # Example using waitress (install waitress first: pip install waitress)
            try:
                from waitress import serve
                print("Running in production mode using waitress...")
                serve(app, host=host, port=port)
            except ImportError:
                print("Waitress not found. Running with Flask's built-in server (NOT recommended for production).")
                app.run(debug=False, host=host, port=port)

    except Exception as run_err:
        print(f"!!! ERROR starting Flask server: {run_err}")
        traceback.print_exc()
