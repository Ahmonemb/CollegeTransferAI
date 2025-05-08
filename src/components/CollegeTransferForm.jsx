import React, { useState, useEffect, useCallback, useRef } from 'react'; 
import { useNavigate } from 'react-router-dom';
import { fetchData } from '../services/api';
import '../App.css';
import { useReceivingInstitutions } from '../hooks/useReceivingInstitutions';
import { useAcademicYears } from '../hooks/useAcademicYears';

const CollegeTransferForm = () => {
    const navigate = useNavigate();

    const [institutions, setInstitutions] = useState({}); 

    const [sendingInputValue, setSendingInputValue] = useState('');
    const [receivingInputValue, setReceivingInputValue] = useState('');
    const [yearInputValue, setYearInputValue] = useState('');

    const [selectedSendingInstitutions, setSelectedSendingInstitutions] = useState([]); 
    const [selectedReceivingId, setSelectedReceivingId] = useState(null); 
    const [selectedYearId, setSelectedYearId] = useState(null);

    const [showSendingDropdown, setShowSendingDropdown] = useState(false);
    const [showReceivingDropdown, setShowReceivingDropdown] = useState(false);
    const [showYearDropdown, setShowYearDropdown] = useState(false);

    const [filteredSending, setFilteredSending] = useState([]); 
    const [filteredReceiving, setFilteredReceiving] = useState([]); 
    const [filteredYears, setFilteredYears] = useState([]);

    const [isLoading] = useState(false); 
    const [error, setError] = useState(null);

    const institutionsCacheRef = useRef(null); 

    const { availableReceivingInstitutions, isLoading: isLoadingReceiving, error: receivingError } = useReceivingInstitutions(selectedSendingInstitutions);
    const { academicYears, isLoading: isLoadingYears, error: yearsError } = useAcademicYears(selectedSendingInstitutions, selectedReceivingId);

    const combinedError = receivingError || yearsError || error; 

    // const resetForm = useCallback(() => {
    //     setSendingInputValue('');
    //     setReceivingInputValue('');
    //     setYearInputValue('');
    //     setSelectedSendingInstitutions([]); 
    //     setSelectedReceivingId(null); 
    //     setSelectedYearId(null);
    //     setAvailableReceivingInstitutions({}); 
    //     setFilteredSending([]);
    //     setFilteredReceiving([]);
    //     setFilteredYears([]);
    //     setShowSendingDropdown(false);
    //     setShowReceivingDropdown(false);
    //     setShowYearDropdown(false);
    //     setError(null);
    // }, []);

    useEffect(() => {
        const cacheInstitutionsKey = "allInstitutions"; 
        let cachedInstitutions = null;

        if (institutionsCacheRef.current) {
            console.log("Loaded institutions from in-memory cache.");
            setInstitutions(institutionsCacheRef.current);
            setError(null);
            return;
        }

        try {
            const cachedData = localStorage.getItem(cacheInstitutionsKey);
            if (cachedData) {
                cachedInstitutions = JSON.parse(cachedData);
                console.log("Loaded institutions from localStorage:", cacheInstitutionsKey);
                setInstitutions(cachedInstitutions);
                institutionsCacheRef.current = cachedInstitutions; 
                setError(null);
                return;
            }
        } catch (e) {
            console.error("Error loading institutions from localStorage:", e);
            localStorage.removeItem(cacheInstitutionsKey); 
        }

        console.log("Cache miss for institutions. Fetching...");
        fetchData('/institutions') 
            .then(data => {
                if (data && Object.keys(data).length > 0) {
                    setInstitutions(data);
                    institutionsCacheRef.current = data; 
                    try {
                        localStorage.setItem(cacheInstitutionsKey, JSON.stringify(data));
                        console.log("Institutions cached successfully:", cacheInstitutionsKey);
                    } catch (e) {
                        console.error("Error caching institutions:", e);
                    }
                } else {
                    setInstitutions({});
                    setError("No institutions found from API.");
                }
            })
            .catch(err => setError(`Failed to load institutions: ${err.message}`));

    }, []); 

    
    const filter = useCallback(
        ((value, data, setFiltered, setShowDropdown, excludeIds = []) => {
            const lowerCaseValue = value.toLowerCase();
            const filtered = Object.entries(data)
                .filter(([name, id]) =>
                    !excludeIds.includes(id) &&
                    name.toLowerCase().includes(lowerCaseValue)
                )
                .map(([name, id]) => ({ name, id }));
            setFiltered(filtered);
            setShowDropdown(true);
        }),
        []
    );

    useEffect(() => {
        const alreadySelectedIds = selectedSendingInstitutions.map(inst => inst.id);
        if (sendingInputValue) {
            filter(sendingInputValue, institutions, setFilteredSending, setShowSendingDropdown, alreadySelectedIds);
        } else {
            const allAvailable = Object.entries(institutions)
                .filter(([, id]) => !alreadySelectedIds.includes(id))
                .map(([name, id]) => ({ name, id }));
            setFilteredSending(allAvailable);
            if (!document.activeElement || document.activeElement.id !== 'searchInstitution') {
                setShowSendingDropdown(false);
            }
        }
    }, [sendingInputValue, institutions, selectedSendingInstitutions, filter]); 

    useEffect(() => {
        const sourceData = availableReceivingInstitutions;
        const excludeIds = []; 

        if (receivingInputValue) {
            filter(receivingInputValue, sourceData, setFilteredReceiving, setShowReceivingDropdown, excludeIds);
        } else {
             const allAvailable = Object.entries(sourceData)
                .map(([name, id]) => ({ name, id }));
             setFilteredReceiving(allAvailable);
             if (!document.activeElement || document.activeElement.id !== 'receivingInstitution') {
                 setShowReceivingDropdown(false);
             }
        }
    }, [receivingInputValue, availableReceivingInstitutions, filter]);

    useEffect(() => {
        const isYearInputEnabled = selectedSendingInstitutions.length > 0 && selectedReceivingId;
        if (yearInputValue && isYearInputEnabled) {
            filter(yearInputValue, academicYears, setFilteredYears, setShowYearDropdown);
        } else {
             if (!document.activeElement || document.activeElement.id !== 'academicYears') {
                 setShowYearDropdown(false);
             }
             setFilteredYears(isYearInputEnabled ? Object.entries(academicYears).map(([name, id]) => ({ name, id })).reverse() : []);
        }
    }, [yearInputValue, academicYears, filter, selectedSendingInstitutions, selectedReceivingId]); 

    const handleInputChange = (e, setInputValue) => {
        setInputValue(e.target.value);
        setError(null);
    };

    const handleDropdownSelect = (item, inputId) => {
        setError(null);
        switch (inputId) {
            case 'sending':
                setSelectedSendingInstitutions(prev => [...prev, item]);
                setSendingInputValue(''); 
                setShowSendingDropdown(false);
                setFilteredSending([]);
                break;
            case 'receiving':
                setReceivingInputValue(item.name);
                setSelectedReceivingId(item.id);
                setYearInputValue('');
                setSelectedYearId(null);
                setShowReceivingDropdown(false);
                setFilteredReceiving([]);
                break;
            case 'year':
                setYearInputValue(item.name);
                setSelectedYearId(item.id);
                setShowYearDropdown(false);
                setFilteredYears([]);
                break;
            default:
                break;
        }
    };

    const handleRemoveSending = (idToRemove) => {
        setSelectedSendingInstitutions(prev => prev.filter(inst => inst.id !== idToRemove));
    };

    const handleViewMajors = () => {
        if (selectedSendingInstitutions.length === 0) {
            setError("Please select at least one sending institution.");
            return;
        }
        if (!selectedReceivingId || !selectedYearId) {
            setError("Please select receiving institution and academic year.");
            return;
        }
        setError(null);
        const firstSendingId = selectedSendingInstitutions[0].id;

        navigate(`/agreement/${firstSendingId}/${selectedReceivingId}/${selectedYearId}`, {
            state: {
                allSelectedSendingInstitutions: selectedSendingInstitutions
            }
        });
    };

    const renderDropdown = (items, show, inputId) => {
        if (!show || !Array.isArray(items) || items.length === 0) return null;
        return (
            <div className="dropdown">
                {items.map((item) => (
                    <div
                        key={`${inputId}-${item.id}-${item.name}`} 
                        className="dropdown-item"
                        onMouseDown={() => handleDropdownSelect(item, inputId)}
                    >
                        {item.name}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div style={{ maxWidth: "960px"}}>
            <h1>College Transfer AI</h1>
            {combinedError && <div style={{ color: 'red', marginBottom: '1em' }}>Error: {combinedError}</div>}

            <div className="form-group">
                <label htmlFor="searchInstitution">Sending Institution(s):</label>

                <div style={{ marginBottom: selectedSendingInstitutions.length > 0 ? '0.5em' : '0', display: 'flex', flexWrap: 'wrap', gap: '0.5em' }}>
                    {selectedSendingInstitutions.map(inst => (
                        <span key={inst.id} className="tag" style={{ display: 'inline-flex', alignItems: 'center', background: '#e0e0e0', padding: '3px 8px', borderRadius: '12px', fontSize: '0.9em' }}>
                            {inst.name}
                            <button
                                onClick={() => handleRemoveSending(inst.id)}
                                style={{ marginLeft: '5px', border: 'none', background: 'none', color: '#888', cursor: 'pointer', fontSize: '1.1em', padding: '0 2px', lineHeight: '1' }}
                                title={`Remove ${inst.name}`}
                            >
                                &times;
                            </button>
                        </span>
                    ))}
                </div>

                <input
                    type="text"
                    id="searchInstitution" 
                    placeholder="Type to search and add..."
                    value={sendingInputValue}
                    onChange={(e) => handleInputChange(e, setSendingInputValue)}
                    onFocus={() => {
                        const alreadySelectedIds = selectedSendingInstitutions.map(inst => inst.id);
                        const allAvailable = Object.entries(institutions)
                            .filter(([, id]) => !alreadySelectedIds.includes(id))
                            .map(([name, id]) => ({ name, id }));
                        setFilteredSending(allAvailable);
                        setShowSendingDropdown(true);
                    }}
                    onBlur={() => setShowSendingDropdown(false)}
                    autoComplete="off"
                />
                {renderDropdown(filteredSending, showSendingDropdown, 'sending')}
            </div>

            <div className="form-group">
                <label htmlFor="receivingInstitution">Receiving Institution:</label>
                <input
                    type="text"
                    id="receivingInstitution"
                    placeholder={
                        isLoadingReceiving ? "Loading common institutions..." :
                        selectedSendingInstitutions.length === 0 ? "Select sending institution(s) first..." :
                        Object.keys(availableReceivingInstitutions).length === 0 && !error ? "No common institutions found..." :
                        "Type to search common institutions..."
                    }
                    value={receivingInputValue}
                    onChange={(e) => handleInputChange(e, setReceivingInputValue)}
                    onFocus={() => {
                        if (!isLoadingReceiving && selectedSendingInstitutions.length > 0) {
                            const sourceData = availableReceivingInstitutions;
                            const allAvailable = Object.entries(sourceData)
                                .map(([name, id]) => ({ name, id }));
                            setFilteredReceiving(allAvailable);
                            setShowReceivingDropdown(true);
                        }
                    }}
                    onBlur={() => setShowReceivingDropdown(false)}
                    disabled={isLoadingReceiving || selectedSendingInstitutions.length === 0 || (!isLoadingReceiving && Object.keys(availableReceivingInstitutions).length === 0)}
                    autoComplete="off"
                />
                {renderDropdown(filteredReceiving, showReceivingDropdown, 'receiving')}
            </div>

            <div className="form-group">
                <label htmlFor="academicYear">Academic Year:</label>
                <input
                    type="text"
                    id="academicYears"
                    placeholder={
                        isLoadingYears ? "Loading common years..." :
                        selectedSendingInstitutions.length === 0 || !selectedReceivingId
                            ? "Select sending & receiving institutions first..."
                            : Object.keys(academicYears).length === 0 && !error ? "No common years found..."
                            : "Type to search common years..."
                    }
                    value={yearInputValue}
                    onChange={(e) => handleInputChange(e, setYearInputValue)}
                    onFocus={() => {
                        if (!isLoadingYears && selectedSendingInstitutions.length > 0 && selectedReceivingId) {
                            const allOptions = Object.entries(academicYears)
                                .map(([name, id]) => ({ name, id }))
                                .sort((a, b) => b.name.localeCompare(a.name)); 
                            setFilteredYears(allOptions);
                            setShowYearDropdown(true);
                        }
                    }}
                    onBlur={() => setShowYearDropdown(false)}
                    disabled={isLoadingYears || selectedSendingInstitutions.length === 0 || !selectedReceivingId || (!isLoadingYears && Object.keys(academicYears).length === 0)}
                    autoComplete="off"
                />
                {(!isLoadingYears && selectedSendingInstitutions.length > 0 && selectedReceivingId) &&
                    renderDropdown(filteredYears, showYearDropdown, 'year')}
            </div>

            <button
                onClick={handleViewMajors}
                disabled={isLoadingYears || isLoadingReceiving || selectedSendingInstitutions.length === 0 || !selectedReceivingId || !selectedYearId || isLoading}
                title={
                    isLoadingYears ? "Loading common academic years..." :
                    isLoadingReceiving ? "Loading common institutions..." :
                    selectedSendingInstitutions.length === 0 ? "Select at least one sending institution" :
                    !selectedReceivingId ? "Select a receiving institution" :
                    !selectedYearId ? "Select an academic year" : ""
                }
            >
                {isLoadingYears ? 'Loading Years...' : isLoading ? 'Loading...' : 'View Agreements'}
            </button>
        </div>
    );
};

export default CollegeTransferForm;