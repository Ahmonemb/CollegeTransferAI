import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchData } from '../services/api';
import '../App.css';

const CollegeTransferForm = () => {
    const navigate = useNavigate();

    // --- State for fetched data ---
    const [institutions, setInstitutions] = useState({}); // All institutions (for sending dropdown)
    const [availableReceivingInstitutions, setAvailableReceivingInstitutions] = useState({}); // NEW: Institutions available for the selected sender(s)
    const [academicYears, setAcademicYears] = useState({});

    // --- State for input values and selections ---
    const [sendingInputValue, setSendingInputValue] = useState('');
    const [receivingInputValue, setReceivingInputValue] = useState('');
    const [yearInputValue, setYearInputValue] = useState('');

    const [selectedSendingInstitutions, setSelectedSendingInstitutions] = useState([]); // Array for multiple sending
    const [selectedReceivingId, setSelectedReceivingId] = useState(null); // Single receiving ID
    const [selectedYearId, setSelectedYearId] = useState(null);

    // --- State for dropdown visibility and filtered options ---
    const [showSendingDropdown, setShowSendingDropdown] = useState(false);
    const [showReceivingDropdown, setShowReceivingDropdown] = useState(false);
    const [showYearDropdown, setShowYearDropdown] = useState(false);

    // const [filteredInstitutions, setFilteredInstitutions] = useState([]); // No longer needed?
    const [filteredSending, setFilteredSending] = useState([]); // Options for the *current* sending input
    const [filteredReceiving, setFilteredReceiving] = useState([]); // Options for receiving input
    const [filteredYears, setFilteredYears] = useState([]);

    // --- State for loading and results ---
    const [isLoading] = useState(false); // Consider separate loading states if needed
    const [error, setError] = useState(null);
    const [isLoadingReceiving, setIsLoadingReceiving] = useState(false);
    const [isLoadingYears, setIsLoadingYears] = useState(false); // New state for loading years

    // --- Helper Functions (resetForm - adjust state clearing) ---
    // const resetForm = useCallback(() => {
    //     setSendingInputValue('');
    //     setReceivingInputValue('');
    //     setYearInputValue('');
    //     setSelectedSendingInstitutions([]); // Clear array
    //     setSelectedReceivingId(null); // Clear single ID
    //     setSelectedYearId(null);
    //     setAvailableReceivingInstitutions({}); // Clear available receiving
    //     setFilteredSending([]);
    //     setFilteredReceiving([]);
    //     setFilteredYears([]);
    //     setShowSendingDropdown(false);
    //     setShowReceivingDropdown(false);
    //     setShowYearDropdown(false);
    //     setError(null);
    // }, []);

    // --- Effects for Initial Data Loading (Institutions, Years) ---
    useEffect(() => {
        const cacheInstitutionsKey = "instutions"
        let cachedInstitutions = null

        try {
            const cachedData = localStorage.getItem(cacheInstitutionsKey);
            if (cachedData) {
                cachedInstitutions = JSON.parse(cachedData);
                console.log("Loaded institutions from cache:", cacheInstitutionsKey);
                setInstitutions(cachedInstitutions);
                setError(null);
                return;
            }
        } catch (e) {
            console.error("Error loading institutions from cache:", e);
            localStorage.removeItem(cacheInstitutionsKey); // Clear cache on error
        }

        
        fetchData('institutions')
            .then(data => {
                setInstitutions(data)
                try {
                    localStorage.setItem(cacheInstitutionsKey, JSON.stringify(data));
                    console.log("Institutions cached successfully:", cacheInstitutionsKey);
                } catch (e) {
                    console.error("Error caching institutions:", e);
                }
            })
            .catch(err => setError(`Failed to load institutions: ${err.message}`));
        
    }, []);

    useEffect(() => {
        // Only proceed if we have at least one sending institution AND a receiving institution selected
        if (selectedSendingInstitutions.length > 0 && selectedReceivingId) {
            const firstSendingId = selectedSendingInstitutions[0].id; // Use the first selected sender for the API call
            const cacheAcademicYearsKey = `academic-years-${firstSendingId}-${selectedReceivingId}`;
            let cachedAcademicYears = null;

            console.log(`Attempting to load/fetch academic years for S=${firstSendingId}, R=${selectedReceivingId}`);

            // --- Check Cache ---
            try {
                const cachedData = localStorage.getItem(cacheAcademicYearsKey);
                if (cachedData) {
                    cachedAcademicYears = JSON.parse(cachedData);
                    console.log("Loaded academic years from cache:", cacheAcademicYearsKey);
                    setAcademicYears(cachedAcademicYears);
                    setError(null); // Clear previous errors if loaded from cache
                    return; // Exit early if loaded from cache
                }
            } catch (e) {
                console.error("Error loading academic years from cache:", e);
                localStorage.removeItem(cacheAcademicYearsKey); // Clear potentially corrupted cache
            }

            // --- Fetch from API ---
            // Add loading state if desired: setIsLoadingYears(true);
            setError(null); // Clear previous errors before fetching
            fetchData(`academic-years?sendingId=${firstSendingId}&receivingId=${selectedReceivingId}`)
                .then(data => {
                    if (data && Object.keys(data).length > 0) {
                        setAcademicYears(data);
                        // --- Cache Result ---
                        try {
                            localStorage.setItem(cacheAcademicYearsKey, JSON.stringify(data));
                            console.log("Academic Years cached successfully:", cacheAcademicYearsKey);
                        } catch (e) {
                            console.error("Error caching academic years:", e);
                        }
                    } else {
                        // Handle case where API returns no years for the combination
                        setAcademicYears({});
                        setError(`No academic years found for the selected combination.`);
                        console.log("No academic years found from API.");
                    }
                })
                .catch(err => {
                    setError(`Failed to load academic years: ${err.message}`);
                    setAcademicYears({}); // Clear years on fetch error
                })
                .finally(() => {
                    // Add loading state if desired: setIsLoadingYears(false);
                });

        } else {
            // If sending or receiving is not selected, clear academic years data
            console.log("Clearing academic years because sending/receiving is not fully selected.");
            setAcademicYears({});
            // Optionally clear year input value as well, though it's handled elsewhere too
            // setYearInputValue('');
            // setSelectedYearId(null);
        }
        // Dependencies: Run this effect when the selected sending institutions OR the selected receiving ID changes.
    }, [selectedSendingInstitutions, selectedReceivingId]);

    // --- MODIFIED Effect for Fetching Receiving Institutions based on ALL Senders ---
    useEffect(() => {
        // Clear previous receiving selections and data whenever sending institutions change
        setReceivingInputValue('');
        setSelectedReceivingId(null);
        // ALSO CLEAR YEAR SELECTION when sending institutions change
        setYearInputValue('');
        setSelectedYearId(null);
        setAvailableReceivingInstitutions({});
        setFilteredReceiving([]);
        setError(null); // Clear previous errors

        const fetchAndIntersectReceiving = async () => {
            if (selectedSendingInstitutions.length === 0) {
                setAvailableReceivingInstitutions({}); // No senders, no receivers
                return;
            }

            setIsLoadingReceiving(true); // Start loading
            setError(null);

            try {
                if (selectedSendingInstitutions.length === 1) {
                    // --- Fetch for a single sender ---
                    const firstSendingId = selectedSendingInstitutions[0].id;
                    console.log("Fetching receiving for single sender:", firstSendingId);
                    const data = await fetchData(`receiving-institutions?sendingId=${firstSendingId}`);
                    if (data && Object.keys(data).length > 0) {
                        setAvailableReceivingInstitutions(data);
                    } else {
                        setAvailableReceivingInstitutions({});
                        setError(`No receiving institutions found with agreements for ${selectedSendingInstitutions[0].name}.`);
                    }
                } else {
                    // --- Fetch for multiple senders and find intersection ---
                    console.log("Fetching receiving for multiple senders:", selectedSendingInstitutions.map(s => s.id));
                    const promises = selectedSendingInstitutions.map(sender =>
                        fetchData(`receiving-institutions?sendingId=${sender.id}`)
                            .catch(err => {
                                // Handle individual fetch errors gracefully, maybe return empty object
                                console.error(`Failed to fetch receiving for ${sender.name} (${sender.id}):`, err);
                                return {}; // Return empty object on error for this sender
                            })
                    );

                    const results = await Promise.all(promises);
                    console.log("Raw results from multiple fetches:", results);

                    // Check if any fetch failed completely (returned null/undefined instead of {})
                    if (results.some(res => res === null || typeof res === 'undefined')) {
                         throw new Error("One or more requests for receiving institutions failed.");
                    }

                    // Calculate intersection based on IDs
                    if (results.length > 0) {
                        // Get IDs from the first result as the starting point
                        let commonIds = new Set(Object.values(results[0]));

                        // Intersect with IDs from subsequent results
                        for (let i = 1; i < results.length; i++) {
                            const currentIds = new Set(Object.values(results[i]));
                            commonIds = new Set([...commonIds].filter(id => currentIds.has(id)));
                        }

                        console.log("Common receiving institution IDs:", commonIds);

                        // Rebuild the availableReceivingInstitutions object using common IDs
                        // We need a way to map IDs back to names. We can use the first result
                        // (or any result that isn't empty) that contains the common IDs.
                        const intersection = {};
                        let nameMapSource = results.find(res => Object.keys(res).length > 0) || {};
                        // Create a reverse map (id -> name) from a source result for efficiency
                        const idToNameMap = Object.entries(nameMapSource).reduce((acc, [name, id]) => {
                            acc[id] = name;
                            return acc;
                        }, {});


                        commonIds.forEach(id => {
                            // Find the name corresponding to the common ID
                            const name = idToNameMap[id];
                            if (name) { // Ensure we found a name
                                intersection[name] = id;
                            } else {
                                console.warn(`Could not find name for common receiving ID: ${id}. This might happen if the ID exists in later results but not the first.`);
                                // As a fallback, you could try searching other results, but this indicates potential data inconsistency.
                            }
                        });


                        if (Object.keys(intersection).length > 0) {
                            setAvailableReceivingInstitutions(intersection);
                            console.log("Intersection result:", intersection);
                        } else {
                            setAvailableReceivingInstitutions({});
                            setError("No common receiving institutions found for the selected sending institutions.");
                        }
                    } else {
                        // Should not happen if selectedSendingInstitutions.length > 1, but handle defensively
                        setAvailableReceivingInstitutions({});
                    }
                }
            } catch (err) {
                console.error("Error processing receiving institutions:", err);
                setError(`Failed to load or process receiving institutions: ${err.message}`);
                setAvailableReceivingInstitutions({}); // Clear on error
            } finally {
                setIsLoadingReceiving(false); // Stop loading
            }
        };

        fetchAndIntersectReceiving();

    }, [selectedSendingInstitutions]); // Re-run when the list of selected senders changes

    // --- MODIFIED Effect for Fetching Academic Years ---
    useEffect(() => {
        // Clear previous year selections and data whenever sending/receiving changes
        setYearInputValue('');
        setSelectedYearId(null);
        setAcademicYears({});
        setFilteredYears([]);
        setError(null); // Clear previous errors related to years

        const fetchAndIntersectYears = async () => {
            // Only proceed if we have at least one sending institution AND a receiving institution selected
            if (selectedSendingInstitutions.length === 0 || !selectedReceivingId) {
                setAcademicYears({}); // Clear years if selections are incomplete
                return;
            }

            setIsLoadingYears(true); // Start loading years
            setError(null);

            try {
                if (selectedSendingInstitutions.length === 1) {
                    // --- Fetch for a single sender ---
                    const firstSendingId = selectedSendingInstitutions[0].id;
                    console.log(`Fetching years for single sender S=${firstSendingId}, R=${selectedReceivingId}`);
                    const cacheKey = `academic-years-${firstSendingId}-${selectedReceivingId}`;
                    let cachedYears = null;

                    // Check Cache
                    try {
                        const cachedData = localStorage.getItem(cacheKey);
                        if (cachedData) {
                            cachedYears = JSON.parse(cachedData);
                            console.log("Loaded academic years from cache:", cacheKey);
                            setAcademicYears(cachedYears);
                            setIsLoadingYears(false); // Stop loading
                            return;
                        }
                    } catch (e) {
                        console.error("Error loading academic years from cache:", e);
                        localStorage.removeItem(cacheKey);
                    }

                    // Fetch from API
                    const data = await fetchData(`academic-years?sendingId=${firstSendingId}&receivingId=${selectedReceivingId}`);
                    if (data && Object.keys(data).length > 0) {
                        setAcademicYears(data);
                        // Cache Result
                        try {
                            localStorage.setItem(cacheKey, JSON.stringify(data));
                            console.log("Academic Years cached successfully:", cacheKey);
                        } catch (e) {
                            console.error("Error caching academic years:", e);
                        }
                    } else {
                        setAcademicYears({});
                        setError(`No academic years found for ${selectedSendingInstitutions[0].name} and the selected receiving institution.`);
                    }
                } else {
                    // --- Fetch for multiple senders and find intersection ---
                    console.log(`Fetching years for multiple senders (Count: ${selectedSendingInstitutions.length}), R=${selectedReceivingId}`);
                    const promises = selectedSendingInstitutions.map(sender =>
                        fetchData(`academic-years?sendingId=${sender.id}&receivingId=${selectedReceivingId}`)
                            .catch(err => {
                                console.error(`Failed to fetch years for S=${sender.id}, R=${selectedReceivingId}:`, err);
                                return {}; // Return empty object on error for this sender/receiver pair
                            })
                    );

                    const results = await Promise.all(promises);
                    console.log("Raw year results from multiple fetches:", results);

                    // Check if any fetch failed completely
                    if (results.some(res => res === null || typeof res === 'undefined')) {
                        throw new Error("One or more requests for academic years failed.");
                    }

                    // Calculate intersection based on IDs
                    if (results.length > 0 && results.every(res => typeof res === 'object' && res !== null)) {
                        // Get IDs from the first valid result as the starting point
                        let commonIds = new Set(Object.values(results[0]));

                        // Intersect with IDs from subsequent results
                        for (let i = 1; i < results.length; i++) {
                            const currentIds = new Set(Object.values(results[i]));
                            commonIds = new Set([...commonIds].filter(id => currentIds.has(id)));
                        }

                        console.log("Common academic year IDs:", commonIds);

                        // Rebuild the academicYears object using common IDs
                        const intersection = {};
                        let nameMapSource = results.find(res => Object.keys(res).length > 0) || {};
                        const idToNameMap = Object.entries(nameMapSource).reduce((acc, [name, id]) => {
                            acc[id] = name;
                            return acc;
                        }, {});

                        commonIds.forEach(id => {
                            const name = idToNameMap[id];
                            if (name) {
                                intersection[name] = id;
                            } else {
                                console.warn(`Could not find name for common academic year ID: ${id}.`);
                            }
                        });

                        if (Object.keys(intersection).length > 0) {
                            setAcademicYears(intersection);
                            console.log("Intersection year result:", intersection);
                        } else {
                            setAcademicYears({});
                            setError("No common academic years found for the selected combination of institutions.");
                        }
                    } else {
                        setAcademicYears({}); // Clear if results are invalid
                        if (results.length > 0) { // Only set error if we expected results
                           setError("Could not process academic years from one or more sources.");
                        }
                    }
                }
            } catch (err) {
                console.error("Error processing academic years:", err);
                setError(`Failed to load or process academic years: ${err.message}`);
                setAcademicYears({}); // Clear on error
            } finally {
                setIsLoadingYears(false); // Stop loading
            }
        };

        fetchAndIntersectYears();

        // Cleanup function to potentially cancel fetches if component unmounts or dependencies change quickly
        // return () => { /* Add cleanup logic if using AbortController */ };

    }, [selectedSendingInstitutions, selectedReceivingId]); // Re-run when senders or receiver changes

    // --- Effects for Filtering Dropdowns ---
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

    // Modified useEffect for sending dropdown
    useEffect(() => {
        const alreadySelectedIds = selectedSendingInstitutions.map(inst => inst.id);
        if (sendingInputValue) {
            filter(sendingInputValue, institutions, setFilteredSending, setShowSendingDropdown, alreadySelectedIds);
        } else {
            // Show all available (not already selected) options on focus/empty
            const allAvailable = Object.entries(institutions)
                .filter(([, id]) => !alreadySelectedIds.includes(id))
                .map(([name, id]) => ({ name, id }));
            setFilteredSending(allAvailable);
            if (!document.activeElement || document.activeElement.id !== 'searchInstitution') {
                setShowSendingDropdown(false);
            }
        }
    }, [sendingInputValue, institutions, selectedSendingInstitutions, filter]); // Add selectedSendingInstitutions

    // --- MODIFIED useEffect for receiving dropdown filtering ---
    useEffect(() => {
        const sourceData = availableReceivingInstitutions;
        const excludeIds = []; // No need to exclude senders here

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
    // Depend on the potentially updated availableReceivingInstitutions
    }, [receivingInputValue, availableReceivingInstitutions, filter]);

    // --- MODIFIED useEffect for year dropdown filtering ---
    useEffect(() => {
        // Only filter if year input is enabled
        const isYearInputEnabled = selectedSendingInstitutions.length > 0 && selectedReceivingId;
        if (yearInputValue && isYearInputEnabled) {
            filter(yearInputValue, academicYears, setFilteredYears, setShowYearDropdown);
        } else {
             if (!document.activeElement || document.activeElement.id !== 'academicYears') {
                 setShowYearDropdown(false);
             }
             // Only set filtered years if input is enabled, otherwise keep it empty
             setFilteredYears(isYearInputEnabled ? Object.entries(academicYears).map(([name, id]) => ({ name, id })).reverse() : []);
        }
    }, [yearInputValue, academicYears, filter, selectedSendingInstitutions, selectedReceivingId]); // Add dependencies

    // --- Event Handlers ---
    const handleInputChange = (e, setInputValue) => {
        setInputValue(e.target.value);
        setError(null);
    };

    // Modified handleDropdownSelect
    const handleDropdownSelect = (item, inputId) => {
        setError(null);
        switch (inputId) {
            case 'sending':
                // Add to the array, clear input
                setSelectedSendingInstitutions(prev => [...prev, item]);
                setSendingInputValue(''); // Clear input after selection
                setShowSendingDropdown(false);
                setFilteredSending([]);
                break;
            case 'receiving':
                // Set single receiving ID and value
                setReceivingInputValue(item.name);
                setSelectedReceivingId(item.id);
                // Clear year selection if receiving institution changes
                setYearInputValue('');
                setSelectedYearId(null);
                // Also clear existing academic years data as it's now invalid
                setAcademicYears({});
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

    // NEW: Handler to remove a selected sending institution
    const handleRemoveSending = (idToRemove) => {
        setSelectedSendingInstitutions(prev => prev.filter(inst => inst.id !== idToRemove));
    };

    // Modified handleViewMajors
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
        // Use the FIRST selected sending institution for the initial URL path
        const firstSendingId = selectedSendingInstitutions[0].id;

        // Navigate, passing the full list of selected sending institutions in state
        navigate(`/agreement/${firstSendingId}/${selectedReceivingId}/${selectedYearId}`, {
            state: {
                // Pass the full array of selected sending institutions objects
                allSelectedSendingInstitutions: selectedSendingInstitutions
            }
        });
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
        <div style={{ maxWidth: "960px"}}>
            <h1>College Transfer AI</h1>
            {error && <div style={{ color: 'red', marginBottom: '1em' }}>Error: {error}</div>}

            {/* Sending Institution Section */}
            <div className="form-group">
                <label htmlFor="searchInstitution">Sending Institution(s):</label>

                {/* Display Selected Institutions as Tags */}
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

                {/* Input for adding next sending institution */}
                <input
                    type="text"
                    id="searchInstitution" // Keep ID for focus logic if needed
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

            {/* Receiving Institution Section (Single Selection) */}
            <div className="form-group">
                <label htmlFor="receivingInstitution">Receiving Institution:</label>
                <input
                    type="text"
                    id="receivingInstitution"
                    // Update placeholder based on loading state and availability
                    placeholder={
                        isLoadingReceiving ? "Loading common institutions..." :
                        selectedSendingInstitutions.length === 0 ? "Select sending institution(s) first..." :
                        Object.keys(availableReceivingInstitutions).length === 0 && !error ? "No common institutions found..." :
                        "Type to search common institutions..."
                    }
                    value={receivingInputValue}
                    onChange={(e) => handleInputChange(e, setReceivingInputValue)}
                    onFocus={() => {
                        // Populate dropdown from 'availableReceivingInstitutions' on focus
                        if (!isLoadingReceiving && selectedSendingInstitutions.length > 0) {
                            const sourceData = availableReceivingInstitutions;
                            const allAvailable = Object.entries(sourceData)
                                .map(([name, id]) => ({ name, id }));
                            setFilteredReceiving(allAvailable);
                            setShowReceivingDropdown(true);
                        }
                    }}
                    onBlur={() => setShowReceivingDropdown(false)}
                    // Disable if loading, no senders selected, or (after loading) no common institutions available
                    disabled={isLoadingReceiving || selectedSendingInstitutions.length === 0 || (!isLoadingReceiving && Object.keys(availableReceivingInstitutions).length === 0)}
                    autoComplete="off"
                />
                {/* Uses 'filteredReceiving' for display */}
                {renderDropdown(filteredReceiving, showReceivingDropdown, 'receiving')}
            </div>

            {/* Academic Year */}
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
                        // Only show dropdown if input is enabled and not loading
                        if (!isLoadingYears && selectedSendingInstitutions.length > 0 && selectedReceivingId) {
                            const allOptions = Object.entries(academicYears)
                                .map(([name, id]) => ({ name, id }))
                                .sort((a, b) => b.name.localeCompare(a.name)); // Sort descending
                            setFilteredYears(allOptions);
                            setShowYearDropdown(true);
                        }
                    }}
                    onBlur={() => setShowYearDropdown(false)}
                    // Disable if loading years, or sending/receiving not selected, or (after loading) no years available
                    disabled={isLoadingYears || selectedSendingInstitutions.length === 0 || !selectedReceivingId || (!isLoadingYears && Object.keys(academicYears).length === 0)}
                    autoComplete="off"
                />
                {/* Render dropdown only if input is enabled and not loading */}
                {(!isLoadingYears && selectedSendingInstitutions.length > 0 && selectedReceivingId) &&
                    renderDropdown(filteredYears, showYearDropdown, 'year')}
            </div>

            {/* MODIFIED: Button - Adjust disabled logic */}
            <button
                onClick={handleViewMajors}
                // Disable if loading anything, or basic selections missing
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