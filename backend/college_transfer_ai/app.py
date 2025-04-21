import os
from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from backend.college_transfer_ai.college_transfer_API import CollegeTransferAPI
import json
import gridfs
from pymongo import MongoClient
import fitz  # Import PyMuPDF
import base64 # Needed for image encoding
from openai import OpenAI # Import OpenAI library
from dotenv import load_dotenv # To load environment variables

print("--- Flask app.py loading ---")

# Load environment variables from .env file
load_dotenv()

# --- OpenAI Client Setup ---
# Ensure you have OPENAI_API_KEY set in your .env file or environment variables
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    print("Warning: OPENAI_API_KEY environment variable not set.")
    # Optionally, raise an error or handle appropriately
    # raise ValueError("OPENAI_API_KEY environment variable not set.")
openai_client = OpenAI(api_key=openai_api_key)
# --- End OpenAI Setup ---


BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, 'templates'),
    static_folder=os.path.join(BASE_DIR, 'static')
)
CORS(app)

# --- Set Max Request Size ---
# Example: Limit request size to 16 megabytes
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
# --- End Max Request Size ---

api = CollegeTransferAPI()

# --- MongoDB Setup ---
MONGO_URI = os.getenv("MONGO_URI") # Use env var or default
client = MongoClient(MONGO_URI)
db = client["CollegeTransferAICluster"] # Consider using a specific DB name from env var if needed
fs = gridfs.GridFS(db)
# --- End MongoDB Setup ---

@app.route('/')
def home():
    return "College Transfer AI API is running."

# Endpoint to get all institutions
@app.route('/institutions', methods=['GET'])
def get_institutions():
    try:
        institutions = api.get_sending_institutions()
        return jsonify(institutions)
    except Exception as e:
        print(f"Error in /institutions: {e}")
        return jsonify({"error": str(e)}), 500

# Endpoint to get receiving institutions
@app.route('/receiving-institutions', methods=['GET'])
def get_receiving_institutions():
    sending_institution_id = request.args.get('sendingInstitutionId')
    if not sending_institution_id:
        return jsonify({"error": "Missing sendingInstitutionId parameter"}), 400
    try:
        non_ccs = api.get_receiving_institutions(sending_institution_id)
        return jsonify(non_ccs)
    except Exception as e:
        print(f"Error in /receiving-institutions: {e}")
        return jsonify({"error": str(e)}), 500

# Endpoint to get academic years
@app.route('/academic-years', methods=['GET'])
def get_academic_years():
    try:
        academic_years = api.get_academic_years()
        return jsonify(academic_years)
    except Exception as e:
        print(f"Error in /academic-years: {e}")
        return jsonify({"error": str(e)}), 500

# Endpoint to get majors
@app.route('/majors', methods=['GET'])
def get_all_majors():
    sending_institution_id = request.args.get('sendingInstitutionId')
    receiving_institution_id = request.args.get('receivingInstitutionId')
    academic_year_id = request.args.get('academicYearId')
    category_code = request.args.get('categoryCode')
    if not all([sending_institution_id, receiving_institution_id, academic_year_id, category_code]):
        return jsonify({"error": "Missing required parameters (sendingInstitutionId, receivingInstitutionId, academicYearId, categoryCode)"}), 400
    try:
        majors = api.get_all_majors(sending_institution_id, receiving_institution_id, academic_year_id, category_code)
        return jsonify(majors)
    except Exception as e:
        print(f"Error in /majors: {e}")
        return jsonify({"error": str(e)}), 500

# Endpoint to get articulation agreement PDF filename
@app.route('/articulation-agreement', methods=['GET'])
def get_articulation_agreement():
    key = request.args.get("key")
    if not key:
        return jsonify({"error": "Missing key parameter"}), 400
    try:
        keyArray = key.split("/")
        if len(keyArray) < 4:
             return jsonify({"error": "Invalid key format"}), 400
        sending_institution_id = int(keyArray[1])
        receiving_institution_id = int(keyArray[3])
        academic_year_id = int(keyArray[0])
        pdf_filename = api.get_articulation_agreement(academic_year_id, sending_institution_id, receiving_institution_id, key)
        return jsonify({"pdf_filename": pdf_filename})
    except ValueError:
         return jsonify({"error": "Invalid numeric value in key"}), 400
    except Exception as e:
        print(f"Error in /articulation-agreement: {e}")
        return jsonify({"error": str(e)}), 500

