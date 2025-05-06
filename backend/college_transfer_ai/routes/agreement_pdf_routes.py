# filepath: backend/college_transfer_ai/routes/agreement_pdf_routes.py
import traceback
import io
import fitz # PyMuPDF - Keep import here for image generation
from flask import Blueprint, jsonify, request, send_file, make_response
from ..database import get_gridfs # Keep for serving images
# Import the specific PDF fetching function and the client for name resolution
from ..pdf_service import PdfService
from ..assist_api_client import assist_client

agreement_pdf_bp = Blueprint('agreement_pdf_bp', __name__) # Removed url_prefix, assuming it's added during registration

# Remove global fs variable: fs = None
# Remove unused init function: def init_pdf_routes(app): ...

# Initialize the PDF service instance (assuming assist_client is available globally or passed appropriately)
# If assist_client relies on app context, this might need adjustment or lazy initialization.
pdf_service_instance = PdfService(assist_client)

@agreement_pdf_bp.route('/articulation-agreements', methods=['POST'])
def get_articulation_agreements():
    data = request.get_json()
    sending_ids = data.get('sending_ids')
    receiving_id = data.get('receiving_id')
    year_id = data.get('year_id')
    major_key = data.get('major_key')

    if not sending_ids or not isinstance(sending_ids, list) or not receiving_id or not year_id or not major_key:
        return jsonify({"error": "Missing or invalid parameters (sending_ids list, receiving_id, year_id, major_key)"}), 400

    results = []
    errors = []

    for sending_id in sending_ids:
        sending_name = assist_client.get_institution_name(sending_id) or f"ID {sending_id}"
        try:
            key_parts = major_key.split("/")
            if len(key_parts) > 1:
                key_parts[1] = str(sending_id)
                current_major_key = "/".join(key_parts)
            else:
                print(f"Warning: Unexpected major_key format '{major_key}'. Using original.")
                current_major_key = major_key

            pdf_filename = pdf_service_instance.get_articulation_agreement(
                year_id, sending_id, receiving_id, current_major_key
            )

            results.append({
                 "sendingId": sending_id,
                 "sendingName": sending_name,
                 "pdfFilename": pdf_filename
            })
            if not pdf_filename:
                 print(f"PDF generation/fetch failed for Sending ID {sending_id} / Major Key {current_major_key}.")

        except Exception as e:
            error_msg = f"Error processing request for Sending ID {sending_id}: {e}"
            print(error_msg)
            traceback.print_exc()
            errors.append(error_msg)
            results.append({
                 "sendingId": sending_id,
                 "sendingName": sending_name,
                 "pdfFilename": None,
                 "error": str(e)
            })

    if not results and errors:
         return jsonify({"error": "Failed to process any agreement requests.", "details": errors}), 500
    elif errors:
         has_success = any(item.get('pdfFilename') for item in results if not item.get('error'))
         status_code = 207 if has_success else 500
         message = "Partial success fetching agreements." if has_success else "Failed to fetch any agreements."
         print(f"{message} Errors: {errors}")
         return jsonify({"agreements": results, "warnings": errors}), status_code
    elif not any(item.get('pdfFilename') for item in results):
         return jsonify({"agreements": results, "message": "No articulation agreements found or generated for the selected criteria."}), 200
    else:
         return jsonify({"agreements": results}), 200


@agreement_pdf_bp.route('/pdf-images/<path:filename>', methods=['GET'])
def get_pdf_images(filename):
    """
    Checks if images for a PDF exist in GridFS. If not, generates, stores,
    and returns them. If they exist, returns the existing filenames.
    """
    fs = get_gridfs() # Get GridFS instance directly
    if fs is None:
        print("Error: GridFS not available when requested in get_pdf_images.") # More specific log
        return jsonify({"error": "Storage service not available."}), 503

    try:
        # Check for existing sorted images
        existing_images_cursor = fs.find(
            {"metadata.original_pdf": filename, "contentType": "image/png"},
            sort=[("metadata.page_number", 1)] # Sort by page number
        )
        existing_images = list(existing_images_cursor)

        if existing_images:
            image_filenames = [img.filename for img in existing_images]
            print(f"Found {len(image_filenames)} existing images for {filename} (sorted)")
            return jsonify({"image_filenames": image_filenames})

        # If not found, generate images
        print(f"Generating images for {filename}...")
        grid_out = fs.find_one({"filename": filename})
        if not grid_out:
            return jsonify({"error": f"PDF file '{filename}' not found in storage."}), 404

        pdf_data = grid_out.read()
        doc = fitz.open(stream=pdf_data, filetype="pdf")
        image_filenames = []
        zoom = 2 # Increase resolution
        mat = fitz.Matrix(zoom, zoom)
        generated_files_metadata = [] # Store metadata to sort later

        for i, page in enumerate(doc):
            try:
                pix = page.get_pixmap(matrix=mat)
                img_bytes = pix.tobytes("png")
                image_filename = f"{filename}_page_{i}.png"
                # Store with metadata including original PDF and page number
                fs.put(
                    img_bytes,
                    filename=image_filename,
                    contentType="image/png",
                    metadata={"original_pdf": filename, "page_number": i}
                )
                generated_files_metadata.append({"filename": image_filename, "page_number": i})
            except Exception as page_err:
                 print(f"Error processing page {i} for {filename}: {page_err}")
                 # Decide if you want to skip the page or fail the whole process

        doc.close()

        # Sort the generated filenames by page number before returning
        generated_files_metadata.sort(key=lambda x: x["page_number"])
        image_filenames = [item["filename"] for item in generated_files_metadata]

        print(f"Stored {len(image_filenames)} images for {filename}")
        return jsonify({"image_filenames": image_filenames})

    except Exception as e:
        print(f"Error getting/generating images for {filename}: {e}")
        traceback.print_exc()
        return jsonify({"error": f"Failed to process PDF '{filename}': {str(e)}"}), 500


@agreement_pdf_bp.route('/image/<path:filename>', methods=['GET'])
def get_image(filename):
    """Serves an image file directly from GridFS with cache headers."""
    fs = get_gridfs() # Get GridFS instance directly
    if fs is None:
        print("Error: GridFS not available when requested in get_image.") # More specific log
        return jsonify({"error": "Storage service not available."}), 503

    grid_out = None
    try:
        grid_out = fs.find_one({"filename": filename})
        if not grid_out:
            return jsonify({"error": "Image not found"}), 404

        image_data_stream = io.BytesIO(grid_out.read())
        response = make_response(send_file(
            image_data_stream,
            mimetype=grid_out.contentType or 'image/png',
            as_attachment=False,
            download_name=grid_out.filename
        ))
        # Set cache headers for immutable content
        response.headers['Cache-Control'] = 'public, immutable, max-age=31536000'
        return response

    except Exception as e:
        print(f"Error serving image {filename}: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to serve image"}), 500
