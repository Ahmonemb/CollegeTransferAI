\
import google.generativeai as genai
import os
from PIL import Image
import io
import traceback
from .database import get_gridfs # Import GridFS getter

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
    """Initializes the Gemini LLM client."""
    global gemini_model
    if gemini_model is None:
        try:
            google_api_key = os.getenv("GOOGLE_API_KEY")
            if not google_api_key:
                raise ValueError("GOOGLE_API_KEY environment variable not set.")
            genai.configure(api_key=google_api_key)
            # Use the latest flash model for speed and cost-effectiveness
            gemini_model = genai.GenerativeModel(
                'gemini-1.5-flash-latest',
                # generation_config=generation_config, # Apply config here if not using start_chat
                # safety_settings=safety_settings # Apply safety here if not using start_chat
            )
            print("Gemini LLM initialized successfully.")
        except Exception as e:
            print(f"Error initializing Gemini LLM: {e}")
            traceback.print_exc()
            gemini_model = None # Ensure it's None on failure

# --- Chat Response Generation ---
def generate_chat_response(prompt, history, image_filenames=None):
    """
    Generates a chat response using the Gemini LLM, optionally including images.

    Args:
        prompt (str): The user's latest message/prompt.
        history (list): A list of previous messages in the format
                        [{'role': 'user'/'model', 'parts': ['message text']}, ...].
                        Note: 'model' corresponds to 'assistant' in some contexts.
        image_filenames (list, optional): A list of filenames for images stored in GridFS
                                          to be included in the prompt. Defaults to None.

    Returns:
        str: The generated text response from the LLM, or None if an error occurs.
    """
    global gemini_model
    if gemini_model is None:
        init_llm()
        if gemini_model is None: # Check if initialization failed
            print("LLM initialization failed. Cannot generate response.")
            return None

    fs = None
    try:
        # --- Construct Content List ---
        content_parts = []

        # 1. Add Images (if provided)
        if image_filenames:
            print(f"Processing {len(image_filenames)} image(s) for LLM...")
            fs = get_gridfs() # Get GridFS instance
            if not fs:
                 print("Error: Could not get GridFS instance.")
                 return None

            for filename in image_filenames:
                try:
                    grid_out = fs.find_one({"filename": filename})
                    if grid_out:
                        image_bytes = grid_out.read()
                        img = Image.open(io.BytesIO(image_bytes))
                        # Ensure image format is supported (e.g., PNG, JPEG)
                        if img.format in ["PNG", "JPEG", "WEBP"]:
                             content_parts.append(img)
                             print(f"Added image '{filename}' to LLM content.")
                        else:
                             print(f"Warning: Skipping image '{filename}' due to unsupported format: {img.format}")
                    else:
                        print(f"Warning: Image '{filename}' not found in GridFS.")
                except Exception as img_err:
                    print(f"Error processing image '{filename}': {img_err}")
                    # Decide whether to continue or fail if an image fails
                    # continue

        # 2. Add Text Prompt
        content_parts.append(prompt)
        print("Added text prompt to LLM content.")

        # --- Format History for Gemini API ---
        # Gemini expects history as [{'role': 'user'/'model', 'parts': [text]}, ...]
        formatted_history = []
        for msg in history:
            # Map 'bot' or 'assistant' to 'model'
            role = 'model' if msg.get('role') in ['bot', 'assistant'] else 'user'
            # Ensure 'content' exists and create the 'parts' list
            text_content = msg.get('content', '')
            formatted_history.append({'role': role, 'parts': [text_content]})

        # --- Start Chat and Send Message ---
        print("Starting LLM chat session...")
        chat = gemini_model.start_chat(history=formatted_history)

        print("Sending message to LLM...")
        # Pass safety settings and config to send_message
        response = chat.send_message(
            content_parts,
            generation_config=generation_config,
            safety_settings=safety_settings,
            stream=False # Set to False for a single response object
        )

        print("Received response from LLM.")
        # --- Process Response ---
        # Handle potential blocks or empty responses
        if response.parts:
            # Check for finish_reason if needed (e.g., SAFETY, RECITATION)
            # print(f"LLM Finish Reason: {response.prompt_feedback}") # or response.candidates[0].finish_reason
            return response.text
        else:
            print("Warning: LLM response was empty or blocked.")
            # You might want to inspect response.prompt_feedback or response.candidates[0].finish_reason
            print(f"Prompt Feedback: {response.prompt_feedback}")
            if response.candidates and response.candidates[0].finish_reason:
                 print(f"Finish Reason: {response.candidates[0].finish_reason}")
                 print(f"Safety Ratings: {response.candidates[0].safety_ratings}")

            # Return a specific message or None based on the block reason
            block_reason = "Unknown"
            if response.prompt_feedback and response.prompt_feedback.block_reason:
                 block_reason = response.prompt_feedback.block_reason.name
            return f"[LLM response blocked due to: {block_reason}]"


    except Exception as e:
        print(f"LLM generation error: {e}")
        traceback.print_exc()
        return None # Indicate failure
    finally:
        # Note: GridFS connection closing is handled by the context manager in get_gridfs if implemented that way,
        # or needs explicit closing if not. Assuming get_gridfs handles it or connection pooling is used.
        pass

