import os
import traceback
import requests
import json

# --- Restore Google Gemini Imports ---
import google.generativeai as genai
from google.ai.generativelanguage import FunctionDeclaration, Tool, Part
from google.protobuf.struct_pb2 import Struct
# --- Restore Image/GridFS Imports ---
from PIL import Image
import io
from .database import get_gridfs # Import GridFS getter

# --- Perplexity API Configuration (for search function) ---
PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions"
PERPLEXITY_MODEL = "sonar-medium-online" # Use an online model for search

# --- Restore Google Tool Definition ---
find_prereq_func = FunctionDeclaration(
    name="find_course_prerequisites",
    description="Search the web to find prerequisites for a specific college course at a given institution. Only use if the information is not readily available in the provided documents or general knowledge.",
    parameters={
        "type_": "OBJECT",
        "properties": {
            "course_code": {"type_": "STRING", "description": "The course code (e.g., 'MATH 101', 'CS 50')."},
            "institution_name": {"type_": "STRING", "description": "The full name of the college or university."},
        },
        "required": ["course_code", "institution_name"],
    },
)
search_tool = Tool(function_declarations=[find_prereq_func])
# --- End Tool Definition ---

# --- Global Gemini Model Variable ---
gemini_model = None

# --- Restore Google Safety and Generation Config ---
safety_settings = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
]
generation_config = genai.types.GenerationConfig(
    max_output_tokens=8192,
    temperature=0.7,
)
# --- End Google Config ---

# --- Modified Initialization Function (Accepts config) ---
def init_llm(config): # <-- Accept config dictionary
    """Initializes the Gemini LLM client using provided configuration."""
    print("--- Initializing LLM Service ---")
    global gemini_model
    if gemini_model is None:
        try:
            # Get keys from the config dictionary
            google_api_key = config.get('GOOGLE_API_KEY')
            perplexity_api_key = config.get('PERPLEXITY_API_KEY') # Check Perplexity key too

            # More informative print:
            print(f"LLM Service Check: GOOGLE_API_KEY is {'SET' if google_api_key else 'NOT SET'} (from config)", google_api_key)

            if not google_api_key:
                print("Warning: GOOGLE_API_KEY not found in config. Gemini API will not function.")
                gemini_model = None
                # Optionally raise an error if Gemini is critical
                # raise ValueError("GOOGLE_API_KEY missing in configuration.")
            else:
                print("LLM Service: Configuring Gemini with API key (from config)...")
                genai.configure(api_key=google_api_key)
                # Initialize the Gemini model with the tool
                gemini_model = genai.GenerativeModel(
                    'gemini-1.5-flash-latest', # Or your preferred Gemini model
                    tools=[search_tool]
                )
                print("Gemini LLM initialized successfully with search tool.")

            # Check and report Perplexity key status
            if perplexity_api_key:
                 print("Perplexity API key found in config for search function.")
            else:
                print("Warning: PERPLEXITY_API_KEY not found in config. Web search function will fail.")

        except Exception as e:
            print(f"Error initializing LLM services: {e}")
            traceback.print_exc()
            gemini_model = None # Ensure it's None on failure

# --- Web Search Function (Uses os.getenv - Consider passing config here too) ---
def perform_web_search(course_code, institution_name, config): # <-- Pass config
    """
    Uses Perplexity API to search for prerequisites and returns its response content.
    """
    print(f"--- Performing WEB SEARCH via Perplexity for '{course_code}' at '{institution_name}' ---")
    perplexity_api_key = config.get("PERPLEXITY_API_KEY") # <-- Get from config
    if not perplexity_api_key:
        print("Error: PERPLEXITY_API_KEY not set in config. Cannot perform Perplexity search.")
        return "Search could not be performed due to missing Perplexity configuration."

    # Simple prompt for Perplexity
    search_prompt = f"What are the prerequisites for the course '{course_code}' at '{institution_name}'? Provide details from official sources if possible."

    headers = {
        "Authorization": f"Bearer {perplexity_api_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    payload = {
        "model": PERPLEXITY_MODEL,
        "messages": [
            {"role": "system", "content": "You are an AI assistant helping find course prerequisites."},
            {"role": "user", "content": search_prompt}
        ],
        "temperature": 0.3, # Lower temperature for more factual search results
        "max_tokens": 500, # Limit response length from Perplexity
    }

    try:
        response = requests.post(
            PERPLEXITY_API_URL,
            headers=headers,
            json=payload,
            timeout=60 # Timeout for Perplexity search
        )
        response.raise_for_status()
        result = response.json()

        if result.get("choices") and result["choices"][0].get("message"):
            content = result["choices"][0]["message"].get("content")
            print(f"  Perplexity search successful. Result snippet: {content[:100]}...")
            return content.strip() if content else "Perplexity returned an empty response."
        else:
            print(f"  Warning: Unexpected response format from Perplexity search: {result}")
            return "Perplexity search returned an unexpected format."

    except requests.exceptions.Timeout:
        print("  Error: Request to Perplexity API timed out during search.")
        return "Perplexity search timed out."
    except requests.exceptions.RequestException as e:
        print(f"  Error during Perplexity API search request: {e}")
        return f"Perplexity search failed: {e}"
    except Exception as e:
        print(f"  An unexpected error occurred during Perplexity search: {e}")
        return "An unexpected error occurred during Perplexity search."
