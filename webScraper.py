import requests
import json  # Import the json module for pretty printing

url = "https://assist.org/api/agreements?receivingInstitutionId=79&sendingInstitutionId=61&academicYearId=75&categoryCode=major"

result = requests.get(url)

# Convert the response to JSON and pretty print it
try:
    json_data = result.json()
    print(json.dumps(json_data, indent=4))  # Pretty print the JSON with indentation
except ValueError:
    print("Response is not in JSON format")