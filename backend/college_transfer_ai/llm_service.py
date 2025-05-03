import google.generativeai as genai
import os
from PIL import Image
import io
import traceback
import requests # <-- Add requests import
import json     # <-- Add json import
from .database import get_gridfs # Import GridFS getter

# --- Tool Definition ---
from google.ai.generativelanguage import FunctionDeclaration, Tool, Part
# Import necessary types for function response
from google.protobuf.struct_pb2 import Struct

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

# --- Global Model Variable ---
gemini_model = None

# --- Safety and Generation Config ---
# Define safety settings - adjust as needed
safety_settings = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
]

# Define generation config - adjust as needed
generation_config = genai.types.GenerationConfig(
    # candidate_count=1, # Default is 1
    # stop_sequences=["\n"], # Example stop sequence
    max_output_tokens=8192, # Maximize output tokens for detailed analysis
    temperature=0.7, # Adjust creativity/determinism (0.0-1.0)
    # top_p=0.9, # Nucleus sampling
    # top_k=40 # Top-k sampling
)

# --- Initialization Function ---
def init_llm():
    """Initializes the Gemini LLM client and checks for search API keys."""
    global gemini_model
    if (gemini_model is None):
        try:
            google_api_key = os.getenv("GOOGLE_API_KEY")
            google_search_api_key = os.getenv("GOOGLE_SEARCH_API_KEY") # Check search key
            google_search_engine_id = os.getenv("GOOGLE_SEARCH_ENGINE_ID") # Check search engine ID

            if not google_api_key:
                raise ValueError("GOOGLE_API_KEY environment variable not set.")
            # Add warnings if search keys are missing, as search function will fail
            if not google_search_api_key:
                print("Warning: GOOGLE_SEARCH_API_KEY environment variable not set. Web search function will fail.")
            if not google_search_engine_id:
                print("Warning: GOOGLE_SEARCH_ENGINE_ID environment variable not set. Web search function will fail.")

            genai.configure(api_key=google_api_key)
            # Initialize the model with the tool
            gemini_model = genai.GenerativeModel(
                'gemini-1.5-pro-preview',
                tools=[search_tool] # Pass the tool definition
            )
            print("Gemini LLM initialized successfully with search tool.")
        except Exception as e:
            print(f"Error initializing Gemini LLM: {e}")
            traceback.print_exc()
            gemini_model = None # Ensure it's None on failure

# --- Real Web Search Function ---
def perform_web_search(course_code, institution_name):
    """
    Performs a web search using Google Custom Search API to find prerequisites.
    """
    print(f"--- Performing REAL WEB SEARCH for '{course_code}' at '{institution_name}' ---")
    api_key = os.getenv("GOOGLE_SEARCH_API_KEY")
    search_engine_id = os.getenv("GOOGLE_SEARCH_ENGINE_ID")

    if not api_key or not search_engine_id:
        print("Error: Google Search API Key or Search Engine ID not configured.")
        return "Search could not be performed due to missing configuration."

    # Construct search query
    query = f'"{institution_name}" "{course_code}" prerequisites OR requirements'
    print(f"  Search Query: {query}")

    # Google Custom Search API endpoint
    url = f"https://www.googleapis.com/customsearch/v1"
    params = {
        'key': api_key,
        'cx': search_engine_id,
        'q': query,
        'num': 3 # Request top 3 results
    }

    try:
        response = requests.get(url, params=params, timeout=10) # Add timeout
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)

        search_results = response.json()

        # Extract relevant snippets
        snippets = []
        if 'items' in search_results and search_results['items']:
            for item in search_results['items']:
                title = item.get('title', 'No Title')
                snippet = item.get('snippet', 'No Snippet').replace('\n', ' ') # Clean snippet
                link = item.get('link', '#')
                snippets.append(f"Title: {title}\nSnippet: {snippet}\nLink: {link}")

            if snippets:
                print(f"  Found {len(snippets)} relevant results.")
                # Combine snippets into a single string for the LLM
                return "Web search results:\n\n" + "\n---\n".join(snippets)
            else:
                print("  No relevant items found in search results.")
                return f"Web search did not find specific prerequisite information for '{course_code}' at '{institution_name}'."
        else:
            print("  No items found in search results.")
            return f"Web search returned no results for prerequisites of '{course_code}' at '{institution_name}'."

    except requests.exceptions.RequestException as e:
        print(f"Error during Google Search API request: {e}")
        return f"Web search failed due to a network or API error: {e}"
    except json.JSONDecodeError as e:
         print(f"Error decoding Google Search API response: {e}")
         return "Web search failed due to invalid API response format."
    except Exception as e:
        print(f"An unexpected error occurred during web search: {e}")
        traceback.print_exc()
        return "An unexpected error occurred during web search."
    # --- End Real Web Search ---


