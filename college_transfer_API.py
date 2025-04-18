import requests
import json  

class CollegeTransferAPI:
    def __init__(self):
        self.base_url = "https://assist.org/api/"
        self.institutions = {}
        self.academic_years = {}
        self.agreements = {}


    def get_academic_years(self):
        url = self.base_url + "AcademicYears"
        response = requests.get(url)
        if response.status_code == 200:
            self.academic_years = response.json()
            return json.dumps(self.academic_years, indent=4)
        else:
            raise Exception("Failed to fetch academic years")

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
                return v['names'][0]['name']      


    def get_all_majors(self, sending_institution_id, receiving_institution_id, academic_year_id, category_code):
        # Define the parameters
        # sending_institution_id = 61
        # receiving_institution_id = 79
        # academic_year_id = 75
        # category_code = "major"

        # Define the API endpoint and parameters

        url = f"https://assist.org/api/agreements?receivingInstitutionId={receiving_institution_id}&sendingInstitutionId={sending_institution_id}&academicYearId={academic_year_id}&categoryCode={category_code}"

        result = requests.get(url)


        result_json = {}

        # Convert the response to JSON and write it to a file
        try:
            json_data = result.json()
            result_json = json_data
        except ValueError:
            print("Request failed")
        
        return json.dumps(result_json, indent=4)

    def get_major_key(self, sending_institution_id, receiving_institution_id, academic_year_id, category_code, major):
        # Define the parameters
        # sending_institution_id = 61
        # receiving_institution_id = 79
        # academic_year_id = 75
        # category_code = "major"

        # Define the API endpoint and parameters

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
                    if l == "label" and j == major:
                        return i["key"]
        
        return "Major Not Found", major


    def get_colleges(self):

        url = "https://assist.org/api/institutions"

        result = requests.get(url)

        result_json = {}

        try:
            json_data = result.json()
            result_json = json_data
            with open("Institutions.json", "w") as file:
                json.dump(json_data, file, indent=4)
            print("JSON response has been written to Institutions.json")
        except ValueError:
            print("Response is not in JSON format")
            
        return result_json

    def get_articulation_agreement(self, key):
        if key[0] == "Major Not Found":
            print("Major Not Found: ", key[1])
            return

        receiving_institution_id = key[0].split("/")[3]
        
        sending_institution_id = key[0].split("/")[1]

        result = requests.get(url)

        result_json = {}

        receiving_college = self.get_college_from_id(receiving_institution_id)

        sending_college = self.get_college_from_id(sending_institution_id)
        
        url = "https://assist.org/api/articulation/Agreements?Key=" + key[0]
        
        
        try:
            json_data = result.json()
            result_json = json_data
        except ValueError:
            print("Response is not in JSON format")
        
        articulations = json.loads(result_json["result"]["articulations"])
        
        result_dict_articulation = {}
        
        for item in articulations:
            item_course = item["articulation"]["course"]
            item_course_title = item_course["prefix"] + " " + item_course["courseNumber"] + " " + item_course["courseTitle"]
            if len(item["articulation"]["sendingArticulation"]["items"]) > 0:
                for articulation_item in item["articulation"]["sendingArticulation"]["items"]:
                    if len(articulation_item["items"]) > 0:
                        for sub_item in articulation_item["items"]:
                            if item_course_title in result_dict_articulation:
                                result_dict_articulation[item_course_title].append(sub_item["courseTitle"])
                            else:
                                result_dict_articulation[item_course_title] = [sub_item["courseTitle"]]
            
        
        for item in articulations:
            item_course = item["articulation"]["course"]
            item_course_title = item_course["prefix"] + " " + item_course["courseNumber"] + " " + item_course["courseTitle"]
            if item["articulation"]["sendingArticulation"]["noArticulationReason"]:
                if len(item["articulation"]["sendingArticulation"]["items"]) == 0:
                    if item_course_title not in result_dict_articulation:
                        result_dict_articulation[item_course_title] = [item["articulation"]["sendingArticulation"]["noArticulationReason"]]

        templateAssets = json.loads(result_json["result"]["templateAssets"])
        
        for item in templateAssets:
            if "sections" in item:
                for row in item['sections'][0]["rows"]:
                    item_course = row["cells"][0]["course"]
                    item_course_title = item_course["prefix"] + " " + item_course["courseNumber"] + " " + item_course["courseTitle"]
                    if item_course_title not in result_dict_articulation:
                        result_dict_articulation[item_course_title] = ["No Course Articulated"]

