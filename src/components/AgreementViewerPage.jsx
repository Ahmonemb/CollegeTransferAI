import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
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

    // --- MODIFIED State for Multiple PDFs/Tabs ---
    const [agreementData, setAgreementData] = useState([]);
    // START WITH IGETC TAB ACTIVE
    const [activeTabIndex, setActiveTabIndex] = useState(-1); // Index for agreements, -1 for IGETC
    const [imagesForActivePdf, setImagesForActivePdf] = useState([]);
    const [allAgreementsImageFilenames, setAllAgreementsImageFilenames] = useState([]);

    // --- NEW State for IGETC ---
    const [igetcPdfFilename, setIgetcPdfFilename] = useState(null);
    const [isLoadingIgetc, setIsLoadingIgetc] = useState(false);
    const [igetcImageFilenames, setIgetcImageFilenames] = useState([]); // <-- ADDED: State for IGETC images
    // --- End IGETC State ---

    // --- State for User Usage Status ---
    const [usageStatus, setUsageStatus] = useState({
        usageCount: null,
        usageLimit: null,
        resetTime: null,
        tier: userTier || null, // Initialize tier from prop
        error: null,
    });
    const [countdown, setCountdown] = useState('');
    // --- End Usage Status State ---

    // --- Derived state for the currently active agreement/view ---
    const isIgetcActive = activeTabIndex === -1;
    const currentAgreement = !isIgetcActive ? (agreementData[activeTabIndex] || null) : null;
    // Use the *first* sending institution for IGETC context, or the current agreement's
    const contextSendingId = isIgetcActive ? (allSelectedSendingInstitutions[0]?.id || initialSendingId) : (currentAgreement?.sendingId || initialSendingId);
    const currentPdfFilename = isIgetcActive ? igetcPdfFilename : (currentAgreement?.pdfFilename || null);

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
    }, [usageStatus.resetTime, agreementData, isLoadingPdf, isIgetcActive]); // Added isIgetcActive

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

    // --- MODIFIED Effect to fetch agreement details AND initial images ---
    const fetchAgreementDetailsAndImages = useCallback(async () => {
        // REMOVED: setIgetcPdfFilename(null); // Keep IGETC data persistent
        // REMOVED: if (isIgetcActive) setActiveTabIndex(0); // Don't switch here

        if (!selectedMajorKey || allSelectedSendingInstitutions.length === 0 || !receivingId || !yearId) {
            // Clear only agreement-specific data if no major is selected
            setAgreementData([]);
            setAllAgreementsImageFilenames([]);
            // Don't clear imagesForActivePdf if IGETC might be active
            if (!isIgetcActive) {
                setImagesForActivePdf([]);
            }
            return;
        }

        setIsLoadingPdf(true);
        setPdfError(null);
        setAgreementData([]); // Clear previous agreements
        setAllAgreementsImageFilenames([]);
        // Don't clear imagesForActivePdf yet, wait until fetch completes or fails

        let fetchedAgreements = [];

        try {
            const sendingIds = allSelectedSendingInstitutions.map(inst => inst.id);
            console.log("Fetching agreements list for Sending IDs:", sendingIds, selectedMajorKey);
            // Assuming the API endpoint takes sendingIds, receivingId, yearId, majorKey
            const response = await fetchData('/articulation-agreements', {
                method: 'POST', // Or GET with query params, adjust as needed
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sendingInstitutionIds: sendingIds,
                    receivingInstitutionId: receivingId,
                    academicYearId: yearId,
                    majorKey: selectedMajorKey,
                    categoryCode: selectedCategory // Pass category if needed by backend
                })
            });

            if (!response || !Array.isArray(response.agreements)) {
                throw new Error(response?.error || 'Invalid response format for agreements');
            }

            // Map response agreements and add sending institution names
            fetchedAgreements = response.agreements.map(agreement => {
                const sendingInst = allSelectedSendingInstitutions.find(inst => inst.id === agreement.sendingId);
                return {
                    ...agreement, // Spread existing agreement properties (like pdfFilename, sendingId)
                    sendingName: sendingInst ? sendingInst.name : 'Unknown Sending Institution'
                };
            });
            setAgreementData(fetchedAgreements); // Set the fetched agreements

            // --- Fetch all images in parallel ---
            // Filter out agreements without a pdfFilename before attempting to fetch images
            const agreementsWithPdfs = fetchedAgreements.filter(agreement => agreement.pdfFilename);
            const imageFetchPromises = agreementsWithPdfs.map(agreement =>
                fetchData(`pdf-images/${encodeURIComponent(agreement.pdfFilename)}`)
                    .then(imageResponse => ({
                        sendingId: agreement.sendingId, // Keep track of which agreement these images belong to
                        images: imageResponse?.image_filenames || [],
                        error: imageResponse?.error
                    }))
                    .catch(err => ({ // Catch fetch errors for individual image sets
                        sendingId: agreement.sendingId,
                        images: [],
                        error: `Failed to fetch images for ${agreement.sendingName}: ${err.message}`
                    }))
            );
            const imageResults = await Promise.allSettled(imageFetchPromises);
            const allImagesCombined = imageResults.reduce(/* ... */); // Existing logic
            setAllAgreementsImageFilenames(allImagesCombined);

            // --- Set images for the first agreement tab (index 0) ---
            const firstAgreement = fetchedAgreements[0];
            let firstAgreementImages = [];
            if (firstAgreement && firstAgreement.pdfFilename) {
                const firstAgreementImagesResult = imageResults.find(/* ... */); // Existing logic to find images for first agreement
                if (firstAgreementImagesResult && firstAgreementImagesResult.value.images.length > 0) {
                    firstAgreementImages = firstAgreementImagesResult.value.images;
                } else {
                    console.warn(`No images loaded for the first agreement: ${firstAgreement.sendingName}`);
                }
            }

            // --- NOW switch to the first agreement tab and set its images ---
            setActiveTabIndex(0);
            setImagesForActivePdf(firstAgreementImages);
            if (firstAgreementImages.length === 0 && firstAgreement) {
                 setPdfError(`No PDF or images found for ${firstAgreement.sendingName}.`);
            } else if (!firstAgreement) {
                 setPdfError("No agreements found for the selected major.");
            }


        } catch (err) {
            console.error("Error fetching agreement details and images:", err);
            setPdfError(`Failed to load agreement details: ${err.message}`);
            setAgreementData([]);
            setAllAgreementsImageFilenames([]);
            setImagesForActivePdf([]);
            // Optionally switch back to IGETC or show an error state?
            // setActiveTabIndex(-1); // Or keep it on the (now empty) agreement tab?
        } finally {
            setIsLoadingPdf(false);
        }

    }, [selectedMajorKey, allSelectedSendingInstitutions, receivingId, yearId, selectedCategory, isIgetcActive]); // Added missing dependencies

    // --- MODIFIED Effect to fetch images for the ACTIVE PDF VIEWER (Agreement Tab) ---
    const fetchImagesForActiveAgreementTab = useCallback(async () => {
        if (isIgetcActive) return; // Don't run if IGETC is active

        const activeAgreement = agreementData[activeTabIndex];
        if (!activeAgreement || !activeAgreement.pdfFilename) {
            setImagesForActivePdf([]);
            if (activeAgreement) setPdfError(`No PDF available for ${activeAgreement.sendingName}.`);
            return;
        }
        // ... (rest of the existing logic inside this function remains the same) ...
        // Set loading, clear error/images, fetch images, handle response/error, set loading false.
        setIsLoadingPdf(true);
        setPdfError(null);
        setImagesForActivePdf([]);
        console.log("Fetching images for active agreement tab PDF:", activeAgreement.pdfFilename);
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

    }, [activeTabIndex, agreementData, isIgetcActive]); // Added isIgetcActive

    // --- NEW Effect to fetch IGETC agreement and images ---
    const fetchIgetcAgreementAndImages = useCallback(async () => {
        if (!isIgetcActive) return; // Only run if IGETC tab is active

        // Use the first sending institution ID for IGETC
        const igetcSendingId = allSelectedSendingInstitutions[0]?.id;
        if (!igetcSendingId || !yearId) {
            setPdfError("Missing sending institution or year ID for IGETC.");
            setImagesForActivePdf([]);
            setIgetcPdfFilename(null);
            return;
        }

        // Reset IGETC specific states
        setIgetcPdfFilename(null);
        setIgetcImageFilenames([]); // <-- Reset IGETC image state
        // Also reset active images if IGETC is active
        if (isIgetcActive) {
            setImagesForActivePdf([]);
        }

        setIsLoadingIgetc(true); // Use separate loading state for IGETC fetch
        setIsLoadingPdf(true); // Also set general PDF loading true
        setPdfError(null);

        try {
            // 1. Fetch IGETC PDF filename
            console.log(`Fetching IGETC agreement for Sending ID: ${igetcSendingId}, Year ID: ${yearId}`);
            const igetcResponse = await fetchData(`/igetc-agreement?sendingId=${igetcSendingId}&academicYearId=${yearId}`);

            if (!igetcResponse || !igetcResponse.pdfFilename) {
                throw new Error(igetcResponse?.error || "Failed to get IGETC PDF filename.");
            }
            const filename = igetcResponse.pdfFilename;
            setIgetcPdfFilename(filename);
            console.log("Received IGETC PDF filename:", filename);

            // 2. Fetch images for the IGETC PDF
            console.log("Fetching images for IGETC PDF:", filename);
            const imageResponse = await fetchData(`pdf-images/${encodeURIComponent(filename)}`);
            if (imageResponse && imageResponse.image_filenames) {
                console.log("Received images for IGETC tab:", imageResponse.image_filenames);
                setIgetcImageFilenames(imageResponse.image_filenames); // <-- SET IGETC image state
                // If IGETC is the currently active tab, also update imagesForActivePdf
                if (isIgetcActive) {
                    setImagesForActivePdf(imageResponse.image_filenames);
                }
            } else {
                throw new Error(imageResponse?.error || "No image filenames received for IGETC tab");
            }

        } catch (err) {
            console.error("Error fetching IGETC agreement/images:", err);
            setPdfError(`Failed to load IGETC details: ${err.message}`);
            setIgetcImageFilenames([]); // <-- Clear on error
            setIgetcPdfFilename(null);
            if (isIgetcActive) {
                setImagesForActivePdf([]); // Clear active images on error if IGETC is active
            }
        } finally {
            setIsLoadingIgetc(false);
            // Only set general loading false if IGETC is the active view being loaded
            if (isIgetcActive) {
                setIsLoadingPdf(false);
            }
        }
    }, [isIgetcActive, allSelectedSendingInstitutions, yearId]); // Dependencies

    // Trigger initial fetch when major changes
    useEffect(() => {
        fetchAgreementDetailsAndImages();
    }, [fetchAgreementDetailsAndImages]);

    // Trigger active image/data fetch when active tab changes OR agreement data loads
    useEffect(() => {
        if (isIgetcActive) {
            // Fetch IGETC data if IGETC tab is active
            console.log("IGETC tab active, fetching IGETC data...");
            fetchIgetcAgreementAndImages();
        } else if (activeTabIndex >= 0 && agreementData.length > 0) {
            // Fetch agreement images ONLY if an agreement tab is active AND agreementData has been loaded
            console.log(`Agreement tab ${activeTabIndex} active, fetching images...`);
            fetchImagesForActiveAgreementTab();
        } else if (activeTabIndex >= 0 && agreementData.length === 0 && selectedMajorKey) {
             console.log(`Agreement tab ${activeTabIndex} active, but agreement data not yet loaded. Waiting...`);
        } else {
            console.log("Skipping active tab fetch: Conditions not met (e.g., no major selected for agreement tabs, or initial state before IGETC fetch).");
        }
    // Ensure all necessary functions and state variables are included
    }, [activeTabIndex, agreementData, isIgetcActive, selectedMajorKey, fetchIgetcAgreementAndImages, fetchImagesForActiveAgreementTab]); // Keep dependencies

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

    // MODIFIED Tab Click Handler
    const handleTabClick = (index) => {
        console.log("Tab clicked:", index);
        setActiveTabIndex(index); // index will be -1 for IGETC
        // Image/Data fetch will be triggered by the useEffect dependency change on activeTabIndex
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

    // Combine all available image filenames for the chat context
    const allContextImageFilenames = useMemo(() => {
        // Use a Set to automatically handle duplicates if any filename appears in both lists
        const combined = new Set([
            ...allAgreementsImageFilenames, // Images from all major agreements
            ...igetcImageFilenames       // Images from IGETC agreement
        ]);
        return Array.from(combined); // Convert back to an array
    }, [allAgreementsImageFilenames, igetcImageFilenames]); // Dependencies

    // Determine images for chat context (This might be redundant now, review usage)
    // const chatContextImages = isIgetcActive ? imagesForActivePdf : allAgreementsImageFilenames; // OLD
    const chatContextMajorName = isIgetcActive ? "IGETC Requirements" : selectedMajorName;

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
                {!isIgetcActive && isMajorsVisible && (
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
                 {/* Show Majors Button (only if majors column is hidden AND IGETC is NOT active) */}
                 {!isMajorsVisible && !isIgetcActive && (
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
                        Show Majors
                    </button>
                 )}

                {/* Middle Column (Chat Interface) */}
                <div style={{
                     flex: `0 0 ${(!isIgetcActive && isMajorsVisible) ? currentChatFlexBasis : (isIgetcActive ? '400px' : `calc(${currentChatFlexBasis} + ${fixedMajorsWidth}px + 1em)`) }`, // Adjust width calculation
                     display: 'flex',
                     flexDirection: 'column',
                     minWidth: `${minColWidth}px`,
                     marginRight: (!isIgetcActive && isMajorsVisible) ? '0' : '1em' // Add margin if majors are hidden or IGETC active
                 }}>
                    <ChatInterface
                        // Pass the COMBINED list for the payload
                        allContextImageFilenames={allContextImageFilenames} // <-- NEW PROP

                        // Keep these if needed for the initial prompt logic specifically
                        imageFilenames={imagesForActivePdf} // Active images for display/context hints?
                        allAgreementsImageFilenames={allAgreementsImageFilenames} // Major agreement images

                        selectedMajorName={chatContextMajorName} // Pass appropriate name
                        userName={userName}
                        isMajorsVisible={!isIgetcActive && isMajorsVisible} // Only relevant if not IGETC
                        toggleMajorsVisibility={toggleMajorsVisibility}
                        sendingInstitutionId={contextSendingId} // Pass context-aware ID
                        allSendingInstitutionIds={allSelectedSendingInstitutions.map(inst => inst.id)}
                        receivingInstitutionId={receivingId}
                        academicYearId={yearId}
                        user={user}
                        // isIgetcMode={isIgetcActive} // Pass flag if needed by ChatInterface display logic
                    />
                </div>

                {/* Draggable Divider (Conditionally render or adjust margin) */}
                {!isIgetcActive && isMajorsVisible && (
                    <div ref={dividerRef} style={{ width: `${dividerWidth}px`, cursor: 'col-resize', backgroundColor: '#e0e0e0', borderLeft: '1px solid #ccc', borderRight: '1px solid #ccc', alignSelf: 'stretch', flexShrink: 0, marginLeft: isMajorsVisible ? '1em' : '0' }} onMouseDown={handleMouseDown} />
                )}

                {/* Right Column (PDF Viewer) */}
                <div style={{
                    flex: '1 1 0',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: `${minColWidth}px`,
                    marginLeft: (!isIgetcActive && isMajorsVisible) ? '1em' : '0' // Adjust margin
                 }}>
                    {/* --- PDF Tabs --- */}
                    <div style={{ display: 'flex', borderBottom: '1px solid #ccc', flexShrink: 0, background: '#e9ecef' }}>
                        {/* IGETC Tab */}
                        <button
                            key="igetc-tab"
                            onClick={() => handleTabClick(-1)} // Use -1 index
                            style={{
                                // ... (copy styling from agreement tabs) ...
                                padding: '10px 15px', border: 'none',
                                borderBottom: isIgetcActive ? '3px solid #0056b3' : '3px solid transparent',
                                background: isIgetcActive ? '#ffffff' : '#e9ecef',
                                color: isIgetcActive ? '#0056b3' : '#495057',
                                cursor: 'pointer', fontWeight: isIgetcActive ? 'bold' : 'normal',
                                fontSize: '0.95em', textAlign: 'center',
                                borderTop: !isIgetcActive ? '1px solid #dee2e6' : 'none',
                                borderLeft: !isIgetcActive ? '1px solid #dee2e6' : 'none',
                                borderRight: !isIgetcActive ? '1px solid #dee2e6' : 'none',
                                borderTopLeftRadius: '4px', borderTopRightRadius: '4px',
                                marginRight: '2px',
                            }}
                            title="View IGETC Requirements"
                        >
                            IGETC {isLoadingIgetc && <span style={{ marginLeft: '5px', fontStyle: 'italic' }}>(Loading...)</span>}
                        </button>

                        {/* Agreement Tabs (only if agreements exist) */}
                        {agreementData.map((agreement, index) => (
                            <button
                                key={agreement.sendingId}
                                onClick={() => handleTabClick(index)}
                                style={{
                                    // ... (existing styling) ...
                                    padding: '10px 15px', border: 'none',
                                    borderBottom: activeTabIndex === index ? '3px solid #0056b3' : '3px solid transparent',
                                    background: activeTabIndex === index ? '#ffffff' : '#e9ecef',
                                    color: activeTabIndex === index ? '#0056b3' : '#495057',
                                    cursor: 'pointer', fontWeight: activeTabIndex === index ? 'bold' : 'normal',
                                    fontSize: '0.95em', textAlign: 'center',
                                    borderTop: activeTabIndex !== index ? '1px solid #dee2e6' : 'none',
                                    borderLeft: activeTabIndex !== index ? '1px solid #dee2e6' : 'none',
                                    borderRight: activeTabIndex !== index ? '1px solid #dee2e6' : 'none',
                                    borderTopLeftRadius: '4px', borderTopRightRadius: '4px',
                                    marginRight: '2px',
                                }}
                                title={`View agreement from ${agreement.sendingName}`}
                            >
                                {agreement.sendingName}
                            </button>
                        ))}
                    </div>
                    {/* --- End PDF Tabs --- */}

                    {/* PDF Viewer */}
                    <PdfViewer
                        imageFilenames={imagesForActivePdf}
                        isLoading={isLoadingPdf} // Use general loading state
                        error={pdfError}
                        filename={currentPdfFilename} // Pass the active/IGETC filename
                    />
                </div>
            </div>
        </>
    );
}

export default AgreementViewerPage;