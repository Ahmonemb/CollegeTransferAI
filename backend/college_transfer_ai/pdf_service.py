from playwright.sync_api import sync_playwright
import gridfs
import traceback
# Use absolute import
from .helpers.mongo_helper import get_mongo_client
# Use absolute import
from college_transfer_ai.assist_api_client import AssistApiClient

class PdfService:
    def __init__(self, assist_api_client: AssistApiClient):
        self.assist_api_client = assist_api_client
        # Initialize GridFS connection here or pass db/fs instance
        # For simplicity, getting client on demand, but consider managing lifetime
        # self.mongo_client = get_mongo_client()
        # self.db = self.mongo_client["CollegeTransferAICluster"]
        # self.fs = gridfs.GridFS(self.db)

    def _get_gridfs_instance(self):
        """Helper to get a GridFS instance, managing client connection."""
        client = get_mongo_client()
        db = client["CollegeTransferAICluster"] # Use correct DB name if needed
        fs = gridfs.GridFS(db)
        return client, fs # Return client to close it later

    def get_articulation_agreement(self, academic_year_id, sending_institution_id, receiving_institution_id, key):
        print(f"Fetching articulation agreement for key: {key}")
        mongo_client = None # Initialize client to None outside try
        try:
            print(f"Academic Year ID: {academic_year_id}, Sending Institution ID: {sending_institution_id}, Receiving Institution ID: {receiving_institution_id}")

            # Use the injected assist_api_client instance
            college_name = self.assist_api_client.get_institution_name(sending_institution_id)
            receiving_name = self.assist_api_client.get_institution_name(receiving_institution_id)
            major_name = self.assist_api_client.get_major_from_key(key)
            year_name = self.assist_api_client.get_year_from_id(academic_year_id)

            # Check for failure indicators from get_major_from_key
            major_lookup_failed = major_name in ["Request Failed", "No Reports Found", "Key Not Found", "Label Not Found"]

            if not all([college_name, receiving_name, major_name, year_name]) or major_lookup_failed:
                 print(f"Warning: Could not resolve all names for key {key}. Using fallback names.")
                 college_name = college_name or f"sending_{sending_institution_id}"
                 receiving_name = receiving_name or f"receiving_{receiving_institution_id}"
                 major_name = major_name if not major_lookup_failed else f"major_{key.split('/')[-1]}"
                 year_name = year_name or f"year_{academic_year_id}"

            # Sanitize names for filename
            college_name_safe = college_name.replace(" ", "_").replace("/", "_")
            receiving_name_safe = receiving_name.replace(" ", "_").replace("/", "_")
            major_name_safe = major_name.replace(" ", "_").replace("/", "_")
            year_name_safe = year_name.replace(" ", "_").replace("/", "_")

            filename = (
                f"{college_name_safe}_to_"
                f"{receiving_name_safe}_"
                f"{major_name_safe}_"
                f"{year_name_safe}.pdf"
            )
            filename = filename.replace('/', '_').replace('\\', '_') # Basic sanitization
            print(f"Generated filename: {filename}")

            # --- Check if already exists in GridFS ---
            mongo_client, fs = self._get_gridfs_instance() # Get client and fs
            if fs.find_one({"filename": filename}):
                print(f"PDF '{filename}' already exists in GridFS. Skipping download.")
                return filename # Return existing filename (client closed in finally)

            # --- Construct URL ---
            viewBy = "major"
            if "Department" in key: viewBy = "dept"

            # Simplified URL construction
            base_url_part = (
                f"https://assist.org/transfer/results?year={academic_year_id}"
                f"&institution={sending_institution_id}"
                f"&agreement={receiving_institution_id}"
                f"&agreementType=to&viewAgreementsOptions=true&view=agreement"
                f"&viewBy={viewBy}&viewByKey={key}"
            )
            if viewBy == "dept" and "SendingDepartment" in key:
                 url = base_url_part + "&viewSendingAgreements=true"
            else:
                 url = base_url_part

            print(f"Attempting to fetch PDF from URL: {url}")

            pdf_bytes = None
            with sync_playwright() as p:
                browser = None
                try:
                    browser = p.chromium.launch(headless=True)
                    page = browser.new_page()
                    page.goto(url, wait_until="networkidle", timeout=60000)
                    header_selector = '//*[@id="view-results"]/app-report-preview/div[2]/awc-agreement/div/awc-report-header/div[3]/h1'
                    print(f"Waiting for selector '{header_selector}' indicating page load...")
                    page.wait_for_selector(header_selector, timeout=30000)
                    print("Selector found. Proceeding with PDF generation.")
                    pdf_bytes = page.pdf(format="A4")
                    print(f"Successfully downloaded PDF bytes (size: {len(pdf_bytes)} bytes)")
                except Exception as playwright_err:
                     print(f"Playwright error fetching PDF from {url}: {playwright_err}")
                     # No need to return here, let finally handle client close
                finally:
                    if browser: browser.close()

            if pdf_bytes:
                try:
                    fs.put(pdf_bytes, filename=filename, contentType='application/pdf')
                    print(f"Successfully saved PDF '{filename}' to GridFS.")
                    return filename # Return filename on success (client closed in finally)
                except Exception as gridfs_err:
                    print(f"Error saving PDF '{filename}' to GridFS: {gridfs_err}")
                    return None # Return None on GridFS error (client closed in finally)
            else:
                 print("Failed to obtain PDF bytes, cannot save.")
                 return None # Return None if PDF download failed (client closed in finally)

        except Exception as e:
            print(f"General error in get_articulation_agreement for key {key}: {e}")
            traceback.print_exc()
            return None
        finally:
            if mongo_client: # Close client if it was successfully created
                print("Closing MongoDB client connection.")
                mongo_client.close()

    def get_igetc_courses(self, academic_year_id, sending_institution_id):
        print("Fetching IGETC agreement for")
        mongo_client = None # Initialize client to None outside try
        try:
            # Use the injected assist_api_client instance
            college_name = self.assist_api_client.get_institution_name(sending_institution_id)
            year_name = self.assist_api_client.get_year_from_id(academic_year_id)

            if not all([college_name, year_name]):
                 college_name = college_name or f"sending_{sending_institution_id}"
                 year_name = year_name or f"year_{academic_year_id}"

            college_name_safe = college_name.replace(" ", "_").replace("/", "_")
            year_name_safe = year_name.replace(" ", "_").replace("/", "_")

            filename = (
                f"{college_name_safe}_IGETC_"
                f"{year_name_safe}.pdf"
            )
            filename = filename.replace('/', '_').replace('\\', '_')
            print(f"Generated filename: {filename}")

            mongo_client, fs = self._get_gridfs_instance() # Get client and fs
            if fs.find_one({"filename": filename}):
                print(f"PDF '{filename}' already exists in GridFS. Skipping download.")
                return filename # Return existing filename (client closed in finally)

            url = (
                f"https://assist.org/transfer/results?year={academic_year_id}"
                f"&institution={sending_institution_id}"
                f"&type=IGETC&view=transferability&viewBy=igetcArea"
                f"&viewSendingAgreements=false&viewByKey=all"
            )
            print(f"Attempting to fetch IGETC from URL: {url}")

            pdf_bytes = None
            with sync_playwright() as p:
                browser = None
                try:
                    browser = p.chromium.launch(headless=True)
                    page = browser.new_page()
                    page.goto(url, wait_until="networkidle", timeout=60000)
                    # --- Improved Wait Condition ---
                    igetc_content_selector = 'div > div > div > awc-print-header > table > tbody > tr > td > div > div:nth-child(1) > h4.areaTitle'
                    print(f"Waiting for selector '{igetc_content_selector}' indicating IGETC page load...")
                    page.wait_for_selector(igetc_content_selector, timeout=30000)
                    print("Selector found. Proceeding with PDF generation.")
                    # --- End Improved Wait ---
                    pdf_bytes = page.pdf(format="A4")
                    print(f"Successfully downloaded PDF bytes (size: {len(pdf_bytes)} bytes)")
                except Exception as playwright_err:
                     print(f"Playwright error fetching PDF from {url}: {playwright_err}")
                     # Let finally handle client close
                finally:
                    if browser: browser.close()

            if pdf_bytes:
                try:
                    fs.put(pdf_bytes, filename=filename, contentType='application/pdf')
                    print(f"Successfully saved PDF '{filename}' to GridFS.")
                    return filename # Return filename on success (client closed in finally)
                except Exception as gridfs_err:
                    print(f"Error saving PDF '{filename}' to GridFS: {gridfs_err}")
                    return None # Return None on GridFS error (client closed in finally)
            else:
                 print("Failed to obtain PDF bytes, cannot save.")
                 return None # Return None if PDF download failed (client closed in finally)

        except Exception as e:
            print(f"General error in get_igetc_courses: {e}")
            traceback.print_exc()
            return None
        finally:
            if mongo_client: # Close client if it was successfully created
                print("Closing MongoDB client connection.")
                mongo_client.close()
