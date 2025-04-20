import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from college_transfer_ai.app import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_home_route(client):
    response = client.get('/')
    assert response.status_code == 200
    assert b'College Transfer AI' in response.data  

def test_get_institutions(client):
    response = client.get('/institutions')
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, (dict))  

def test_get_nonccs(client):
    response = client.get('/receiving-institutions')
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, (dict))

def test_get_all_majors(client):
    response = client.get('/majors?sendingInstitutionId=61&receivingInstitutionId=79&academicYearId=75&categoryCode=major')
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, (dict)) 

def test_get_academic_years(client):
    response = client.get('/academic-years')
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data, (dict))
