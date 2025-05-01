import requests
from playwright.sync_api import sync_playwright
from pymongo import MongoClient
import gridfs
import json
import os
import traceback # Ensure traceback is imported
import datetime
# Consider adding background task queue like Celery or RQ if processing is slow
# from some_background_task_library import enqueue_task

# --- MongoDB Connection Helper (Example) ---
def get_mongo_client():
    MONGO_URI = os.getenv("MONGO_URI")
    if not MONGO_URI:
        raise ValueError("MONGO_URI environment variable not set.")
    return MongoClient(MONGO_URI)

# --- Removed Placeholder for PDF Processing Logic ---
# def process_and_store_agreement_context(filename, pdf_bytes):
#     """
#     Placeholder function to extract text, summarize/structure, and store context.
#     This should ideally run asynchronously (e.g., in a background task).
#     """
#     print(f"Initiating context processing for: {filename}")
#     client = None
#     try:
#         client = get_mongo_client()
#         db = client["CollegeTransferAICluster"]
#         context_collection = db["agreement_context"] # Or agreement_summaries
#
#         # Check if context already exists
#         if context_collection.find_one({"_id": filename}):
#             print(f"Context already exists for {filename}. Skipping processing.")
#             return
#
#         # ... (rest of the removed function) ...
#
#     except Exception as e:
#         print(f"Error processing context for {filename}: {e}")
#         traceback.print_exc()
#     finally:
#         if client:
#             client.close()
# --- End Removed Placeholder ---


