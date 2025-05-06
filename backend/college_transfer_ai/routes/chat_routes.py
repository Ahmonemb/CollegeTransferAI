# filepath: backend/college_transfer_ai/routes/chat_routes.py
import traceback
import requests
import json
from flask import Blueprint, jsonify, request, current_app
from datetime import datetime, timedelta, time, timezone

# --- Google AI Imports ---
import google.generativeai as genai
# Try importing FunctionResponse from content_types
from google.generativeai.types import HarmCategory, HarmBlockThreshold, Tool, FunctionDeclaration
from google.generativeai.types import content_types # Import the module
# --- End Google AI Imports ---

from ..utils import verify_google_token, get_or_create_user, check_and_update_usage
from ..database import get_gridfs, get_db # Import necessary accessors

chat_bp = Blueprint('chat_bp', __name__) # Removed url_prefix, assuming added during registration

FREE_TIER_LIMIT = 10
PREMIUM_TIER_LIMIT = 50

gemini_model = None
perplexity_api_key = None

# --- Define the Web Search Tool for Gemini ---
search_web_func = FunctionDeclaration(
    name="search_web",
    description="Search the web specifically for course prerequisite information. Use this tool when generating an educational plan to find prerequisites for a given course at a specific institution. If a prerequisite course is found, use this tool again to find *its* prerequisites, continuing recursively until no further prerequisites are found or a reasonable depth is reached (e.g., 2-3 levels deep). Only use this for finding prerequisite chains.",
    parameters={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query, which should include the course code (e.g., 'MATH 101') and the specific institution name (e.g., 'Example University') to find its prerequisites. Example: 'prerequisites for MATH 101 at Example University'"
            }
        },
        "required": ["query"]
    }
)
search_tool = Tool(function_declarations=[search_web_func])
# --- End Tool Definition ---

def init_chat_routes(app):
    """Initialize Gemini model, Perplexity key, and GridFS for chat routes."""
    global gemini_model, perplexity_api_key

    config = app.config['APP_CONFIG'] # Access config directly from the passed 'app' object
    google_api_key = config.get('GOOGLE_API_KEY')
    perplexity_api_key = config.get('PERPLEXITY_API_KEY') # Load Perplexity key

    # --- Add app context specifically for DB/GridFS access during init ---
    try:
        with app.app_context(): # Push context for the 'get_gridfs' call
            fs_instance = get_gridfs() # Use the accessor function
            if fs_instance:
                print("--- GridFS accessed successfully in init_chat_routes (within context) ---")
                # Use fs_instance here if needed during init
            else:
                # This path shouldn't be hit if init_db runs first and succeeds
                print("!!! WARNING: get_gridfs() returned None in init_chat_routes.")
    except Exception as e:
        print(f"Error during chat routes initialization related to DB/GridFS: {e}")
        # Handle error appropriately
    # --- End app context block ---

    if not google_api_key:
        print("Warning: GOOGLE_API_KEY not set. Gemini features will be disabled.")
        return # Exit initialization if key is missing
    if not perplexity_api_key:
        print("Warning: PERPLEXITY_API_KEY not set. Web search tool will be disabled.")
        # Continue initialization even if Perplexity key is missing

    try:
        genai.configure(api_key=google_api_key)
        model_tools = [search_tool] if perplexity_api_key else None
        gemini_model = genai.GenerativeModel(
            'gemini-1.5-flash',
            tools=model_tools
        )
        print(f"--- Gemini Initialized Successfully {'with Web Search Tool' if model_tools else ''} ---")
    except Exception as e:
        print(f"!!! Gemini Initialization Error: {e}")
        gemini_model = None
        # Decide if you want to clear perplexity_api_key here too


