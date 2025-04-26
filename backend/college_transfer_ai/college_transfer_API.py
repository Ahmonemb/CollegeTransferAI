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
    
    
    def get_articulation_agreement(self, academic_year_id, sending_institution_id, receiving_institution_id, major_key):
        filename = (
            f"{self.get_college_from_id(sending_institution_id)}_to_"
            f"{self.get_college_from_id(receiving_institution_id)}_"
            f"{self.get_major_from_key(major_key)}_"
            f"{self.get_year_from_id(academic_year_id)}.pdf"
        )

        MONGO_URI = os.getenv("MONGO_URI") 

        client = MongoClient(MONGO_URI)
        db = client["CollegeTransferAICluster"]
        fs = gridfs.GridFS(db)

        # Check if file already exists
        if fs.find_one({"filename": filename}):
            client.close()
            return filename

        url = (
            f"https://assist.org/transfer/results?year={academic_year_id}"
            f"&institution={sending_institution_id}"
            f"&agreement={receiving_institution_id}"
            f"&agreementType=to&viewAgreementsOptions=true&view=agreement"
            f"&viewBy=major&viewSendingAgreements=false&viewByKey={major_key}"
        )

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()
            page.goto(url, wait_until="networkidle")
            pdf_bytes = page.pdf(format="A4")  # Get PDF as bytes
            browser.close()

        fs.put(pdf_bytes, filename=filename)
        client.close()

        return filename
        



api = CollegeTransferAPI()
