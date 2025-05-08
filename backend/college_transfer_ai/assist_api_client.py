import requests
import time
import os

class AssistApiClient:
    BASE_URL = "https://assist.org/api"

    def __init__(self, api_key=None):
        self.api_key = api_key or os.getenv("ASSIST_API_KEY")
        if not self.api_key:
            raise ValueError("ASSIST_API_KEY not found in environment variables.")
        self.headers = {"Authorization": f"Bearer {self.api_key}"}
        self.institution_cache = {}
        self.agreement_cache = {}

    def _make_request(self, endpoint, params=None, use_cache=True, cache_key=None, cache_type=None):
        if use_cache and cache_key:
            if cache_type == 'institution' and cache_key in self.institution_cache:
                print(f"Cache hit for institution: {cache_key}")
                return self.institution_cache[cache_key]
            elif cache_type == 'agreement' and cache_key in self.agreement_cache:
                print(f"Cache hit for agreement: {cache_key}")
                return self.agreement_cache[cache_key]

        url = f"{self.BASE_URL}/{endpoint}"
        max_retries = 3
        for attempt in range(max_retries):
            try:
                response = requests.get(url, headers=self.headers, params=params)
                response.raise_for_status()
                data = response.json()
                if use_cache and cache_key:
                    if cache_type == 'institution':
                        self.institution_cache[cache_key] = data
                    elif cache_type == 'agreement':
                        self.agreement_cache[cache_key] = data
                return data
            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 429:
                    print(f"Rate limit exceeded. Retrying in {2 ** attempt} seconds...")
                    time.sleep(2 ** attempt)
                else:
                    print(f"HTTP error: {e} for URL: {url} with params: {params}")
                    return None
            except requests.exceptions.RequestException as e:
                print(f"Request failed: {e} for URL: {url} with params: {params}")
                return None
        return None

    def get_institutions(self):
        return self._make_request("institutions")

    def get_institution_name(self, institution_id):
        cache_key = str(institution_id)
        if cache_key in self.institution_cache and 'name' in self.institution_cache[cache_key]:
            print(f"Cache hit for institution name: {institution_id}")
            return self.institution_cache[cache_key]['name']

        data = self._make_request(f"institutions/{institution_id}", use_cache=True, cache_key=cache_key, cache_type='institution')
        return data.get('name') if data else None

    def get_academic_years(self, institution_id):
        return self._make_request(f"institutions/{institution_id}/academic-years")

    def get_agreements(self, receiving_institution_id, sending_institution_id, academic_year_id, category_code=None):
        cache_key = f"{receiving_institution_id}_{sending_institution_id}_{academic_year_id}_{category_code or 'all'}"
        params = {
            "receivingInstitutionId": receiving_institution_id,
            "sendingInstitutionId": sending_institution_id,
            "academicYearId": academic_year_id,
            "categoryCode": category_code
        }
        return self._make_request("agreements", params=params, use_cache=True, cache_key=cache_key, cache_type='agreement')

    def get_agreement_details(self, agreement_key):
        return self._make_request(f"agreements/{agreement_key}/content")

assist_client = AssistApiClient()