# --- Helper Function for Perplexity API ---
def call_perplexity_api(query: str) -> dict:
    """Calls the Perplexity API with a search query."""
    if not perplexity_api_key:
        print("Error: Perplexity API key not configured.")
        return {"error": "Web search tool not configured."}

    url = "https://api.perplexity.ai/chat/completions"
    payload = {
        "model": "sonar",
        "messages": [
            {"role": "system", "content": "You are an AI assistant specialized in finding and extracting course prerequisite information from web searches. Provide only the prerequisite course codes (e.g., MATH 100, ENGL 1A) or state 'None' if no prerequisites are found."},
            {"role": "user", "content": query}
        ]
    }
    headers = {
        "accept": "application/json",
        "content-type": "application/json",
        "authorization": f"Bearer {perplexity_api_key}"
    }

    try:
        print(f"--- Calling Perplexity API with query: {query} ---")
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        response.raise_for_status()
        result = response.json()
        print(f"--- Perplexity API Response Status: {response.status_code} ---")

        if result.get("choices") and len(result["choices"]) > 0:
            content = result["choices"][0].get("message", {}).get("content")
            if content:
                 return {"result": content}
            else:
                 print("Warning: Perplexity response missing content.")
                 return {"result": "No prerequisite information found in search results."}
        else:
            print("Warning: Perplexity response format unexpected:", result)
            return {"error": "Unexpected response format from Perplexity."}

    except requests.exceptions.RequestException as e:
        print(f"Error calling Perplexity API: {e}")
        return {"error": f"Failed to connect to web search service: {e}"}
    except Exception as e:
        print(f"Unexpected error during Perplexity call: {e}")
        traceback.print_exc()
        return {"error": "An unexpected error occurred during web search."}


