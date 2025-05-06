import requests
import json
import os
import traceback

class AssistApiClient:
    """
    Client for interacting with the Assist.org JSON API endpoints.
    Handles fetching data and in-memory caching.
    """
    def __init__(self):
        self.base_url = "https://assist.org/api/"
        # --- Simple In-Memory Cache ---
        self._institution_name_cache = {} # Key: inst_id (str), Value: name
        self._year_id_cache = {}        # Key: year_id (str), Value: year_string
        self._receiving_cache = {}      # Key: sending_id (str), Value: {name: id, ...}
        self._academic_years_cache = {} # Key: f"{send_id}-{recv_id}", Value: {year_string: id, ...}
        self._majors_cache = {}         # Key: f"{send_id}-{recv_id}-{year_id}-{cat}", Value: {label: key, ...}
        # Consider using a more robust caching library like cachetools for TTL etc.
        # --- End Cache ---

    def _make_request(self, endpoint, params=None):
        """Helper function to make requests to the Assist API."""
        url = self.base_url + endpoint
        try:
            response = requests.get(url, params=params, timeout=15) # Add timeout
            response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching {url} with params {params}: {e}")
            return None # Return None on request errors
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON from {url}: {e}")
            return None # Return None on JSON errors

    def get_academic_years(self, sending_institution_id, receiving_institution_id):
        """Fetches academic years for which agreements exist between the two institutions."""
        sending_id_str = str(sending_institution_id)
        receiving_id_str = str(receiving_institution_id)
        cache_key = f"{sending_id_str}-{receiving_id_str}"

        if cache_key in self._academic_years_cache:
            print(f"API Cache hit for academic years: {cache_key}")
            return self._academic_years_cache[cache_key]

        print(f"API Cache miss for academic years: {cache_key}. Fetching...")
        endpoint = f"institutions/{sending_id_str}/agreements"
        agreement_list = self._make_request(endpoint)

        if not agreement_list or not isinstance(agreement_list, list):
            print(f"No valid agreement list found for sending institution {sending_id_str} at endpoint {endpoint}")
            self._academic_years_cache[cache_key] = {}
            return {}

        academic_years = {}
        found_receiving_inst = False
        for agreement_info in agreement_list:
            inst_parent_id = agreement_info.get("institutionParentId")
            if str(inst_parent_id) == receiving_id_str:
                found_receiving_inst = True
                year_ids = agreement_info.get("receivingYearIds", [])
                if not year_ids:
                    print(f"Receiving institution {receiving_id_str} found, but no receivingYearIds listed.")
                    break

                for year_id in year_ids:
                    year_string = self.get_year_from_id(year_id)
                    if year_id and year_string and year_string not in academic_years:
                        academic_years[year_string] = year_id
                break

        if not found_receiving_inst:
            print(f"Receiving institution {receiving_id_str} not found in agreement list for sending institution {sending_id_str}.")

        print(f"Found {len(academic_years)} academic years for {cache_key}")
        self._academic_years_cache[cache_key] = academic_years
        return academic_years

    def get_institution_name(self, id):
        cache_key = str(id)
        if cache_key in self._institution_name_cache:
            return self._institution_name_cache[cache_key]

        print(f"Cache MISS for institution name: {id}. Fetching from API...")
        data = self._make_request("institutions")
        if not data:
            return None

        name_to_return = None
        for item in data:
            if str(item.get("id")) == cache_key:
                if item.get("names"):
                    name_to_return = item["names"][0].get("name")
                    if name_to_return:
                        self._institution_name_cache[cache_key] = name_to_return
                        break

        if not name_to_return:
             print(f"Institution name not found for ID: {id}")
        return name_to_return

    def get_year_from_id(self, id):
        cache_key = str(id)
        if cache_key in self._year_id_cache:
            return self._year_id_cache[cache_key]

        print(f"Cache MISS for year ID: {id}. Fetching from API...")
        data = self._make_request("AcademicYears")
        if not data:
            return None

        year_str_to_return = None
        for year_data in data:
            if str(year_data.get("Id")) == cache_key:
                fall_year = year_data.get("FallYear")
                if fall_year:
                    year_str_to_return = str(fall_year) + "-" + str(fall_year + 1)
                    self._year_id_cache[cache_key] = year_str_to_return
                    break

        if not year_str_to_return:
            print(f"Year string not found for ID: {id}")
        return year_str_to_return

    def get_receiving_institutions(self, sending_institution_id):
        """Fetches receiving institutions that have agreements with the sending institution."""
        cache_key = str(sending_institution_id)
        if cache_key in self._receiving_cache:
            print(f"API Cache hit for receiving institutions: {sending_institution_id}")
            return self._receiving_cache[cache_key]

        print(f"API Cache miss for receiving institutions: {sending_institution_id}. Fetching...")
        endpoint = f"institutions/{sending_institution_id}/agreements"
        agreement_list = self._make_request(endpoint)

        if not agreement_list or not isinstance(agreement_list, list):
             print(f"No valid agreement list found for sending institution {sending_institution_id} at endpoint {endpoint}")
             self._receiving_cache[cache_key] = {}
             return {}

        receiving_institutions = {}
        for agreement_info in agreement_list:
            receiving_id = agreement_info.get("institutionParentId")
            receiving_name = agreement_info.get("institutionName")
            if not receiving_id or not receiving_name:
                print(f"Skipping entry with missing ID or Name: {agreement_info}")
                continue
            if receiving_id not in receiving_institutions.values():
                 receiving_institutions[receiving_name] = receiving_id

        print(f"Found {len(receiving_institutions)} unique receiving institutions for {sending_institution_id}")
        self._receiving_cache[cache_key] = receiving_institutions
        return receiving_institutions

    def get_majors_or_departments(self, sending_institution_id, receiving_institution_id, academic_year_id, category_code):
        cache_key = f"{sending_institution_id}-{receiving_institution_id}-{academic_year_id}-{category_code}"
        if cache_key in self._majors_cache:
            return self._majors_cache[cache_key]

        print(f"Cache MISS for majors/depts: {cache_key}. Fetching from API...")
        params = {
            "receivingInstitutionId": receiving_institution_id,
            "sendingInstitutionId": sending_institution_id,
            "academicYearId": academic_year_id,
            "categoryCode": category_code
        }
        data = self._make_request("agreements", params=params)

        if not data or not data.get("reports"):
             print(f"No majors/depts found for {cache_key}")
             self._majors_cache[cache_key] = {}
             return {}

        majors_dict = {}
        for report in data["reports"]:
             label = report.get("label")
             key = report.get("key")
             if label and key:
                 majors_dict[label] = key

        self._majors_cache[cache_key] = majors_dict
        return majors_dict

    def get_major_from_key(self, key):
        """Resolves a major/dept label from its key by fetching the relevant agreement list."""
        try:
            keyArray = key.split("/")
            if len(keyArray) < 4: # Basic validation
                print(f"Invalid key format: {key}")
                return "Invalid Key Format"

            sending_institution_id = int(keyArray[1])
            receiving_institution_id = int(keyArray[3])
            academic_year_id = int(keyArray[0])
            category_code = "dept" if "Department" in key else "major"

            # Fetch the list using the existing method
            majors_dict = self.get_majors_or_departments(
                sending_institution_id,
                receiving_institution_id,
                academic_year_id,
                category_code
            )

            # Find the label corresponding to the key
            for label, k in majors_dict.items():
                if k == key:
                    return label

            print(f"Major label not found for key: {key}")
            return "Label Not Found" # Consistent return value

        except Exception as e:
            print(f"Error resolving major from key {key}: {e}")
            traceback.print_exc()
            return "Resolution Error" # Consistent return value

    def get_sending_institutions(self):
        """Fetches all sending institutions."""
        # Note: This doesn't use the cache as it's typically fetched once
        print("Fetching sending institutions list...")
        data = self._make_request("institutions")
        if not data:
            return {}

        result_dict_colleges = {}
        for institution in data:
            inst_id = institution.get("id")
            if inst_id and institution.get("names") and isinstance(institution["names"], list) and institution["names"]:
                 first_name_obj = institution["names"][0]
                 if first_name_obj and first_name_obj.get("name"):
                     result_dict_colleges[first_name_obj["name"]] = inst_id

        return result_dict_colleges

# Create a single instance for the application to use
assist_client = AssistApiClient()
