import os
from flask import Flask, jsonify, request, render_template, send_from_directory, Response
from flask_cors import CORS
from college_transfer_ai.college_transfer_API import CollegeTransferAPI
import json
import gridfs
from pymongo import MongoClient

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, 'templates'),
    static_folder=os.path.join(BASE_DIR, 'static')
)
CORS(app)
api = CollegeTransferAPI()  # Create an instance of the CollegeTransferAPI class

@app.route('/')
def home():
    return render_template('index.html')

# Endpoint to get all institutions
@app.route('/institutions', methods=['GET'])
def get_institutions():
    try:
        institutions = api.get_colleges()  # Fetch institutions from your API logic
        return jsonify(institutions)  # Return the institutions as JSON
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint to get all non community colleges
@app.route('/nonccs', methods=['GET'])
def get_non_ccs():
    try:
        non_ccs = api.get_non_ccs()  # Fetch institutions from your API logic
        return jsonify(non_ccs)  # Return the institutions as JSON
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint to get academic years
@app.route('/academic-years', methods=['GET'])
def get_academic_years():
    try:
        academic_years = api.get_academic_years()
        return jsonify(academic_years)  # Convert JSON string to Python dict
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint to get all majors
@app.route('/majors', methods=['GET'])
def get_all_majors():
    
    sending_institution_id = request.args.get('sendingInstitutionId')
    receiving_institution_id = request.args.get('receivingInstitutionId')
    academic_year_id = request.args.get('academicYearId')
    category_code = request.args.get('categoryCode')

    try:
        majors = api.get_all_majors(sending_institution_id, receiving_institution_id, academic_year_id, category_code)
        return jsonify(majors)  # Convert JSON string to Python dict
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Endpoint to get articulation agreements
@app.route('/articulation-agreement', methods=['GET'])
def get_articulation_agreement():
    key = request.args.get("key")
    
    keyArray = request.args.get("key").split("/")
    
    sending_institution_id = int(keyArray[1])
    receiving_institution_id = int(keyArray[3])
    academic_year_id = int(keyArray[0])

    try:
        pdf_filename = api.get_articulation_agreement(academic_year_id, sending_institution_id, receiving_institution_id, key)
        return jsonify({"pdf_filename": pdf_filename})  
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

# Endpoint to get articulation agreement PDF
@app.route('/pdf/<filename>')
def serve_pdf(filename):
    client = MongoClient("mongodb+srv://ahmonembaye:WCpjfEgNcIomkBcN@collegetransferaicluste.vlsybad.mongodb.net/?retryWrites=true&w=majority&appName=CollegeTransferAICluster")
    db = client["CollegeTransferAICluster"]
    fs = gridfs.GridFS(db)
    file = fs.find_one({"filename": filename})
    if not file:
        return "PDF not found", 404
    return Response(file.read(), mimetype='application/pdf')

if __name__ == '__main__':
    app.run(debug=True)