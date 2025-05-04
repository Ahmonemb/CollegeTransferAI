import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom'; // Import useLocation
import PdfViewer from './PdfViewer';
import ChatInterface from './ChatInterface';
import { fetchData } from '../services/api';
import '../App.css';

// Helper function to format remaining time
function formatRemainingTime(resetTimestamp) {
    if (!resetTimestamp) return '';
    const now = new Date();
    const resetDate = new Date(resetTimestamp);
    const diff = resetDate.getTime() - now.getTime();

    if (diff <= 0) return 'Usage reset';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return `Resets in ${hours}h ${minutes}m ${seconds}s`;
}


function AgreementViewerPage({ user, userTier }) {
    const { sendingId: initialSendingId, receivingId, yearId } = useParams(); // Get initial IDs from URL
    const location = useLocation(); // Get location object

    // Get the full list passed from the form, default to an array containing the initial one if state is missing
    const allSelectedSendingInstitutions = useMemo(() => {
        return location.state?.allSelectedSendingInstitutions || [{ id: initialSendingId, name: 'Unknown Sending Institution' }];
    }, [location.state?.allSelectedSendingInstitutions, initialSendingId]);

    // --- State for resizing (remains the same) ---
    const [chatColumnWidth, setChatColumnWidth] = useState(400);
    const isResizingRef = useRef(false);
    const dividerRef = useRef(null);
    const containerRef = useRef(null);

    // Define minColWidth and dividerWidth as constants outside the component
    const minColWidth = 150;
    const dividerWidth = 1;
    const fixedMajorsWidth = 300; // Revert to fixed width for majors

    // --- State for Majors Column Visibility (remains the same) ---
    const [isMajorsVisible, setIsMajorsVisible] = useState(true);
    const isMajorsVisibleRef = useRef(isMajorsVisible);

    // --- Update ref whenever visibility state changes ---
    useEffect(() => {
        isMajorsVisibleRef.current = isMajorsVisible;
    }, [isMajorsVisible]);

    // --- State for Agreement Data ---
    const [selectedCategory, setSelectedCategory] = useState('major');
    const [majors, setMajors] = useState({});
    const [isLoadingMajors, setIsLoadingMajors] = useState(true);
    const [error, setError] = useState(null); // General error
    const [pdfError, setPdfError] = useState(null); // PDF/Image specific error
    const [selectedMajorKey, setSelectedMajorKey] = useState(null);
    const [selectedMajorName, setSelectedMajorName] = useState('');
    const [isLoadingPdf, setIsLoadingPdf] = useState(false);
    const [majorSearchTerm, setMajorSearchTerm] = useState('');
    const [hasMajorsAvailable, setHasMajorsAvailable] = useState(true);
    const [hasDepartmentsAvailable, setHasDepartmentsAvailable] = useState(true);
    const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);

    // --- NEW State for Multiple PDFs/Tabs ---
    const [agreementData, setAgreementData] = useState([]); // Array of { sendingId, sendingName, pdfFilename }
    const [activeTabIndex, setActiveTabIndex] = useState(0); // Index of the currently viewed PDF/Tab
    const [imagesForActivePdf, setImagesForActivePdf] = useState([]); // Renamed for clarity
    const [allAgreementsImageFilenames, setAllAgreementsImageFilenames] = useState([]); // NEW: For initial chat analysis

    // --- NEW State for User Usage Status ---
    const [usageStatus, setUsageStatus] = useState({
        usageCount: null,
        usageLimit: null,
        resetTime: null,
        tier: userTier || null, // Initialize tier from prop
        error: null,
    });
    const [countdown, setCountdown] = useState('');
    // --- End Usage Status State ---

    // --- Derived state for the currently active agreement ---
    const currentAgreement = agreementData[activeTabIndex] || null;
    const currentSendingId = currentAgreement?.sendingId || initialSendingId; // Fallback to URL param if needed initially
    const currentPdfFilename = currentAgreement?.pdfFilename || null;

    // --- Effect to Fetch User Usage Status ---
    useEffect(() => {
        // Update local tier state if prop changes (e.g., after successful payment webhook)
        setUsageStatus(prev => ({ ...prev, tier: userTier }));

        if (!user || !user.idToken) {
            setUsageStatus({ usageCount: null, usageLimit: null, resetTime: null, tier: userTier, error: 'Not logged in' });
            return;
        }

        const fetchStatus = async () => {
            try {
                const data = await fetchData('user-status', {
                    headers: {
                        'Authorization': `Bearer ${user.idToken}`
                    }
                });
                if (data && data.usageLimit !== undefined) {
                    setUsageStatus({
                        usageCount: data.usageCount,
                        usageLimit: data.usageLimit,
                        resetTime: data.resetTime,
                        tier: data.tier, // Use tier from API response
                        error: null,
                    });
                } else {
                    throw new Error(data?.error || 'Invalid status response');
                }
            } catch (err) {
                console.error("Error fetching user status:", err);
                // Keep tier from prop even if fetch fails? Or show error?
                setUsageStatus(prev => ({ ...prev, tier: userTier, error: `Failed to load usage: ${err.message}` }));
            }
        };

        fetchStatus();
        // Optionally, refetch periodically if needed, but a single fetch on load/user change might be sufficient
        // const intervalId = setInterval(fetchStatus, 60000); // Example: refetch every minute
        // return () => clearInterval(intervalId);

    }, [user, userTier]); // Re-fetch when user object changes

    // --- Effect to SET Initial Countdown Value ---
    useEffect(() => {
        // Set the initial display value only when all conditions are met
        if (usageStatus.resetTime && agreementData.length > 0 && !isLoadingPdf) {
            const initialRemaining = formatRemainingTime(usageStatus.resetTime);
            setCountdown(initialRemaining);
            console.log("Setting initial countdown display:", initialRemaining);
        } else {
            // Clear the display if conditions aren't met (e.g., loading, no reset time)
            setCountdown('');
            console.log("Clearing countdown display because conditions not met.");
        }
    // This effect runs when the conditions required to *start* the display change
    }, [usageStatus.resetTime, agreementData, isLoadingPdf]);

    // --- Effect to RUN the Countdown Interval ---
    useEffect(() => {
        // Only manage the interval based on the existence of a reset time
        if (!usageStatus.resetTime) {
            setCountdown(''); // Ensure countdown is cleared if resetTime becomes invalid/null
            return; // Don't start interval if no reset time
        }

        // Check if already reset initially when this effect runs
        const initialCheck = formatRemainingTime(usageStatus.resetTime);
        if (initialCheck === 'Usage reset') {
            setCountdown(initialCheck); // Ensure display shows 'Usage reset'
            return; // Don't start interval if already reset
        }

        console.log("Starting countdown interval timer.");
        const intervalId = setInterval(() => {
            const remaining = formatRemainingTime(usageStatus.resetTime);
            setCountdown(remaining); // Update display every second

            if (remaining === 'Usage reset') {
                console.log("Countdown reached reset time, clearing interval.");
                clearInterval(intervalId);
                // Optionally refetch status here if needed after reset
                // fetchStatus(); // Make sure fetchStatus is accessible if you uncomment this
            }
        }, 1000); // Update every second

        // Cleanup interval ONLY when the component unmounts or resetTime changes
        return () => {
            console.log("Clearing countdown interval due to unmount or resetTime change.");
            clearInterval(intervalId);
        };
    }, [usageStatus.resetTime]); // Only depend on resetTime for the interval itself

    // --- End Countdown Effects ---


    // --- Existing Effects (Availability, Fetching Majors - adjust dependencies) ---
    // Availability check might need adjustment if it depends on a single sendingId
    useEffect(() => {
        if (!initialSendingId || !receivingId || !yearId) {
            setIsLoadingAvailability(false);
            setHasMajorsAvailable(false);
            setHasDepartmentsAvailable(false);
            return;
        }

        setIsLoadingAvailability(true);
        setHasMajorsAvailable(false);
        setHasDepartmentsAvailable(false);

        const checkAvailability = async (category) => {
            const cacheKey = `agreements-${category}-${initialSendingId}-${receivingId}-${yearId}`;
            try {
                const storedData = localStorage.getItem(cacheKey);
                if (storedData) {
                    const parsedData = JSON.parse(storedData);
                    if (parsedData && Object.keys(parsedData).length > 0) {
                        return true;
                    }
                }
            } catch (e) {
                console.error(`Failed to read or parse ${category} cache for availability check:`, e);
                localStorage.removeItem(cacheKey);
            }

            try {
                const data = await fetchData(`majors?sendingId=${initialSendingId}&receivingId=${receivingId}&academicYearId=${yearId}&categoryCode=${category}`);
                return data && Object.keys(data).length > 0;
            } catch (err) {
                console.error(`Error checking availability for ${category}:`, err);
                return false;
            }
        };

        Promise.all([checkAvailability('major'), checkAvailability('dept')])
            .then(([majorsExist, deptsExist]) => {
                setHasMajorsAvailable(majorsExist);
                setHasDepartmentsAvailable(deptsExist);

                if (selectedCategory === 'major' && !majorsExist && deptsExist) {
                    setSelectedCategory('dept');
                } else if (selectedCategory === 'dept' && !deptsExist && majorsExist) {
                    setSelectedCategory('major');
                } else if (!majorsExist && !deptsExist) {
                    setError("No majors or departments found for the selected combination.");
                }

            })
            .finally(() => {
                setIsLoadingAvailability(false);
            });

    }, [initialSendingId, receivingId, yearId, selectedCategory]);

    // Fetch Majors/Departments based on the *initial* sendingId from URL (or decide how to handle multiple)
    // For now, let's assume majors are fetched based on the first sending institution shown
    useEffect(() => {
        if (isLoadingAvailability || !initialSendingId || !receivingId || !yearId) {
            if (!initialSendingId || !receivingId || !yearId) {
                setError("Required institution or year information is missing in URL.");
                setIsLoadingMajors(false);
                setMajors({});
            }
            return;
        }

        if ((selectedCategory === 'major' && !hasMajorsAvailable) || (selectedCategory === 'dept' && !hasDepartmentsAvailable)) {
            setError(`No ${selectedCategory}s found for the selected combination.`);
            setIsLoadingMajors(false);
            setMajors({});
            return;
        }

        const cacheKey = `agreements-${selectedCategory}-${initialSendingId}-${receivingId}-${yearId}`;
        let cachedData = null;

        try {
            const storedData = localStorage.getItem(cacheKey);
            if (storedData) {
                cachedData = JSON.parse(storedData);
                console.log(`Loaded ${selectedCategory}s from cache:`, cacheKey);
                setMajors(cachedData);
                setIsLoadingMajors(false);
                setError(null);
                return;
            }
        } catch (e) {
            console.error(`Failed to read or parse ${selectedCategory}s cache:`, e);
            localStorage.removeItem(cacheKey);
        }

        console.log(`Fetching ${selectedCategory}s from API:`, cacheKey);
        setIsLoadingMajors(true);
        setError(null);
        setMajors({});

        const fetchCategoryData = async () => {
            try {
                const data = await fetchData(`majors?sendingId=${initialSendingId}&receivingId=${receivingId}&academicYearId=${yearId}&categoryCode=${selectedCategory}`);
                console.log(`API response for ${selectedCategory}:`, data);

                if (data && Object.keys(data).length > 0) {
                    setMajors(data);
                    setError(null);
                    try {
                        localStorage.setItem(cacheKey, JSON.stringify(data));
                        console.log(`Saved ${selectedCategory}s data to cache:`, cacheKey);
                    } catch (e) {
                        console.error(`Failed to save ${selectedCategory}s data to cache:`, e);
                    }
                } else {
                    setError(`No ${selectedCategory}s found for the selected combination.`);
                    setMajors({});
                    if (selectedCategory === 'major') setHasMajorsAvailable(false);
                    if (selectedCategory === 'dept') setHasDepartmentsAvailable(false);
                }
            } catch (err) {
                console.error(`Error fetching ${selectedCategory}s:`, err);
                setError(err.message || `An error occurred fetching ${selectedCategory}s.`);
                setMajors({});
                if (selectedCategory === 'major') setHasMajorsAvailable(false);
                if (selectedCategory === 'dept') setHasDepartmentsAvailable(false);
            } finally {
                setIsLoadingMajors(false);
            }
        };

        fetchCategoryData();

    }, [initialSendingId, receivingId, yearId, selectedCategory, isLoadingAvailability, hasMajorsAvailable, hasDepartmentsAvailable]);

    // --- MODIFIED Effect to fetch agreement details AND ALL initial images ---
    const fetchAgreementDetailsAndImages = useCallback(async () => {
        if (!selectedMajorKey || allSelectedSendingInstitutions.length === 0 || !receivingId || !yearId) {
            setAgreementData([]);
            setAllAgreementsImageFilenames([]); // Clear all images
            setImagesForActivePdf([]); // Clear active images
            return;
        }

        setIsLoadingPdf(true); // Use this state for the overall loading
        setPdfError(null);
        setAgreementData([]);
        setAllAgreementsImageFilenames([]);
        setImagesForActivePdf([]);

        let fetchedAgreements = []; // To store results from /articulation-agreements

        try {
            // 1. Fetch PDF filenames for all agreements
            const sendingIds = allSelectedSendingInstitutions.map(inst => inst.id);
            console.log("Fetching agreements list for Sending IDs:", sendingIds, selectedMajorKey);
            const response = await fetchData('/articulation-agreements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sending_ids: sendingIds, receiving_id: receivingId, year_id: yearId, major_key: selectedMajorKey })
            });

            if (!response || !Array.isArray(response.agreements)) {
                throw new Error(response?.error || "Invalid response format from /articulation-agreements");
            }

            // Map response to include names
            fetchedAgreements = response.agreements.map(agreement => {
                const sendingInst = allSelectedSendingInstitutions.find(inst => inst.id === agreement.sendingId);
                return { ...agreement, sendingName: sendingInst ? sendingInst.name : `Sending ID ${agreement.sendingId}` };
            });
            console.log("Received agreement list:", fetchedAgreements);
            setAgreementData(fetchedAgreements);
            setActiveTabIndex(0); // Set first tab active

            // 2. Fetch image filenames for ALL valid PDFs in parallel
            const imageFetchPromises = fetchedAgreements
                .filter(agreement => agreement.pdfFilename) // Only fetch for those with a filename
                .map(agreement =>
                    fetchData(`pdf-images/${encodeURIComponent(agreement.pdfFilename)}`)
                        .then(imgResponse => {
                            if (imgResponse && imgResponse.image_filenames) {
                                return { sendingId: agreement.sendingId, images: imgResponse.image_filenames };
                            } else {
                                console.warn(`No images found for ${agreement.pdfFilename}`);
                                return { sendingId: agreement.sendingId, images: [] }; // Return empty array on failure/no images
                            }
                        })
                        .catch(err => {
                            console.error(`Error fetching images for ${agreement.pdfFilename}:`, err);
                            return { sendingId: agreement.sendingId, images: [] }; // Return empty array on error
                        })
                );

            const imageResults = await Promise.allSettled(imageFetchPromises);

            const allImagesCombined = imageResults.reduce((acc, result) => {
                if (result.status === 'fulfilled' && result.value.images.length > 0) {
                    // Optionally add context comment for LLM?
                    // acc.push(`--- Images for Sending ID ${result.value.sendingId} ---`);
                    acc.push(...result.value.images);
                }
                return acc;
            }, []);

            console.log("Combined image filenames for initial analysis:", allImagesCombined);
            setAllAgreementsImageFilenames(allImagesCombined);

            // 3. Fetch images for the *initially active* PDF (tab 0) for the viewer
            const firstAgreement = fetchedAgreements[0];
            if (firstAgreement && firstAgreement.pdfFilename) {
                // Find the corresponding images from the parallel fetch results
                const firstAgreementImagesResult = imageResults.find(result => result.status === 'fulfilled' && result.value.sendingId === firstAgreement.sendingId);
                if (firstAgreementImagesResult && firstAgreementImagesResult.value.images.length > 0) {
                     setImagesForActivePdf(firstAgreementImagesResult.value.images);
                } else {
                     // Handle case where even the first PDF's images failed to load
                     setPdfError(`Failed to load images for the initial agreement: ${firstAgreement.sendingName}`);
                     setImagesForActivePdf([]);
                }
            } else if (fetchedAgreements.length > 0) {
                setPdfError(`No PDF filename found for the initial agreement: ${fetchedAgreements[0].sendingName}.`);
                setImagesForActivePdf([]);
            } else {
                setPdfError("No agreements found for the selected major and institutions.");
                setImagesForActivePdf([]);
            }

        } catch (err) {
            console.error("Error fetching agreement details and images:", err);
            setPdfError(`Failed to load agreement details: ${err.message}`);
            setAgreementData([]);
            setAllAgreementsImageFilenames([]);
            setImagesForActivePdf([]);
        } finally {
            setIsLoadingPdf(false);
        }
    }, [selectedMajorKey, allSelectedSendingInstitutions, receivingId, yearId]); // Dependencies

    // --- Effect to fetch images ONLY for the ACTIVE PDF VIEWER when tab changes ---
    const fetchImagesForActiveTab = useCallback(async () => {
        const activeAgreement = agreementData[activeTabIndex];
        if (!activeAgreement || !activeAgreement.pdfFilename) {
            setImagesForActivePdf([]); // Clear if no active agreement or filename
            if (activeAgreement) setPdfError(`No PDF available for ${activeAgreement.sendingName}.`);
            return;
        }

        // Removed the check for tab 0 here - let's always fetch on tab change for simplicity now.

        setIsLoadingPdf(true); // Show loading for tab switch
        setPdfError(null);
        setImagesForActivePdf([]); // Clear previous tab's images
        console.log("Fetching images for active tab PDF:", activeAgreement.pdfFilename);
        try {
            const response = await fetchData(`pdf-images/${encodeURIComponent(activeAgreement.pdfFilename)}`);
            if (response && response.image_filenames) {
                console.log("Received images for active tab:", response.image_filenames);
                setImagesForActivePdf(response.image_filenames);
            } else {
                throw new Error(response?.error || "No image filenames received for active tab");
            }
        } catch (err) {
            console.error(`Error fetching images for ${activeAgreement.pdfFilename}:`, err);
            setPdfError(`Failed to load images for ${activeAgreement.sendingName}: ${err.message}`);
            setImagesForActivePdf([]);
        } finally {
            setIsLoadingPdf(false);
        }
    // MODIFIED Dependencies: Only depend on data needed to identify the active agreement
    }, [activeTabIndex, agreementData]); // Dependencies

    // Trigger initial fetch when major changes
    useEffect(() => {
        fetchAgreementDetailsAndImages();
    }, [fetchAgreementDetailsAndImages]);

    // Trigger active image fetch when active tab changes
    useEffect(() => {
        // Fetch whenever the active tab index changes, but only if agreementData is loaded.
        // This prevents fetching when agreementData is initially empty.
        // Also ensures it runs for tab 0 *after* the initial data load completes.
        if (agreementData.length > 0) {
             console.log(`Tab changed to ${activeTabIndex} or agreementData loaded, fetching images for active tab.`);
             fetchImagesForActiveTab();
        } else {
             console.log("Skipping fetchImagesForActiveTab because agreementData is empty.");
        }
    // MODIFIED Dependencies: Remove imagesForActivePdf
    }, [activeTabIndex, agreementData, fetchImagesForActiveTab]);

    // --- Handlers ---
    const handleMajorSelect = (majorKey, majorName) => {
        console.log("Major selected:", majorKey, majorName);
        setSelectedMajorKey(majorKey);
        setSelectedMajorName(majorName);
        // fetchAgreementDetails will be triggered by the useEffect dependency change
    };

    const handleCategoryChange = (event) => {
        const newCategory = event.target.value;
        console.log("Category changed to:", newCategory);
        setSelectedCategory(newCategory);
        // Reset major selection when category changes
        setSelectedMajorKey(null);
        setSelectedMajorName('');
        setMajorSearchTerm(''); // Clear search term as well
        // The useEffect for fetching majors/depts will re-run due to selectedCategory change
    };

    const handleTabClick = (index) => {
        console.log("Tab clicked:", index);
        setActiveTabIndex(index);
        // Image fetch will be triggered by the useEffect dependency change
    };

    // --- Resizing Handlers (remain the same) ---
    const handleMouseMove = useCallback((e) => { // Keep useCallback, but dependencies change
        if (!isResizingRef.current || !containerRef.current) {
            return;
        }

        const containerRect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX;
        const containerLeft = containerRect.left;
        const totalWidth = containerRect.width;
        const gapWidth = 16; // Assumed 1em = 16px

        // --- Read the *current* visibility from the ref ---
        const currentVisibility = isMajorsVisibleRef.current;

        // Calculate the starting position of the chat column
        const majorsEffectiveWidth = currentVisibility ? fixedMajorsWidth : 0;
        const gap1EffectiveWidth = currentVisibility ? gapWidth : 0; // Gap between majors and chat
        const chatStartOffset = majorsEffectiveWidth + gap1EffectiveWidth;

        // Calculate desired chat width based on mouse position relative to chat start
        let newChatWidth = mouseX - containerLeft - chatStartOffset;

        // Constraints: ensure chat and PDF columns have minimum width
        const maxChatWidth = totalWidth - chatStartOffset - minColWidth - gapWidth - dividerWidth;
        newChatWidth = Math.max(minColWidth, Math.min(newChatWidth, maxChatWidth));

        setChatColumnWidth(newChatWidth);

    // --- Remove isMajorsVisible from dependencies, rely on the ref ---
    }, []); // Empty dependency array is okay now because we use the ref

    const handleMouseUp = useCallback(() => {
        if (isResizingRef.current) {
            isResizingRef.current = false;
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    }, [handleMouseMove]);

    useEffect(() => {
        const currentHandleMouseMove = handleMouseMove;
        const currentHandleMouseUp = handleMouseUp;
        return () => {
            window.removeEventListener('mousemove', currentHandleMouseMove);
            window.removeEventListener('mouseup', currentHandleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        isResizingRef.current = true;
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [handleMouseMove, handleMouseUp]);

    // --- Toggle Majors Visibility (remains the same) ---
    const toggleMajorsVisibility = () => {
        const gapWidth = 16;
        setIsMajorsVisible(prevVisible => {
            const nextVisible = !prevVisible;
            setChatColumnWidth(prevChatWidth => {
                if (nextVisible === false) { // Hiding
                    return prevChatWidth + fixedMajorsWidth + gapWidth;
                } else { // Showing
                    const newWidth = prevChatWidth - fixedMajorsWidth - gapWidth;
                    return Math.max(minColWidth, newWidth);
                }
            });
            return nextVisible;
        });
    };

    // --- Calculate Layout (remains the same) ---
    const filteredMajors = useMemo(() => {
        const lowerCaseSearchTerm = majorSearchTerm.toLowerCase();
        if (typeof majors !== 'object' || majors === null) {
            return [];
        }
        return Object.entries(majors).filter(([name]) =>
            name.toLowerCase().includes(lowerCaseSearchTerm)
        );
    }, [majors, majorSearchTerm]);

    const currentMajorsFlexBasis = isMajorsVisible ? `${fixedMajorsWidth}px` : '0px';
    const currentChatFlexBasis = `${chatColumnWidth}px`;
    const userName = user?.name || user?.email || "You";

    // Adjust height calculation - remove buttonBarHeight
    const mainContentHeight = `calc(90vh - 53px)`; // Assuming nav is 60px

    return (
        <>
            {/* --- Removed Button Bar --- */}

            {/* Main container using Flexbox */}
            <div
                ref={containerRef}
                style={{
                    display: 'flex',
                    height: mainContentHeight, // Use updated height
                    padding: '0.5em',
                    boxSizing: 'border-box',
                    color: "#333",
                    position: 'relative', // Needed for absolute positioning of usage status
                }}>

                {/* --- Usage Status Display --- */}
                {user && (usageStatus.usageLimit !== null || usageStatus.error) && (
                    <div style={{
                        position: 'absolute',
                        bottom: '10px',
                        right: '20px',
                        background: 'rgba(255, 255, 255, 0.8)',
                        padding: '5px 10px',
                        borderRadius: '4px',
                        fontSize: '0.85em',
                        color: usageStatus.error ? 'red' : '#555',
                        border: '1px solid #ccc',
                        zIndex: 10 // Ensure it's above other elements
                    }}>
                        {usageStatus.error ? (
                            <span>{usageStatus.error}</span>
                        ) : (
                            <>
                                <span>Tier: {usageStatus.tier || 'N/A'} | </span>
                                <span>Usage: {usageStatus.usageCount ?? 'N/A'} / {usageStatus.usageLimit ?? 'N/A'} | </span>
                                <span>{countdown || 'Calculating reset...'}</span>
                            </>
                        )}
                    </div>
                )}
                {/* --- End Usage Status Display --- */}


                {/* Left Column (Majors/Depts List) */}
                {isMajorsVisible && (
                    <div style={{
                        flex: `0 0 ${currentMajorsFlexBasis}`,
                        display: 'flex',
                        flexDirection: 'column',
                        minWidth: isMajorsVisible ? `${minColWidth}px` : '0px',
                        overflow: 'hidden',
                        transition: 'flex-basis 0.3s ease, min-width 0.3s ease',
                        marginRight: isMajorsVisible ? '1em' : '0',
                        position: 'relative',
                        paddingTop: '2.5em'
                    }}>
                        {/* --- Hide Majors Button (Stays Here) --- */}
                        <button
                            onClick={toggleMajorsVisibility}
                            style={{
                                position: 'absolute',
                                top: '0.5em',
                                left: '0.5em',
                                zIndex: 1,
                                padding: '4px 8px',
                                fontSize: '0.85em'
                            }}
                            className="btn btn-sm btn-outline-secondary"
                        >
                            Hide Majors
                        </button>
                        {/* --- End Hide Majors Button --- */}

                        {/* Content of Majors/Depts Column */}
                        <h2 style={{ marginTop: '0', marginBottom: '0.5em', whiteSpace: 'nowrap' }}>
                            Select {selectedCategory === 'major' ? 'Major' : 'Department'}
                        </h2>
                        {/* ... rest of majors column content ... */}
                         <div style={{ marginBottom: '0.5em', display: 'flex', justifyContent: 'center', gap: '1em' }}>
                            {isLoadingAvailability ? ( <p>Checking availability...</p> ) : (
                                <>
                                    <label style={{ opacity: hasMajorsAvailable ? 1 : 0.5, cursor: hasMajorsAvailable ? 'pointer' : 'not-allowed' }}>
                                        <input type="radio" name="category" value="major" checked={selectedCategory === 'major'} onChange={handleCategoryChange} disabled={!hasMajorsAvailable} /> Majors
                                    </label>
                                    <label style={{ opacity: hasDepartmentsAvailable ? 1 : 0.5, cursor: hasDepartmentsAvailable ? 'pointer' : 'not-allowed' }}>
                                        <input type="radio" name="category" value="dept" checked={selectedCategory === 'dept'} onChange={handleCategoryChange} disabled={!hasDepartmentsAvailable} /> Departments
                                    </label>
                                </>
                            )}
                        </div>
                        <input type="text" placeholder={`Search ${selectedCategory === 'major' ? 'majors' : 'departments'}...`} value={majorSearchTerm} onChange={(e) => setMajorSearchTerm(e.target.value)} style={{ marginBottom: '0.5em', padding: '8px', border: '1px solid #ccc' }} />
                        {error && <div style={{ color: 'red', marginBottom: '1em' }}>Error: {error}</div>}
                        {isLoadingMajors && <p>Loading available {selectedCategory === 'major' ? 'majors' : 'departments'}...</p>}
                        {!isLoadingMajors && filteredMajors.length > 0 && (
                            <div style={{ flex: '1 1 auto', overflowY: 'auto', border: '1px solid #ccc' }}>
                                {filteredMajors.map(([name, key]) => ( <div key={key} onClick={() => handleMajorSelect(key, name)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #eee', backgroundColor: selectedMajorKey === key ? '#e0e0e0' : 'transparent', fontWeight: selectedMajorKey === key ? 'bold' : 'normal' }} className="major-list-item"> {name} {selectedMajorKey === key && isLoadingPdf && <span style={{ marginLeft: '10px', fontStyle: 'italic' }}>(Loading...)</span>} </div> ))}
                            </div>
                        )}
                        {!isLoadingMajors && filteredMajors.length === 0 && Object.keys(majors).length > 0 && ( <p style={{ marginTop: '1em' }}>No {selectedCategory === 'major' ? 'majors' : 'departments'} match your search.</p> )}
                        {!isLoadingMajors && Object.keys(majors).length === 0 && !error && ( <p>No {selectedCategory === 'major' ? 'majors' : 'departments'} found.</p> )}
                        {!isLoadingMajors && !isLoadingAvailability && !hasMajorsAvailable && !hasDepartmentsAvailable && ( <p>No majors or departments found for this combination.</p> )}
                    </div>
                )}

                {/* Middle Column (Chat Interface) */}
                <div style={{ flex: `0 0 ${currentChatFlexBasis}`, display: 'flex', flexDirection: 'column', minWidth: `${minColWidth}px` }}>
                    {/* Pass visibility state and toggle function */}
                    <ChatInterface
                        imageFilenames={allAgreementsImageFilenames} // Pass the combined list
                        selectedMajorName={selectedMajorName}
                        userName={userName}
                        isMajorsVisible={isMajorsVisible}
                        toggleMajorsVisibility={toggleMajorsVisibility}
                        sendingInstitutionId={currentSendingId}
                        allSendingInstitutionIds={allSelectedSendingInstitutions.map(inst => inst.id)}
                        receivingInstitutionId={receivingId}
                        academicYearId={yearId}
                        user={user}
                    />
                </div>

                {/* Draggable Divider */}
                <div ref={dividerRef} style={{ width: `${dividerWidth}px`, cursor: 'col-resize', backgroundColor: '#e0e0e0', borderLeft: '1px solid #ccc', borderRight: '1px solid #ccc', alignSelf: 'stretch', flexShrink: 0, marginLeft: isMajorsVisible ? '1em' : '0' }} onMouseDown={handleMouseDown} />

                {/* Right Column (PDF Viewer) */}
                <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minWidth: `${minColWidth}px`, marginLeft: '1em' }}>
                    {/* --- PDF Tabs --- */}
                    {agreementData.length > 1 && (
                        <div style={{ display: 'flex', borderBottom: '1px solid #ccc', flexShrink: 0, background: '#e9ecef' /* Light grey background for the tab bar */ }}>
                            {agreementData.map((agreement, index) => (
                                <button
                                    key={agreement.sendingId}
                                    onClick={() => handleTabClick(index)}
                                    style={{
                                        padding: '10px 15px',
                                        border: 'none', // Remove default border
                                        borderBottom: activeTabIndex === index ? '3px solid #0056b3' : '3px solid transparent', // Stronger blue for active border
                                        background: activeTabIndex === index ? '#ffffff' : '#e9ecef', // White background for active, match bar background for inactive
                                        color: activeTabIndex === index ? '#0056b3' : '#495057', // Darker text for inactive, blue for active
                                        cursor: 'pointer',
                                        fontWeight: activeTabIndex === index ? 'bold' : 'normal',
                                        fontSize: '0.95em', // Slightly larger font
                                        textAlign: 'center',
                                        // Add subtle top/side borders for inactive tabs for definition
                                        borderTop: activeTabIndex !== index ? '1px solid #dee2e6' : 'none',
                                        borderLeft: activeTabIndex !== index ? '1px solid #dee2e6' : 'none',
                                        borderRight: activeTabIndex !== index ? '1px solid #dee2e6' : 'none',
                                        borderTopLeftRadius: '4px', // Slightly rounded top corners
                                        borderTopRightRadius: '4px',
                                        marginRight: '2px', // Small gap between tabs
                                    }}
                                    title={`View agreement from ${agreement.sendingName}`}
                                >
                                    {agreement.sendingName}
                                </button>
                            ))}
                        </div>
                    )}
                    {/* --- End PDF Tabs --- */}

                    {/* Pass data for the ACTIVE PDF */}
                    <PdfViewer
                        imageFilenames={imagesForActivePdf} // Use state for active PDF's images
                        isLoading={isLoadingPdf && agreementData[activeTabIndex]?.pdfFilename === currentPdfFilename} // Only show loading for the active tab's fetch
                        error={pdfError} // Show general PDF error
                        filename={currentPdfFilename} // Pass the active filename
                    />
                </div>
            </div>
        </>
    );
}

export default AgreementViewerPage;