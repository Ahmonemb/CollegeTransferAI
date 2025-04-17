import requests
import json  # Import the json module for pretty printing

def get_majors_available(sending_institution_id, receiving_institution_id, academic_year_id, category_code):
    # Define the parameters
    # sending_institution_id = 61
    # receiving_institution_id = 79
    # academic_year_id = 75
    # category_code = "major"

    # Define the API endpoint and parameters

    url = f"https://assist.org/api/agreements?receivingInstitutionId={receiving_institution_id}&sendingInstitutionId={sending_institution_id}&academicYearId={academic_year_id}&categoryCode={category_code}"

    result = requests.get(url)

    # Convert the response to JSON and write it to a file
    try:
        json_data = result.json()
        with open(f"MajorsAvailableFrom{sending_institution_id}To{receiving_institution_id}.json", "w") as file:
            json.dump(json_data, file, indent=4)  # Write prettified JSON to the file
        print("JSON response has been written to", f"MajorsAvailableFrom{sending_institution_id}To{receiving_institution_id}.json")
    except ValueError:
        print("Response is not in JSON format")


def get_colleges():
    url = "https://assist.org/api/institutions"

    result = requests.get(url)

    try:
        json_data = result.json()
        with open("Institutions.json", "w") as file:
            json.dump(json_data, file, indent=4)
        print("JSON response has been written to Institutions.json")
    except ValueError:
        print("Response is not in JSON format")

get_colleges()