# --- End Web Search Function ---


# --- Chat Response Generation (Using Gemini with Function Calling AND Image Support) ---
def generate_chat_response(prompt, history, image_filenames=None, config=None): # <-- Accept config
    """
    Generates a chat response using the Gemini LLM, handling images and
    potential function calls to perform web search via Perplexity.
    Requires config if web search might be needed.
    """
    global gemini_model
    if gemini_model is None:
        if not config:
             print("Error: LLM not initialized and no config provided to initialize it.")
             return "[LLM Service Error: Not Initialized]"
        init_llm(config) # Try to initialize if config is provided
        if gemini_model is None:
            print("LLM initialization failed. Cannot generate response.")
            return "[LLM Service Error: Initialization Failed]"

    fs = None # Initialize fs
    try:
        # --- Construct Content List (Images + Prompt) ---
        content_parts = []
        if image_filenames:
            print(f"Processing {len(image_filenames)} image(s) for Gemini...")
            fs = get_gridfs() # Get GridFS instance
            if not fs:
                print("Error: Could not get GridFS instance for image processing.")
                # Decide how to proceed: return error or continue without images?
                # Let's continue without images for now, but log the error.
            else:
                for filename in image_filenames:
                    try:
                        grid_out = fs.find_one({"filename": filename})
                        if grid_out:
                            image_bytes = grid_out.read()
                            # Verify image format if necessary, Gemini supports PNG, JPEG, WEBP, HEIC, HEIF
                            img = Image.open(io.BytesIO(image_bytes))
                            # Append the PIL Image object directly
                            content_parts.append(img)
                            print(f"  Added image '{filename}' to content parts.")
                        else:
                            print(f"Warning: Image '{filename}' not found in GridFS.")
                    except Exception as img_err:
                        print(f"Error processing image '{filename}': {img_err}")
                        # Continue processing other images/prompt

        # Always add the text prompt
        content_parts.append(prompt)
        print("Added text prompt to LLM content.")
        # --- End Content List Construction ---


        # --- Format History (for Gemini) ---
        formatted_history = []
        for msg in history:
            role = 'model' if msg.get('role') in ['bot', 'assistant'] else 'user'
            # Ensure history parts are correctly formatted if function calls were involved previously
            # Assuming simple text history for now
            formatted_history.append({'role': role, 'parts': [msg.get('content', '')]})

        # --- Start Chat and Send Message ---
        print("Starting Gemini LLM chat session...")
        chat = gemini_model.start_chat(history=formatted_history)

        print("Sending message to Gemini (potential function call)...")
        response = chat.send_message(
            content_parts, # Pass the list containing images and text
            generation_config=generation_config,
            safety_settings=safety_settings,
            stream=False
        )

        # --- Handle Function Call (if requested by Gemini) ---
        if response.candidates and response.candidates[0].content.parts:
            first_part = response.candidates[0].content.parts[0]
            if hasattr(first_part, 'function_call') and first_part.function_call:
                function_call = first_part.function_call
                print(f"Gemini requested function call: {function_call.name}")

                if function_call.name == "find_course_prerequisites":
                    args = function_call.args
                    course = args.get('course_code')
                    institution = args.get('institution_name')
                    print(f"  Arguments: course='{course}', institution='{institution}'")

                    if course and institution:
                        if not config:
                             print("Error: Config needed for web search but not provided.")
                             search_result_text = "Web search failed: Configuration missing."
                        else:
                             # Execute the search using Perplexity via our function
                             search_result_text = perform_web_search(course, institution, config) # <-- Pass config

                        # --- Send Function Response back to Gemini ---
                        response_data = Struct()
                        response_data.update({"result": search_result_text}) # Send Perplexity's response text

                        function_response = Part(
                            function_response={
                                "name": "find_course_prerequisites",
                                "response": response_data,
                            }
                        )

                        print("Sending function response (from Perplexity search) back to Gemini...")
                        # Send the function response to continue the conversation
                        response = chat.send_message(
                            function_response,
                            stream=False
                        )
                        # The final response should now be in this new 'response' object
                    else:
                        print("Error: Missing arguments for function call.")
                        # Handle error - maybe send back an error message to Gemini?
                        pass # Fall through
                else:
                    print(f"Warning: Received unhandled function call request: {function_call.name}")

        # --- Process Final Gemini Response ---
        print("Processing final Gemini response.")
        if response.parts:
            return response.text
        else:
            # Handle blocks or empty responses
            print("Warning: Final Gemini response was empty or blocked.")
            print(f"Prompt Feedback: {response.prompt_feedback}")
            if response.candidates and response.candidates[0].finish_reason:
                print(f"Finish Reason: {response.candidates[0].finish_reason}")
                print(f"Safety Ratings: {response.candidates[0].safety_ratings}")
            block_reason = "Unknown"
            if response.prompt_feedback and response.prompt_feedback.block_reason:
                block_reason = response.prompt_feedback.block_reason.name
            return f"[LLM response blocked due to: {block_reason}]" # Gemini block reason

    except Exception as e:
        print(f"LLM generation error (Gemini): {e}")
        traceback.print_exc()
        return None # Or an error message string
    finally:
        # GridFS connection is managed by the getter, no explicit close needed here
        pass

