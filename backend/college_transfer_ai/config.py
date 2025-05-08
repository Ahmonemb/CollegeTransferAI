import os
import json
import traceback

def load_configuration():
    env = os.getenv('FLASK_ENV', 'development')
    config_filename = f"config.{env}.json"
    print(f"--- Loading configuration for environment: {env} from {config_filename} ---")

    config = {}
    try:
        with open(config_filename, 'r') as f:
            config = json.load(f)
        print("--- Configuration loaded successfully from JSON file ---")
    except FileNotFoundError:
        print(f"!!! WARNING: {config_filename} not found. Attempting to load from environment variables.")
    except json.JSONDecodeError as e:
        print(f"!!! ERROR: Failed to parse {config_filename}: {e}. Attempting to load from environment variables.")
        traceback.print_exc()

    env_vars = {
        "MONGO_URI": os.getenv("MONGO_URI"),
        "ASSIST_API_KEY": os.getenv("ASSIST_API_KEY"),
        "GEMINI_API_KEY": os.getenv("GEMINI_API_KEY"),
        "FRONTEND_URL": os.getenv("FRONTEND_URL"),
        "STRIPE_SECRET_KEY": os.getenv("STRIPE_SECRET_KEY"),
        "STRIPE_PUBLISHABLE_KEY": os.getenv("STRIPE_PUBLISHABLE_KEY"),
        "STRIPE_WEBHOOK_SECRET": os.getenv("STRIPE_WEBHOOK_SECRET"),
        "GOOGLE_CLIENT_ID": os.getenv("GOOGLE_CLIENT_ID")
    }

    loaded_from_env = False
    for key, value in env_vars.items():
        if value is not None:
            config[key] = value
            if not loaded_from_env:
                print("--- Loading/Overriding configuration from environment variables ---")
                loaded_from_env = True
            print(f"    Loaded {key} from environment.")

    required_keys = ["MONGO_URI", "ASSIST_API_KEY", "GEMINI_API_KEY", "FRONTEND_URL", "STRIPE_SECRET_KEY", "GOOGLE_CLIENT_ID"]
    missing_keys = [key for key in required_keys if not config.get(key)]

    if missing_keys:
        error_message = f"Missing required configuration keys: {', '.join(missing_keys)}"
        print(f"!!! CRITICAL: {error_message}")
        raise ValueError(error_message)

    print("--- Final configuration loaded ---")
    return config
