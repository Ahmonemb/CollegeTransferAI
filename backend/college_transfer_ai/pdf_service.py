import os
import fitz 
import io
import traceback
from .database import get_gridfs
from .assist_api_client import AssistApiClient

class PdfService:
    def __init__(self, assist_client: AssistApiClient):
        self.assist_client = assist_client
        self.fs = get_gridfs()
        if self.fs is None:
            print("!!! CRITICAL: GridFS not available at PdfService initialization.")
            raise ConnectionError("GridFS is not initialized. Cannot proceed with PdfService.")

    def _generate_pdf_filename(self, type_prefix, year_id, sending_id, receiving_id=None, major_key=None):
        parts = [type_prefix, str(year_id), str(sending_id)]
        if receiving_id is not None:
            parts.append(str(receiving_id))
        if major_key:
            safe_major_key = major_key.replace("/", "_").replace(" ", "-")
            parts.append(safe_major_key)
        return "_".join(parts) + ".pdf"

    def _fetch_and_store_pdf(self, filename, api_call_func, *args):
        if self.fs.exists({"filename": filename}):
            print(f"PDF {filename} already exists in GridFS.")
            return filename

        print(f"Fetching PDF content for {filename} from Assist.org...")
        pdf_content_response = api_call_func(*args)

        if pdf_content_response is None:
            print(f"Failed to fetch PDF content for {filename} (API returned None).")
            return None
        
        if not isinstance(pdf_content_response, bytes):
            print(f"API response for {filename} is not bytes, attempting to encode.")
            try:
                if hasattr(pdf_content_response, 'text'): 
                    pdf_content_response = pdf_content_response.text.encode('utf-8')
                elif isinstance(pdf_content_response, str):
                    pdf_content_response = pdf_content_response.encode('utf-8')
                else:
                    raise TypeError("Unsupported response type for PDF content.")
            except Exception as e:
                print(f"Error encoding PDF content for {filename}: {e}")
                return None

        try:
            with io.BytesIO(pdf_content_response) as pdf_stream:
                doc = fitz.open(stream=pdf_stream, filetype="pdf") 
                if not doc.is_pdf or doc.page_count == 0:
                    print(f"Invalid or empty PDF received for {filename}. Content starts with: {pdf_content_response[:100]}")
                    return None 
                doc.close()

            self.fs.put(pdf_content_response, filename=filename, contentType="application/pdf")
            print(f"Stored PDF {filename} in GridFS.")
            return filename
        except fitz.errors.FitzError as fe:
            print(f"FitzError validating PDF {filename}: {fe}. Content starts with: {pdf_content_response[:200]}")
            return None
        except Exception as e:
            print(f"Error storing PDF {filename} in GridFS: {e}")
            traceback.print_exc()
            return None

    def get_articulation_agreement(self, year_id, sending_id, receiving_id, major_key):
        filename = self._generate_pdf_filename("agreement", year_id, sending_id, receiving_id, major_key)
        return self._fetch_and_store_pdf(
            filename,
            self.assist_client.get_agreement_details,
            major_key
        )

    def get_igetc_courses(self, year_id, sending_institution_id):
        filename = self._generate_pdf_filename("igetc", year_id, sending_institution_id)
        return self._fetch_and_store_pdf(
            filename,
            self.assist_client.get_agreement_details, 
            f"igetc/{year_id}/{sending_institution_id}" 
        )
