import requests
import json  
from collections import defaultdict

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
                return v['names'][0]['name']      


    def get_all_majors(self, sending_institution_id, receiving_institution_id, academic_year_id, category_code="major"):
        # Define the parameters
        # sending_institution_id = 61
        # receiving_institution_id = 79
        # academic_year_id = 75
        # category_code = "major"

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

    def get_major_key(self, sending_institution_id, receiving_institution_id, academic_year_id, major, category_code="major"):
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

    def get_non_ccs(self):
        url = "https://assist.org/api/institutions"

        result = requests.get(url)

        result_json = {}

        result_dict_non_ccs = {}

        try:
            json_data = result.json()
            result_json = json_data
        except ValueError:
            print("Something went wrong when getting colleges")
            
        for institution in result_json:
            if not institution["isCommunityCollege"]:
                for name in institution["names"]:
                    result_dict_non_ccs[name["name"]] = institution["id"]
        
        return result_dict_non_ccs
    
    
    
    def get_articulation_agreement(self, key):
        
        def combine_keys_by_value_content(mapping):
            from collections import defaultdict

            # Helper: Remove key names from their own value lists
            def clean_value(key, value_list):
                return [v for v in value_list if key not in v]

            grouped = defaultdict(list)
            cleaned_values = {}

            for key, value in mapping.items():
                if value == ["No Course Articulated"]:
                    # Don't group these, keep as is
                    grouped[(key,)].append(key)
                    cleaned_values[key] = value
                else:
                    # Remove key name from value list for grouping
                    cleaned = tuple(sorted(set(clean_value(key, value))))
                    grouped[cleaned].append(key)
                    cleaned_values[key] = clean_value(key, value)

            result = {}
            for value_tuple, keys in grouped.items():
                # Only combine if "And" is in the value list
                if "And" in value_tuple and len(keys) > 1:
                    # Remove "And" from the value list
                    filtered_value = [v for v in value_tuple if v != "And"]
                    result[", ".join(sorted(keys))] = filtered_value
                elif len(keys) == 1 and cleaned_values[keys[0]] == ["No Course Articulated"]:
                    result[keys[0]] = ["No Course Articulated"]
                else:
                    # Do not combine, keep separate
                    for k in keys:
                        result[k] = list(value_tuple)
            return result
        
        
        url = "https://assist.org/api/articulation/Agreements?Key=" + key
        result = requests.get(url)
        result_json = {}
        try:
            json_data = result.json()
            result_json = json_data
        except ValueError:
            print("Response is not in JSON format")
            return {}

        articulations = json.loads(result_json["result"]["articulations"])
        templateAssets = json.loads(result_json["result"]["templateAssets"])

        # Build a lookup for articulations by receiving course (prefix, number, title)
        articulation_lookup = {}
        for item in articulations:
            if "series" in item["articulation"]:
                item_series = item["articulation"]["series"]
                for serie in item_series:
                    if serie == "courses":
                        item_courses = item_series["courses"]
                        for item_course in item_courses:
                            key_str = f"{item_course['prefix']} {item_course['courseNumber']} {item_course['courseTitle']}"
                            articulation_lookup[key_str] = item
            else:
                item_course = item["articulation"]["course"]
                key_str = f"{item_course['prefix']} {item_course['courseNumber']} {item_course['courseTitle']}"
                articulation_lookup[key_str] = item

        # Now map each receiving course to sending courses or "No Course Articulated"
        mapping = {}
        for asset in templateAssets:
            if "sections" in asset:
                for section in asset["sections"]:
                    for row in section["rows"]:
                        for cell in row["cells"]:
                            if "course" in cell:
                                course = cell["course"]
                                course_key = f"{course['prefix']} {course['courseNumber']} {course['courseTitle']}"
                                # Default to No Course Articulated
                                mapping[course_key] = ["No Course Articulated"]
                                # If articulation exists, map to sending courses
                                if course_key in articulation_lookup:
                                    articulation = articulation_lookup[course_key]
                                    sending = articulation["articulation"]["sendingArticulation"]
                                    if sending.get("items") and len(sending["items"]) > 0:
                                        mapped = []
                                        for group in sending["items"]:
                                            for send_course in group.get("items", []):
                                                mapped.append(send_course.get("courseTitle", "Unknown Course"))
                                        if mapped:
                                            mapping[course_key] = mapped
                                    elif sending.get("noArticulationReason"):
                                        mapping[course_key] = [sending["noArticulationReason"]]
                            if "series" in cell:
                                serie = cell["series"]
                                if "courses" in serie:
                                    for item_course in serie["courses"]:
                                        course_key = f"{item_course['prefix']} {item_course['courseNumber']} {item_course['courseTitle']}"
                                        # Default to No Course Articulated
                                        mapping[course_key] = ["No Course Articulated"]
                                        # If articulation exists, map to sending courses
                                        if course_key in articulation_lookup:
                                            articulation = articulation_lookup[course_key]
                                            sending = articulation["articulation"]["sendingArticulation"]
                                            if sending.get("items") and len(sending["items"]) > 0:
                                                mapped = []
                                                for group in sending["items"]:
                                                    for send_course in group.get("items", []):
                                                        mapped.append(send_course.get("courseTitle", "Unknown Course"))
                                                if mapped:
                                                    mapping[course_key] = mapped
                                                    mapping[course_key].append(serie["conjunction"])
                                            elif sending.get("noArticulationReason"):
                                                mapping[course_key] = [sending["noArticulationReason"]]
        
        
        return combine_keys_by_value_content(mapping)



api = CollegeTransferAPI()

# print(json.dumps(api.get_articulation_agreement("75/61/to/79/Major/fc50cced-05c2-43c7-7dd5-08dcb87d5deb"), indent=4))

print(json.dumps(api.get_articulation_agreement("75/61/to/89/Major/eba1f42b-c560-46e6-1352-08dcbcdb53de"), indent=4))