import os
from dotenv import load_dotenv

def load_configuration():
    """Loads environment variables and returns them in a dictionary."""
    # Assuming .env is at the project root (two levels up from this file's directory)
    dotenv_path = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
    load_dotenv(dotenv_path=dotenv_path)

    config = {
        "MONGO_URI": os.getenv("MONGO_URI"),
        "GOOGLE_CLIENT_ID": os.getenv("GOOGLE_CLIENT_ID"),
        "GOOGLE_API_KEY": os.getenv("GOOGLE_API_KEY"), # For Gemini if needed
        "PERPLEXITY_API_KEY": os.getenv("PERPLEXITY_API_KEY"),
        "STRIPE_SECRET_KEY": os.getenv("STRIPE_SECRET_KEY"),
        "STRIPE_PRICE_ID": os.getenv("STRIPE_PRICE_ID"),
        "STRIPE_WEBHOOK_SECRET": os.getenv("STRIPE_WEBHOOK_SECRET"),
        "FRONTEND_URL": os.getenv("FRONTEND_URL", "http://localhost:5173"),
        # Add other config variables as needed
    }
    # Basic validation
    if not config["MONGO_URI"]:
        raise ValueError("MONGO_URI not set in environment variables.")
    if not config["GOOGLE_CLIENT_ID"]:
        raise ValueError("GOOGLE_CLIENT_ID not set in environment variables.")
    # Add more checks as needed

    print("--- Configuration Loaded ---")
    # Print loaded values for debugging (consider removing sensitive keys in production logs)
    # print(f"MONGO_URI: {'Set' if config['MONGO_URI'] else 'Not Set'}")
    # print(f"GOOGLE_CLIENT_ID: {'Set' if config['GOOGLE_CLIENT_ID'] else 'Not Set'}")
    # print(f"STRIPE_SECRET_KEY: {'Set' if config['STRIPE_SECRET_KEY'] else 'Not Set'}")
    # print(f"STRIPE_WEBHOOK_SECRET: {'Set' if config['STRIPE_WEBHOOK_SECRET'] else 'Not Set'}")
    # print(f"FRONTEND_URL: {config['FRONTEND_URL']}")
    return config

# config = load_configuration() # Optionally load here if needed globally at import time