from dotenv import load_dotenv
import os

def load_configuration():
    """Loads environment variables and returns them in a dictionary."""
    print("--- Attempting to load configuration ---")
    # Assuming .env is at the project root (two levels up from this file's directory)
    config_dir = os.path.dirname(__file__)
    project_root = os.path.abspath(os.path.join(config_dir, '..', '..'))
    dotenv_path = os.path.join(project_root, '.env')

    print(f"Config directory: {config_dir}")
    print(f"Project root guess: {project_root}")
    print(f"Calculated .env path: {dotenv_path}")
    print(f"Does .env exist at path? {os.path.exists(dotenv_path)}")

    # Load the .env file
    loaded_ok = load_dotenv(dotenv_path=dotenv_path, verbose=True) # Add verbose=True
    print(f"load_dotenv successful? {loaded_ok}")

    # Check the key IMMEDIATELY after loading
    google_api_key_after_load = os.getenv("GOOGLE_API_KEY")
    print(f"GOOGLE_API_KEY immediately after load_dotenv: {'Set' if google_api_key_after_load else 'Not Set'}")
    if google_api_key_after_load:
         # Print a few chars to confirm it's not empty (avoid printing full key)
         print(f"  (Starts with: {google_api_key_after_load[:4]}...)")


    config = {
        "MONGO_URI": os.getenv("MONGO_URI"),
        "GOOGLE_CLIENT_ID": os.getenv("GOOGLE_CLIENT_ID"),
        "GOOGLE_API_KEY": google_api_key_after_load, # Use the value we just checked
        "OPENAI_API_KEY": os.getenv("OPENAI_API_KEY"),
        "STRIPE_SECRET_KEY": os.getenv("STRIPE_SECRET_KEY"),
        "STRIPE_PRICE_ID": os.getenv("STRIPE_PRICE_ID"),
        "STRIPE_WEBHOOK_SECRET": os.getenv("STRIPE_WEBHOOK_SECRET"),
        "FRONTEND_URL": os.getenv("FRONTEND_URL", "http://localhost:5173"),
        "PERPLEXITY_API_KEY": os.getenv("PERPLEXITY_API_KEY"),
    }
    # Basic validation
    if not config["MONGO_URI"]:
        raise ValueError("MONGO_URI not set in environment variables.")
    if not config["GOOGLE_CLIENT_ID"]:
        raise ValueError("GOOGLE_CLIENT_ID not set in environment variables.")
    # Add more checks as needed

    print("--- Configuration Loaded ---")
    return config