# --- Chat Endpoint ---
@chat_bp.route('/chat', methods=['POST'])
def chat_endpoint():
    # Inside the request handler, it's safe to use get_gridfs() which uses 'g'
    fs_request = get_gridfs()
    if fs_request is None:
         print("Error: GridFS not available for this request.")
         return jsonify({"error": "Storage service unavailable"}), 500

    config = current_app.config['APP_CONFIG']
    GOOGLE_CLIENT_ID = config.get('GOOGLE_CLIENT_ID')

    if not GOOGLE_CLIENT_ID:
         print("Error: GOOGLE_CLIENT_ID not configured.")
         return jsonify({"error": "Server configuration error"}), 500 # Return error
    if not gemini_model:
         print("Error: Gemini model not initialized.")
         return jsonify({"error": "Chat service unavailable"}), 500 # Return error
    # Removed the fs check here, using fs_request obtained via get_gridfs()

    # 1. Authentication & Authorization
    try:
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            return jsonify({"error": "Authorization token missing or invalid"}), 401
        token = auth_header.split(' ')[1]
        user_info = verify_google_token(token, GOOGLE_CLIENT_ID)
        user_data = get_or_create_user(user_info)

        # 2. Rate Limiting / Usage Check
        if not check_and_update_usage(user_data):
            now = datetime.now(timezone.utc)
            tomorrow = now.date() + timedelta(days=1)
            tomorrow_midnight_utc = datetime.combine(tomorrow, time(0, 0), tzinfo=timezone.utc)
            reset_time_str = tomorrow_midnight_utc.strftime('%Y-%m-%d %H:%M:%S %Z')
            limit = PREMIUM_TIER_LIMIT if user_data.get('tier') == 'premium' else FREE_TIER_LIMIT
            return jsonify({
                "error": f"Usage limit ({limit} requests/day) exceeded for your tier ('{user_data.get('tier')}'). Please try again after {reset_time_str}."
            }), 429

    except ValueError as auth_err:
        return jsonify({"error": str(auth_err)}), 401
    except Exception as usage_err:
        print(f"Error during usage check: {usage_err}")
        traceback.print_exc()
        return jsonify({"error": "Could not verify usage limits."}), 500

    # 3. Process Request Data
    data = request.get_json()
    if not data or 'new_message' not in data:
        return jsonify({"error": "Missing 'new_message' in request body"}), 400

    new_message_text = data['new_message']
    history = data.get('history', [])
    image_filenames = data.get('image_filenames', [])

    # 4. Prepare Content for Gemini
    prompt_parts = []
    if image_filenames:
        print(f"Processing {len(image_filenames)} images for chat...")
        image_mime_type = "image/png"
        for img_filename in image_filenames:
            try:
                grid_out = fs_request.find_one({"filename": img_filename})
                if grid_out:
                    image_data = grid_out.read()
                    prompt_parts.append({"mime_type": image_mime_type, "data": image_data})
                else:
                    print(f"Warning: Image '{img_filename}' not found in GridFS.")
            except Exception as img_err:
                print(f"Error reading image '{img_filename}' from GridFS: {img_err}")

    prompt_parts.append(new_message_text)

    # 5. Call Gemini API (with Tool Handling)
    try:
        print("Sending initial request to Gemini...")
        api_history = []
        for msg in history:
             role = 'model' if msg.get('role') == 'assistant' else msg.get('role')
             if role in ['user', 'model'] and msg.get('content'):
                 api_history.append({'role': role, 'parts': [msg['content']]})

        chat_session = gemini_model.start_chat(history=api_history)
        response = chat_session.send_message(
            prompt_parts,
            stream=False,
            safety_settings={
                HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
                HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            }
        )

        # --- Tool Handling Loop ---
        while response.candidates and response.candidates[0].content.parts and isinstance(response.candidates[0].content.parts[0], genai.types.FunctionCall):
            function_call = response.candidates[0].content.parts[0].function_call
            print(f"--- Gemini requested Function Call: {function_call.name} ---")

            if function_call.name == "search_web":
                query = function_call.args.get("query")
                if not query:
                    print("Error: Gemini function call 'search_web' missing 'query' argument.")
                    # Use the imported module to access FunctionResponse
                    function_response_part = content_types.FunctionResponse(
                        name="search_web",
                        response={"error": "Missing 'query' argument in function call."}
                    )
                else:
                    search_results = call_perplexity_api(query)
                    # Use the imported module to access FunctionResponse
                    function_response_part = content_types.FunctionResponse(
                        name="search_web",
                        response=search_results
                    )

                print(f"--- Sending Function Response back to Gemini for {function_call.name} ---")
                # Pass the FunctionResponse object directly
                response = chat_session.send_message(content_types.to_content(function_response_part), stream=False)


            else:
                print(f"Error: Unknown function call requested by Gemini: {function_call.name}")
                 # Use the imported module to access FunctionResponse
                function_response_part = content_types.FunctionResponse(
                    name=function_call.name,
                    response={"error": f"Function '{function_call.name}' is not implemented."}
                )
                # Pass the FunctionResponse object directly
                response = chat_session.send_message(content_types.to_content(function_response_part), stream=False)

        # --- Process Final Response ---
        if not response.candidates or not response.candidates[0].content.parts:
             print("Gemini response blocked or empty after processing. Feedback:", response.prompt_feedback if hasattr(response, 'prompt_feedback') else "N/A")
             try:
                 safety_feedback = response.prompt_feedback.safety_ratings if hasattr(response, 'prompt_feedback') and hasattr(response.prompt_feedback, 'safety_ratings') else "No feedback available."
             except Exception as feedback_err:
                 safety_feedback = f"Error accessing feedback: {feedback_err}"
             return jsonify({"error": "Response blocked due to safety settings or empty response.", "details": str(safety_feedback)}), 400

        reply_text = ""
        try:
            if hasattr(response, 'text'):
                reply_text = response.text
            elif response.candidates and response.candidates[0].content.parts:
                 reply_text = "".join(part.text for part in response.candidates[0].content.parts if hasattr(part, 'text'))

            if not reply_text:
                 print("Warning: Could not extract text from final Gemini response.")
                 return jsonify({"error": "AI assistant returned an empty reply."}), 500

        except AttributeError as e:
             print(f"Error accessing final response text: {e}")
             print("Final Gemini Response Object:", response)
             return jsonify({"error": "Failed to parse final AI response."}), 500

        print("Received final reply from Gemini.")
        return jsonify({"reply": reply_text})

    except Exception as e:
        print(f"Error during Gemini interaction: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to get response from AI assistant."}), 500