# --- Chat Response Generation (Modified for Tool Use) ---
def generate_chat_response(prompt, history, image_filenames=None):
    """
    Generates a chat response using the Gemini LLM, handling potential function calls for web search.
    """
    global gemini_model
    if (gemini_model is None):
        init_llm()
        if (gemini_model is None):
            print("LLM initialization failed. Cannot generate response.")
            return None

    fs = None
    try:
        # --- Construct Content List (Images + Prompt) ---
        content_parts = []
        if image_filenames:
            print(f"Processing {len(image_filenames)} image(s) for LLM...")
            fs = get_gridfs()
            if not fs:
                print("Error: Could not get GridFS instance.")
                return None
            for filename in image_filenames:
                try:
                    grid_out = fs.find_one({"filename": filename})
                    if grid_out:
                        image_bytes = grid_out.read()
                        img = Image.open(io.BytesIO(image_bytes))
                        if img.format in ["PNG", "JPEG", "WEBP"]:
                            content_parts.append(img)
                            # print(f"Added image '{filename}' to LLM content.") # Less verbose
                        else:
                            print(f"Warning: Skipping image '{filename}' due to unsupported format: {img.format}")
                    else:
                        print(f"Warning: Image '{filename}' not found in GridFS.")
                except Exception as img_err:
                    print(f"Error processing image '{filename}': {img_err}")
        content_parts.append(prompt)
        # print("Added text prompt to LLM content.") # Less verbose

        # --- Format History ---
        formatted_history = []
        for msg in history:
            role = 'model' if msg.get('role') in ['bot', 'assistant'] else 'user'
            text_content = msg.get('content', '')
            # Handle potential previous function calls/responses in history if needed
            # For simplicity, assuming history only contains user/model text for now
            formatted_history.append({'role': role, 'parts': [text_content]})

        # --- Start Chat and Send Message ---
        print("Starting LLM chat session...")
        chat = gemini_model.start_chat(history=formatted_history)

        print("Sending message to LLM (potential function call)...")
        response = chat.send_message(
            content_parts,
            generation_config=generation_config,
            safety_settings=safety_settings,
            stream=False
        )

        # --- Handle Function Call ---
        # Check if the response contains a function call request
        if response.candidates and response.candidates[0].content.parts:
            first_part = response.candidates[0].content.parts[0]
            if hasattr(first_part, 'function_call') and first_part.function_call:
                function_call = first_part.function_call
                print(f"LLM requested function call: {function_call.name}")

                if function_call.name == "find_course_prerequisites":
                    # Extract arguments
                    args = function_call.args
                    course = args.get('course_code')
                    institution = args.get('institution_name')
                    print(f"  Arguments: course='{course}', institution='{institution}'")

                    if course and institution:
                        # Execute the REAL search
                        search_result_text = perform_web_search(course, institution) # Calls the new function
                        print(f"  Web search result snippet: {search_result_text[:200]}...") # Log snippet

                        # --- Send Function Response back to LLM ---
                        # Create the Struct for the function response content
                        response_data = Struct()
                        response_data.update({"result": search_result_text})

                        function_response = Part(
                            function_response={
                                "name": "find_course_prerequisites",
                                "response": response_data,
                            }
                        )

                        print("Sending function response back to LLM...")
                        # Send the function response to continue the conversation
                        response = chat.send_message(
                            function_response,
                            stream=False
                        )
                        # The final response should now be in this new 'response' object
                    else:
                        print("Error: Missing arguments for function call.")
                        # Handle error - maybe send back an error message to LLM?
                        # For now, just proceed without calling function
                        pass # Fall through to process the (likely incomplete) response
                else:
                    print(f"Warning: Received unhandled function call request: {function_call.name}")
                    # Handle other function calls if defined, or ignore

        # --- Process Final Response (after potential function call) ---
        print("Processing final LLM response.")
        if response.parts:
            return response.text
        else:
            # Handle blocks or empty responses as before
            print("Warning: Final LLM response was empty or blocked.")
            print(f"Prompt Feedback: {response.prompt_feedback}")
            if response.candidates and response.candidates[0].finish_reason:
                print(f"Finish Reason: {response.candidates[0].finish_reason}")
                print(f"Safety Ratings: {response.candidates[0].safety_ratings}")
            block_reason = "Unknown"
            if response.prompt_feedback and response.prompt_feedback.block_reason:
                block_reason = response.prompt_feedback.block_reason.name
            return f"[LLM response blocked due to: {block_reason}]"

    except Exception as e:
        print(f"LLM generation error: {e}")
        traceback.print_exc()
        return None
    finally:
        pass # GridFS connection managed elsewhere