# Endpoint to get image filenames for a PDF (extracts if needed)
@app.route('/pdf-images/<filename>')
def get_pdf_images(filename):
    try:
        pdf_file = fs.find_one({"filename": filename})
        if not pdf_file:
            return jsonify({"error": "PDF not found"}), 404

        pdf_bytes = pdf_file.read()
        doc = fitz.open("pdf", pdf_bytes)
        image_filenames = []

        # Check cache
        first_image_name = f"{filename}_page_0.png"
        if fs.exists({"filename": first_image_name}):
             for page_num in range(len(doc)):
                 img_filename = f"{filename}_page_{page_num}.png"
                 # Verify each image exists, not just the first
                 if fs.exists({"filename": img_filename}):
                     image_filenames.append(img_filename)
                 else:
                     # If one is missing, break and regenerate all (or handle differently)
                     print(f"Cache incomplete, image {img_filename} missing. Regenerating.")
                     image_filenames = [] # Reset
                     break
             if image_filenames: # If loop completed without break
                 print(f"All images for {filename} found in cache.")
                 doc.close()
                 return jsonify({"image_filenames": image_filenames})

        # If not fully cached, extract/save
        print(f"Generating images for {filename}...")
        image_filenames = [] # Ensure it's empty before regenerating
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            pix = page.get_pixmap(dpi=150)
            img_bytes = pix.tobytes("png")
            img_filename = f"{filename}_page_{page_num}.png"

            # Delete existing before putting new one (optional, ensures overwrite)
            existing_file = fs.find_one({"filename": img_filename})
            if existing_file:
                fs.delete(existing_file._id)

            fs.put(img_bytes, filename=img_filename, contentType='image/png')
            image_filenames.append(img_filename)
            print(f"Saved image {img_filename}")

        doc.close()
        return jsonify({"image_filenames": image_filenames})

    except Exception as e:
        print(f"Error extracting images for {filename}: {e}")
        return jsonify({"error": f"Failed to extract images: {str(e)}"}), 500

# Endpoint to serve a single image
@app.route('/image/<image_filename>')
def serve_image(image_filename):
    try:
        grid_out = fs.find_one({"filename": image_filename})
        if not grid_out:
            return "Image not found", 404
        image_data = grid_out.read()
        # Use content type from GridFS if available, default to image/png
        response_mimetype = getattr(grid_out, 'contentType', 'image/png')
        response = Response(image_data, mimetype=response_mimetype)
        return response
    except Exception as e:
        print(f"Error serving image {image_filename}: {e}")
        return jsonify({"error": f"Failed to serve image: {str(e)}"}), 500

# --- NEW: Chat Endpoint ---
@app.route('/chat', methods=['POST'])
def chat_with_agreement():
    if not openai_client:
         return jsonify({"error": "OpenAI client not configured. Check API key."}), 500

    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid JSON payload"}), 400

        user_message = data.get('message')
        image_filenames = data.get('image_filenames')

        if not user_message or not image_filenames:
            return jsonify({"error": "Missing 'message' or 'image_filenames' in request"}), 400

        if not isinstance(image_filenames, list):
             return jsonify({"error": "'image_filenames' must be a list"}), 400

        print(f"Received chat request: '{user_message}' with {len(image_filenames)} images.")

        # Prepare message content for OpenAI API (multimodal)
        openai_message_content = [{"type": "text", "text": user_message}]
        image_count = 0
        for filename in image_filenames:
            try:
                grid_out = fs.find_one({"filename": filename})
                if not grid_out:
                    print(f"Warning: Image '{filename}' not found in GridFS. Skipping.")
                    continue # Skip this image

                image_data = grid_out.read()
                base64_image = base64.b64encode(image_data).decode('utf-8')
                openai_message_content.append({
                    "type": "image_url",
                    "image_url": {
                        # Ensure correct mime type if not always PNG
                        "url": f"data:{getattr(grid_out, 'contentType', 'image/png')};base64,{base64_image}"
                    }
                })
                image_count += 1
            except Exception as img_err:
                print(f"Error reading/encoding image {filename}: {img_err}. Skipping.")
                # Optionally return an error if images are critical
                # return jsonify({"error": f"Failed to process image {filename}: {img_err}"}), 500

        if image_count == 0:
             return jsonify({"error": "No valid images found or processed for context."}), 400

        # Call OpenAI API
        print(f"Sending request to OpenAI with text and {image_count} images...")
        try:
            chat_completion = openai_client.chat.completions.create(
                model="gpt-4o-mini", # Use the appropriate vision model
                messages=[
                    {
                        "role": "user",
                        "content": openai_message_content,
                    }
                ],
                max_tokens=1000 # Adjust as needed
            )

            # Extract the reply
            reply = chat_completion.choices[0].message.content
            print(f"Received reply from OpenAI: '{reply[:100]}...'") # Log snippet
            return jsonify({"reply": reply})

        except Exception as openai_err:
            print(f"OpenAI API error: {openai_err}")
            return jsonify({"error": f"OpenAI API error: {str(openai_err)}"}), 500

    except Exception as e:
        print(f"Error in /chat endpoint: {e}")
        return jsonify({"error": f"An unexpected error occurred: {str(e)}"}), 500
# --- End Chat Endpoint ---

if __name__ == '__main__':
    # Use host='0.0.0.0' to be accessible on the network if needed
    # Use debug=False in production
    app.run(host='0.0.0.0', port=5000, debug=True)