class CollegeTransferAPI:
    def __init__(self):
        self.base_url = "https://assist.org/api/"
        # --- Simple In-Memory Cache ---
        self._institution_name_cache = {}
        self._year_id_cache = {}
        self._majors_cache = {} # Cache key could be f"{send_id}-{recv_id}-{year_id}-{cat}"
        # Consider using a more robust caching library like cachetools for TTL etc.
        # --- End Cache ---

    def get_academic_year(self, id):
        url = self.base_url + "AcademicYears"
        response = requests.get(url)

        result_academic_years = {}

        academic_years_dict = {}

        if response.status_code == 200:
            academic_years = response.json()
            result_academic_years = academic_years
        else:
            raise Exception("Failed to fetch academic years")

        for year in result_academic_years:
            academic_year = (str(year['FallYear'] - 1) + "-" + str(year['FallYear']))
            if academic_year == "2025-2026": continue
            academic_years_dict[year['Id'] - 1] = academic_year

        return academic_years_dict[id] if id in academic_years_dict else None


    def get_academic_years(self, sending_institution_id, receiving_institution_id):
        url = f"{self.base_url}/institutions/{sending_institution_id}/agreements"

        response = requests.get(url)

        institutions_dict = {}

        academic_years_dict = {}

        if response.status_code == 200:
            json_response = response.json()
            institutions_dict = json_response
        else:
            raise Exception("Failed to fetch academic years")


        for institution in institutions_dict:
            if institution["institutionParentId"] == receiving_institution_id:
                for year_id in institution["receivingYearIds"]:
                    academic_years_dict[self.get_academic_year(year_id)] = year_id

        return academic_years_dict

    def get_institution_name(self, id):
        # Check cache first
        if id in self._institution_name_cache:
            # print(f"Cache HIT for institution name: {id}")
            return self._institution_name_cache[id]

        # print(f"Cache MISS for institution name: {id}. Fetching from API...")
        url = "https://assist.org/api/institutions"

        result = requests.get(url)
        result_json = {}
        try:
            json_data = result.json()
            result_json = json_data
        except ValueError:
            print("Request failed")

        institutions_dict = {str(item["id"]): item for item in result_json if "id" in item}

        name_to_return = None
        for k,v in institutions_dict.items():
            if k == str(id):
                # Store in cache before returning
                # name_to_return = v['names'][0]['name'].replace(" ", "_") # Removed replace
                name_to_return = v['names'][0]['name'] # Keep original name
                self._institution_name_cache[id] = name_to_return
                break # Found it, no need to continue loop

        return name_to_return # Return the found name or None

    def get_year_from_id(self, id):
        # Check cache first
        if id in self._year_id_cache:
            # print(f"Cache HIT for year ID: {id}")
            return self._year_id_cache[id]

        # print(f"Cache MISS for year ID: {id}. Fetching from API...")
        url = "https://assist.org/api/AcademicYears"

        result = requests.get(url)
        result_json = {}
        try:
            json_data = result.json()
            result_json = json_data
        except ValueError:
            print("Request failed")

        year_str_to_return = None
        for k in result_json:
            for idx, value in k.items():
                if idx == "Id" and value == id:
                    # year_str_to_return = str(k["FallYear"]) + "-" + str(k["FallYear"] + 1) # Removed +1
                    year_str_to_return = str(k["FallYear"] - 1) + "-" + str(k["FallYear"]) # Correct year range
                    # Store in cache before returning
                    self._year_id_cache[id] = year_str_to_return
                    break # Found it
            if year_str_to_return: break # Exit outer loop too

        return year_str_to_return

    def get_majors_or_departments(self, sending_institution_id, receiving_institution_id, academic_year_id, category_code):
        cache_key = f"{sending_institution_id}-{receiving_institution_id}-{academic_year_id}-{category_code}"
        if cache_key in self._majors_cache:
            # print(f"Cache HIT for majors/depts: {cache_key}")
            return self._majors_cache[cache_key]

        # print(f"Cache MISS for majors/depts: {cache_key}. Fetching from API...")
        url = f"https://assist.org/api/agreements?receivingInstitutionId={receiving_institution_id}&sendingInstitutionId={sending_institution_id}&academicYearId={academic_year_id}&categoryCode={category_code}"

        result = requests.get(url)

        result_json = {}

        majors_dict = {}

        # Convert the response to JSON and write it to a file
        try:
            json_data = result.json()
            result_json = json_data
        except ValueError:
            print("Request failed")

        for n,v in result_json.items():
            for major in v:
                  majors_dict[major["label"]] = major["key"]

        # Store in cache
        self._majors_cache[cache_key] = majors_dict
        return majors_dict

    def get_major_from_key(self, key):
        # Define the parameters
        # sending_institution_id = 61
        # receiving_institution_id = 79
        # academic_year_id = 75
        # category_code = "major"

        # Define the API endpoint and parameters

        keyArray = key.split("/")

        sending_institution_id = int(keyArray[1])
        receiving_institution_id = int(keyArray[3])
        academic_year_id = int(keyArray[0])
        category_code = "major"

        if "Department" in key:
            category_code = "dept"

        url = f"https://assist.org/api/agreements?receivingInstitutionId={receiving_institution_id}&sendingInstitutionId={sending_institution_id}&academicYearId={academic_year_id}&categoryCode={category_code}"

        result = requests.get(url)

        result_json = {}

        print("KEY AND URL: ",key, url)

        # Convert the response to JSON and write it to a file
        try:
            json_data = result.json()
            result_json = json_data
        except ValueError:
            print("Request failed")

        for _, c in result_json.items():
            for i in c:
                for l, j in i.items():
                    if l == "key" and j == key:
                        # return i["label"].replace(" ", "_") # Removed replace
                        return i["label"] # Keep original name
        
        return "Key Not Found", key

    def get_sending_institutions(self):

        url = "https://assist.org/api/institutions"

        result = requests.get(url)

        result_json = {}

        result_dict_colleges = {}

        try:
            json_data = result.json()
            result_json = json_data
        except ValueError:
            print("Something went wrong when getting colleges")

        for institution in result_json:
            for name in institution["names"]:
                result_dict_colleges[name["name"]] = institution["id"]

        return result_dict_colleges

    def get_receiving_institutions(self, receiving_institution_id):
        url = f"https://assist.org/api/institutions/{receiving_institution_id}/agreements"

        result = requests.get(url)

        result_json = {}

        result_dict_non_ccs = {}

        try:
            json_data = result.json()
            result_json = json_data
        except ValueError:
            print("Something went wrong when getting colleges")

        for institution in result_json:
            result_dict_non_ccs[institution["institutionName"]] = institution["institutionParentId"]

        return result_dict_non_ccs


    def get_articulation_agreement(self, academic_year_id, sending_institution_id, receiving_institution_id, key):
        print(f"Fetching articulation agreement for key: {key}")
        client = None # Initialize client to None
        try: # Wrap more of the logic for better error handling

            print(f"Academic Year ID: {academic_year_id}, Sending Institution ID: {sending_institution_id}, Receiving Institution ID: {receiving_institution_id}")

            college_name = self.get_institution_name(sending_institution_id)
            receiving_name = self.get_institution_name(receiving_institution_id)
            major_name = self.get_major_from_key(key)
            year_name = self.get_year_from_id(academic_year_id)

            if not all([college_name, receiving_name, major_name, year_name]):
                 print(f"Warning: Could not resolve all names for key {key}. Using fallback names.")
                 # Provide fallback names or handle the error more gracefully
                 college_name = college_name or f"sending_{sending_institution_id}"
                 receiving_name = receiving_name or f"receiving_{receiving_institution_id}"
                 major_name = major_name or f"major_{key.split('/')[-1]}" # Use last part of key
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
            # Basic sanitization (already done above, but keep for safety)
            filename = filename.replace('/', '_').replace('\\', '_')
            print(f"Generated filename: {filename}")

            # --- Check if already exists in GridFS ---
            client = get_mongo_client() # Get client connection
            db = client["CollegeTransferAICluster"] # Use correct DB name if needed
            fs = gridfs.GridFS(db)
            if fs.find_one({"filename": filename}):
                print(f"PDF '{filename}' already exists in GridFS. Skipping download.")
                # --- Removed context processing call ---
                client.close()
                return filename # Return existing filename if found

            # --- Construct URL (same as before) ---
            viewBy = "major"


            url = (
                f"https://assist.org/transfer/results?year={academic_year_id}"
                f"&institution={sending_institution_id}"
                f"&agreement={receiving_institution_id}"
                f"&agreementType=to&viewAgreementsOptions=true&view=agreement"
                f"&viewBy={viewBy}&viewSendingAgreements=false&viewByKey={key}"
            )

            if "Department" in key:
                viewBy = "dept"
                if "SendingDepartment" in key:
                    url = (
                        f"https://assist.org/transfer/results?year={academic_year_id}"
                        f"&institution={sending_institution_id}"
                        f"&agreement={receiving_institution_id}"
                        f"&agreementType=to&viewAgreementsOptions=true&view=agreement"
                        f"&viewBy={viewBy}&viewByKey={key}&viewSendingAgreements=true"
                    )
                else:
                    url = (
                        f"https://assist.org/transfer/results?year={academic_year_id}"
                        f"&institution={sending_institution_id}"
                        f"&agreement={receiving_institution_id}"
                        f"&agreementType=to&viewAgreementsOptions=true&view=agreement"
                        f"&viewBy={viewBy}&viewByKey={key}"
                    )

            print(f"Attempting to fetch PDF from URL: {url}")

            pdf_bytes = None
            with sync_playwright() as p:
                browser = None
                try:
                    browser = p.chromium.launch(headless=True)
                    page = browser.new_page()
                    page.goto(url, wait_until="networkidle", timeout=60000)
                    page.wait_for_timeout(2000)
                    pdf_bytes = page.pdf(format="A4")
                    print(f"Successfully downloaded PDF bytes (size: {len(pdf_bytes)} bytes)")
                except Exception as playwright_err:
                     print(f"Playwright error fetching PDF from {url}: {playwright_err}")
                     if browser: browser.close()
                     client.close()
                     return None
                finally:
                    if browser: browser.close()

            if pdf_bytes:
                try:
                    fs.put(pdf_bytes, filename=filename, contentType='application/pdf')
                    print(f"Successfully saved PDF '{filename}' to GridFS.")
                    # --- Removed context processing call ---
                except Exception as gridfs_err:
                    print(f"Error saving PDF '{filename}' to GridFS: {gridfs_err}")
                    # Don't process context if save failed
            else:
                 print("Failed to obtain PDF bytes, cannot save.")
                 client.close()
                 return None

            client.close()
            return filename

        except Exception as e:
            print(f"General error in get_articulation_agreement for key {key}: {e}")
            import traceback
            traceback.print_exc()
            if 'client' in locals() and client:
                 client.close()
            return None
        finally:
            if client: # Close client if it was opened
                client.close()

    def get_igetc_courses(self, academic_year_id, sending_institution_id):
        print("Fetching IGETC agreement for")
        client = None # Initialize client to None
        try:

            college_name = self.get_institution_name(sending_institution_id)
            year_name = self.get_year_from_id(academic_year_id)

            if not all([college_name, year_name]):
                 college_name = college_name or f"sending_{sending_institution_id}"
                 year_name = year_name or f"year_{academic_year_id}"

            # Sanitize names for filename
            college_name_safe = college_name.replace(" ", "_").replace("/", "_")
            year_name_safe = year_name.replace(" ", "_").replace("/", "_")


            filename = (
                f"{college_name_safe}_IGETC_" # Added IGETC identifier
                f"{year_name_safe}.pdf"
            )
            filename = filename.replace('/', '_').replace('\\', '_')
            print(f"Generated filename: {filename}")

            client = get_mongo_client() # Get client connection
            db = client["CollegeTransferAICluster"] # Use correct DB name if needed
            fs = gridfs.GridFS(db)
            if fs.find_one({"filename": filename}):
                print(f"PDF '{filename}' already exists in GridFS. Skipping download.")
                # --- Removed context processing call ---
                client.close()
                return filename

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
                    page.wait_for_timeout(2000)
                    pdf_bytes = page.pdf(format="A4")
                    print(f"Successfully downloaded PDF bytes (size: {len(pdf_bytes)} bytes)")
                except Exception as playwright_err:
                     print(f"Playwright error fetching PDF from {url}: {playwright_err}")
                     if browser: browser.close()
                     client.close()
                     return None
                finally:
                    if browser: browser.close()

            if pdf_bytes:
                try:
                    fs.put(pdf_bytes, filename=filename, contentType='application/pdf')
                    print(f"Successfully saved PDF '{filename}' to GridFS.")
                    # --- Removed context processing call ---
                except Exception as gridfs_err:
                    print(f"Error saving PDF '{filename}' to GridFS: {gridfs_err}")
            else:
                 print("Failed to obtain PDF bytes, cannot save.")
                 client.close()
                 return None

            client.close()
            return filename

        except Exception as e:
            print(f"General error in get_igetc_courses: {e}")
            import traceback
            traceback.print_exc()
            if 'client' in locals() and client:
                 client.close()
            return None
        finally: # Ensure client is closed even on error
             if client:
                 client.close()

api = CollegeTransferAPI()
