import React from "react";
import '../App.css'; // Ensure the CSS file is imported
import {hideDropdown,filterAcademicYears,filterInstitutions,filterNonCCs,filterMajors} from '../js/main'; // Import the utility functions
const CollegeTransferAI = () => {
  return (
    <div>
      <h1>College Transfer AI</h1>

      {/* Form to Get All Institutions for Sending Institution */}
      <div className="form-group">
        <label htmlFor="searchInstitution">Search for Sending Institution:</label>
        <input
          type="text"
          id="searchInstitution"
          placeholder="Type to search..."
          onKeyUp={() => filterInstitutions()}
          onFocus={() => filterInstitutions()}
          onBlur={() => hideDropdown()}
        />
        <div id="institutionDropdown" className="dropdown"></div>
      </div>

      {/* Form to Get All Institutions for Receiving Institution */}
      <div className="form-group">
        <label htmlFor="receivingInstitution">Search for Receiving Institution:</label>
        <input
          type="text"
          id="receivingInstitution"
          placeholder="Type to search..."
          onKeyUp={() => filterNonCCs()}
          onFocus={() => filterNonCCs()}
          onBlur={() => hideDropdown()}
          disabled
        />
        <div id="receivingInstitutionDropdown" className="dropdown"></div>
      </div>
      <div className="form-group">
        <label htmlFor="academicYears">Search for Academic Years:</label>
        <input
          type="text"
          id="academicYears"
          placeholder="Type to search..."
          onKeyUp={() => filterAcademicYears()}
          onFocus={() => filterAcademicYears()}
          onBlur={() => hideDropdown()}
        />
        <div id="academicYearsDropdown" className="dropdown"></div>
      </div>

      {/* Form to Get Majors */}
      <div className="form-group">
        <label htmlFor="majors">Search for Majors:</label>
        <input
          type="text"
          id="majors"
          placeholder="Type to search..."
          onKeyUp={() => filterMajors()}
          onFocus={() => filterMajors()}
          onBlur={() => hideDropdown()}
          disabled
        />
        <div id="majorsDropdown" className="dropdown"></div>
      </div>
      <div className="result" id="result">
        <h3>Result:</h3>
        <pre id="resultContent">No data yet...</pre>
      </div>
    </div>
  );
};


export default CollegeTransferAI;