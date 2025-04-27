import requests
from playwright.sync_api import sync_playwright
from pymongo import MongoClient
import gridfs
import json
import os

class CollegeTransferAPI:
    def __init__(self):
        self.base_url = "https://assist.org/api/"

    def get_academic_years(self):
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
            academic_years_dict[academic_year] = year['Id'] - 1   
        
        return academic_years_dict

    def get_college_from_id(self, id):
        url = "https://assist.org/api/institutions"

        result = requests.get(url)
        result_json = {}
        try:
            json_data = result.json()
            result_json = json_data
        except ValueError:
            print("Request failed")
        
        institutions_dict = {str(item["id"]): item for item in result_json if "id" in item}
        
        for k,v in institutions_dict.items():
            if k == str(id):
                return v['names'][0]['name'].replace(" ", "_")      
    
    def get_year_from_id(self, id):
        url = "https://assist.org/api/AcademicYears"

        result = requests.get(url)
        result_json = {}
        try:
            json_data = result.json()
            result_json = json_data
        except ValueError:
            print("Request failed")
        

        for k in result_json:
            for idx, value in k.items():
                if idx == "Id" and value == id:
                    return str(k["FallYear"]) + "-" + str(k["FallYear"] + 1)
                
    def get_all_majors(self, sending_institution_id, receiving_institution_id, academic_year_id, category_code):
        # Define the parameters
        # sending_institution_id = 61
        # receiving_institution_id = 79
        # academic_year_id = 75

        # Define the API endpoint and parameters

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
                        return i["label"].replace(" ", "_")
        
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
        try: # Wrap more of the logic for better error handling
            college_name = self.get_college_from_id(sending_institution_id)
            receiving_name = self.get_college_from_id(receiving_institution_id)
            major_name = self.get_major_from_key(key)
            year_name = self.get_year_from_id(academic_year_id)

            if not all([college_name, receiving_name, major_name, year_name]):
                 print(f"Warning: Could not resolve all names for key {key}. Using fallback names.")
                 # Provide fallback names or handle the error more gracefully
                 college_name = college_name or f"sending_{sending_institution_id}"
                 receiving_name = receiving_name or f"receiving_{receiving_institution_id}"
                 major_name = major_name or f"major_{key.split('/')[-1]}" # Use last part of key
                 year_name = year_name or f"year_{academic_year_id}"

            filename = (
                f"{college_name}_to_"
                f"{receiving_name}_"
                f"{major_name}_"
                f"{year_name}.pdf"
            )
            # Basic sanitization
            filename = filename.replace('/', '_').replace('\\', '_')
            print(f"Generated filename: {filename}")

            # --- Check if already exists in GridFS (Optional, keep if you still want GridFS check) ---
            MONGO_URI = os.getenv("MONGO_URI")
            if not MONGO_URI:
                raise ValueError("MONGO_URI environment variable not set.")
            client = MongoClient(MONGO_URI)
            db = client["CollegeTransferAICluster"]
            fs = gridfs.GridFS(db)
            if fs.find_one({"filename": filename}):
                print(f"PDF '{filename}' already exists in GridFS. Skipping download.")
                client.close()
                return filename # Return existing filename if found

            # --- Construct URL (same as before) ---
            viewBy = "major"
            if "Department" in key:
                viewBy = "dept" 

            url = (
                f"https://assist.org/transfer/results?year={academic_year_id}"
                f"&institution={sending_institution_id}"
                f"&agreement={receiving_institution_id}"
                f"&agreementType=to&viewAgreementsOptions=true&view=agreement"
                f"&viewBy={viewBy}&viewSendingAgreements=false&viewByKey={key}"
            )
            print(f"Attempting to fetch PDF from URL: {url}")

            # --- Download PDF using Playwright (same as before) ---
            pdf_bytes = None
            with sync_playwright() as p:
                browser = None
                try:
                    browser = p.chromium.launch(headless=True)
                    page = browser.new_page()
                    page.goto(url, wait_until="networkidle", timeout=60000) # Increased timeout
                    page.wait_for_timeout(2000) # Small delay
                    pdf_bytes = page.pdf(format="A4")
                    print(f"Successfully downloaded PDF bytes (size: {len(pdf_bytes)} bytes)")
                except Exception as playwright_err:
                     print(f"Playwright error fetching PDF from {url}: {playwright_err}")
                     if browser: browser.close() # Ensure browser closes on error
                     client.close() # Ensure mongo client closes
                     return None # Indicate failure
                finally:
                    if browser: browser.close()

            # --- Save PDF Locally ---
            if pdf_bytes:
                # local_pdf_path = f"./{filename}" # Save in the current directory where the script runs
                # try:
                #     with open(local_pdf_path, "wb") as f_local: # Open in binary write mode
                #         f_local.write(pdf_bytes)
                #     print(f"Successfully saved PDF locally to: {local_pdf_path}")
                # except Exception as local_save_err:
                #     print(f"Error saving PDF locally to {local_pdf_path}: {local_save_err}")
                #     # Decide if you still want to proceed with GridFS or return failure
                #     client.close()
                #     return None # Indicate failure if local save fails

                # --- Save to GridFS (Optional - keep or remove) ---
                try:
                    fs.put(pdf_bytes, filename=filename, contentType='application/pdf')
                    print(f"Successfully saved PDF '{filename}' to GridFS.")
                except Exception as gridfs_err:
                    print(f"Error saving PDF '{filename}' to GridFS: {gridfs_err}")
                    # Handle GridFS save error if needed

            else:
                 print("Failed to obtain PDF bytes, cannot save.")
                 client.close()
                 return None # Indicate failure

            client.close()
            return filename # Return the filename on success

        except Exception as e:
            print(f"General error in get_articulation_agreement for key {key}: {e}")
            import traceback
            traceback.print_exc()
            # Ensure client is closed if it was opened
            if 'client' in locals() and client:
                 client.close()
            return None # Indicate failure

api = CollegeTransferAPI()