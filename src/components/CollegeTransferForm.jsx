import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchData } from '../services/api';
import '../App.css';

const CollegeTransferForm = () => {
    const navigate = useNavigate();

    // --- State for fetched data ---
    const [institutions, setInstitutions] = useState({});
    const [receivingInstitutions, setReceivingInstitutions] = useState({});
    const [academicYears, setAcademicYears] = useState({});
    // REMOVED: const [majors, setMajors] = useState({});

    // --- State for input values and selections ---
    const [sendingInputValue, setSendingInputValue] = useState('');
    const [receivingInputValue, setReceivingInputValue] = useState('');
    const [yearInputValue, setYearInputValue] = useState('');
    // REMOVED: const [majorInputValue, setMajorInputValue] = useState('');

    const [selectedSendingId, setSelectedSendingId] = useState(null);
    const [selectedReceivingId, setSelectedReceivingId] = useState(null);
    const [selectedYearId, setSelectedYearId] = useState(null);
    // REMOVED: const [selectedMajorKey, setSelectedMajorKey] = useState(null);

    // --- State for dropdown visibility and filtered options ---
    const [showSendingDropdown, setShowSendingDropdown] = useState(false);
    const [showReceivingDropdown, setShowReceivingDropdown] = useState(false);
    const [showYearDropdown, setShowYearDropdown] = useState(false);
    // REMOVED: const [showMajorDropdown, setShowMajorDropdown] = useState(false);

    const [filteredInstitutions, setFilteredInstitutions] = useState([]);
    const [filteredReceiving, setFilteredReceiving] = useState([]);
    const [filteredYears, setFilteredYears] = useState([]);
    // REMOVED: const [filteredMajors, setFilteredMajors] = useState([]);

    // --- State for loading and results ---
    const [isLoading] = useState(false); // Keep for initial loads if needed
    const [resultMessage, setResultMessage] = useState('Select institutions and year to view available majors.'); // Updated message
    const [error, setError] = useState(null);

    // --- Helper Functions ---
    useCallback(() => {
        setSendingInputValue('');
        setReceivingInputValue('');
        setYearInputValue('');
        // REMOVED: setMajorInputValue('');
        setSelectedSendingId(null);
        setSelectedReceivingId(null);
        setSelectedYearId(null);
        // REMOVED: setSelectedMajorKey(null);
        setReceivingInstitutions({});
        // REMOVED: setMajors({});
        setFilteredInstitutions([]);
        setFilteredReceiving([]);
        setFilteredYears([]);
        // REMOVED: setFilteredMajors([]);
        setShowSendingDropdown(false);
        setShowReceivingDropdown(false);
        setShowYearDropdown(false);
        // REMOVED: setShowMajorDropdown(false);
        setResultMessage('Select institutions and year to view available majors.'); // Updated message
        setError(null);
    }, []);

    // --- Effects for Initial Data Loading ---
    useEffect(() => {
        fetchData('institutions')
            .then(data => setInstitutions(data))
            .catch(err => setError(`Failed to load institutions: ${err.message}`));
        fetchData('academic-years')
            .then(data => setAcademicYears(data))
            .catch(err => setError(`Failed to load academic years: ${err.message}`));
    }, []);

    // --- Effects for Dependent Data Loading ---
    useEffect(() => {
        setReceivingInputValue('');
        setSelectedReceivingId(null);
        setReceivingInstitutions({});
        setFilteredReceiving([]);
        // Clear major related states if they were previously set (good practice after refactor)
        // REMOVED: setMajorInputValue('');
        // REMOVED: setSelectedMajorKey(null);
        // REMOVED: setMajors({});
        // REMOVED: setFilteredMajors([]);

        if (selectedSendingId) {
            fetchData(`receiving-institutions?sendingInstitutionId=${selectedSendingId}`)
                .then(data => setReceivingInstitutions(data))
                .catch(err => setError(`Failed to load receiving institutions: ${err.message}`));
        }
    }, [selectedSendingId]);

    // REMOVED: useEffect hook that fetched majors

    // --- Effects for Filtering Dropdowns ---
    const filter = useCallback(
            ((value, data, setFiltered, setShowDropdown) => {
            const lowerCaseValue = value.toLowerCase();
            const filtered = Object.entries(data)
                .filter(([name]) => name.toLowerCase().includes(lowerCaseValue))
                .map(([name, id]) => ({ name, id }));
            setFiltered(filtered);
            setShowDropdown(true);
        }),
        []
    );

    useEffect(() => {
        if (sendingInputValue) {
            filter(sendingInputValue, institutions, setFilteredInstitutions, setShowSendingDropdown);
        } else {
            // Keep dropdown open on focus, hide on blur or empty
             if (!document.activeElement || document.activeElement.id !== 'searchInstitution') {
                 setShowSendingDropdown(false);
             }
             setFilteredInstitutions(Object.entries(institutions).map(([name, id]) => ({ name, id }))); // Show all on empty/focus
        }
    }, [sendingInputValue, institutions, filter]);

    useEffect(() => {
        if (receivingInputValue && selectedSendingId) {
            filter(receivingInputValue, receivingInstitutions, setFilteredReceiving, setShowReceivingDropdown);
        } else {
             if (!document.activeElement || document.activeElement.id !== 'receivingInstitution') {
                 setShowReceivingDropdown(false);
             }
             setFilteredReceiving(Object.entries(receivingInstitutions).map(([name, id]) => ({ name, id }))); // Show all on empty/focus
        }
    }, [receivingInputValue, receivingInstitutions, selectedSendingId, filter]);

    useEffect(() => {
        if (yearInputValue) {
            filter(yearInputValue, academicYears, setFilteredYears, setShowYearDropdown);
        } else {
             if (!document.activeElement || document.activeElement.id !== 'academicYears') {
                 setShowYearDropdown(false);
             }
             setFilteredYears(Object.entries(academicYears).map(([name, id]) => ({ name, id })).reverse()); // Show all on empty/focus
        }
    }, [yearInputValue, academicYears, filter]);

    // REMOVED: useEffect hook for filtering majors

    // --- Event Handlers ---
    const handleInputChange = (e, setInputValue) => {
        setInputValue(e.target.value);
        setError(null);
    };

    const handleDropdownSelect = (item, inputId) => {
        setError(null);
        switch (inputId) {
            case 'sending':
                setSendingInputValue(item.name);
                setSelectedSendingId(item.id);
                setShowSendingDropdown(false);
                setFilteredInstitutions([]); // Clear filter on select
                break;
            case 'receiving':
                setReceivingInputValue(item.name);
                setSelectedReceivingId(item.id);
                setShowReceivingDropdown(false);
                setFilteredReceiving([]); // Clear filter on select
                break;
            case 'year':
                setYearInputValue(item.name);
                setSelectedYearId(item.id);
                setShowYearDropdown(false);
                setFilteredYears([]); // Clear filter on select
                break;
            // REMOVED: case 'major'
            default:
                break;
        }
    };

    // MODIFIED: Renamed and changed logic
    const handleViewMajors = () => { // Keep name or rename to handleViewAgreements
        if (!selectedSendingId || !selectedReceivingId || !selectedYearId) {
            setError("Please select sending institution, receiving institution, and academic year first.");
            return;
        }
        setError(null);
        // Navigate to the new combined agreement viewer page
        navigate(`/agreement/${selectedSendingId}/${selectedReceivingId}/${selectedYearId}`);
    };

    // --- Render Dropdown ---
    const renderDropdown = (items, show, inputId) => {
        // Ensure items is an array before mapping
        if (!show || !Array.isArray(items) || items.length === 0) return null;
        return (
            <div className="dropdown">
                {items.map((item) => (
                    <div
                        key={`${inputId}-${item.id}-${item.name}`} // Ensure unique key
                        className="dropdown-item"
                        onMouseDown={() => handleDropdownSelect(item, inputId)}
                    >
                        {item.name}
                    </div>
                ))}
            </div>
        );
    };

    // --- Component JSX ---
    return (
        <div>
            <h1>College Transfer AI</h1>
            {error && <div style={{ color: 'red', marginBottom: '1em' }}>Error: {error}</div>}

            {/* Sending Institution */}
            <div className="form-group">
                <label htmlFor="searchInstitution">Sending Institution:</label>
                <input
                    type="text"
                    id="searchInstitution"
                    placeholder="Type to search..."
                    value={sendingInputValue}
                    onChange={(e) => handleInputChange(e, setSendingInputValue)}
                    onFocus={() => {
                        const allOptions = Object.entries(institutions).map(([name, id]) => ({ name, id }));
                        setFilteredInstitutions(allOptions);
                        setShowSendingDropdown(true);
                    }}
                    onBlur={() =>  setShowSendingDropdown(false)} // Delay to allow click
                    autoComplete="off"
                />
                {renderDropdown(filteredInstitutions, showSendingDropdown, 'sending')}
            </div>

            {/* Receiving Institution */}
            <div className="form-group">
                <label htmlFor="receivingInstitution">Receiving Institution:</label>
                <input
                    type="text"
                    id="receivingInstitution"
                    placeholder="Select sending institution first..."
                    value={receivingInputValue}
                    onChange={(e) => handleInputChange(e, setReceivingInputValue)}
                    onFocus={() => {
                        const allOptions = Object.entries(receivingInstitutions).map(([name, id]) => ({ name, id }));
                        setFilteredReceiving(allOptions);
                        setShowReceivingDropdown(true);
                    }}
                    onBlur={() => setShowReceivingDropdown(false)}
                    disabled={!selectedSendingId}
                    autoComplete="off"
                />
                {renderDropdown(filteredReceiving, showReceivingDropdown, 'receiving')}
            </div>

            {/* Academic Year */}
            <div className="form-group">
                <label htmlFor="academicYears">Academic Year:</label>
                <input
                    type="text"
                    id="academicYears"
                    placeholder="Type to search..."
                    value={yearInputValue}
                    onChange={(e) => handleInputChange(e, setYearInputValue)}
                    onFocus={() => {
                        const allOptions = Object.entries(academicYears)
                            .map(([name, id]) => ({ name, id }))
                            .reverse();
                        setFilteredYears(allOptions);
                        setShowYearDropdown(true);
                    }}
                    onBlur={() => setShowYearDropdown(false)}
                    autoComplete="off"
                />
                {renderDropdown(filteredYears, showYearDropdown, 'year')}
            </div>

            {/* MODIFIED: Button */}
            <button
                onClick={handleViewMajors} // Use the updated handler
                disabled={!selectedSendingId || !selectedReceivingId || !selectedYearId || isLoading}
            >
                {isLoading ? 'Loading...' : 'View Agreements'} {/* Updated text */}
            </button>

            {/* Result message area (optional, could be removed or kept for general status) */}
            <div className="result" id="result" style={{ marginTop: '1em' }}>
                <h3>Status:</h3>
                <pre id="resultContent">{resultMessage}</pre>
            </div>
        </div>
    );
};

export default CollegeTransferForm;