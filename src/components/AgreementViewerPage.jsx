import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
// Import useNavigate and remove Link if no longer needed
import { useParams, useNavigate } from 'react-router-dom'; 
import { fetchData } from '../services/api';
import PdfViewer from './PdfViewer';
import ChatInterface from './ChatInterface';
import '../App.css';

// Define minColWidth and dividerWidth as constants outside the component
const minColWidth = 150;
const dividerWidth = 1;
const fixedMajorsWidth = 300; // Revert to fixed width for majors

function AgreementViewerPage() {
    const { sendingId, receivingId, yearId } = useParams();
    const navigate = useNavigate(); // Get navigate function

    // --- State for resizing ---
    // Only need state for the chat column width now
    const [chatColumnWidth, setChatColumnWidth] = useState(400);
    const isResizingRef = useRef(false);
    // Only need one divider ref now
    const dividerRef = useRef(null); // Ref for the divider between Chat and PDF
    const containerRef = useRef(null); // Ref for the main container

    // --- State for Majors Column Visibility ---
    const [isMajorsVisible, setIsMajorsVisible] = useState(true);
    // --- Ref to hold the latest visibility state for the event listener ---
    const isMajorsVisibleRef = useRef(isMajorsVisible);

    // --- Effect to update the ref whenever the state changes ---
    useEffect(() => {
        isMajorsVisibleRef.current = isMajorsVisible;
    }, [isMajorsVisible]);

    // --- Existing State ---
    const [majors, setMajors] = useState({});
    const [isLoadingMajors, setIsLoadingMajors] = useState(true);
    const [error, setError] = useState(null);
    const [pdfError, setPdfError] = useState(null);
    const [selectedMajorKey, setSelectedMajorKey] = useState(null);
    const [selectedMajorName, setSelectedMajorName] = useState('');
    const [selectedPdfFilename, setSelectedPdfFilename] = useState(null);
    const [imageFilenames, setImageFilenames] = useState([]);
    const [isLoadingPdf, setIsLoadingPdf] = useState(false);
    const [majorSearchTerm, setMajorSearchTerm] = useState('');

    // --- Effect for Fetching Majors (with Caching) ---
    useEffect(() => {
        if (!sendingId || !receivingId || !yearId) {
            setError("Required institution or year information is missing in URL.");
            setIsLoadingMajors(false);
            return;
        }

        // Generate a unique cache key for this combination (initially for major)
        const cacheKey = `majors-${sendingId}-${receivingId}-${yearId}`;
        let cachedMajors = null;

        // 1. Try loading from localStorage
        try {
            const cachedData = localStorage.getItem(cacheKey);
            if (cachedData) {
                cachedMajors = JSON.parse(cachedData);
                console.log("Loaded majors from cache:", cacheKey);
                setMajors(cachedMajors);
                setIsLoadingMajors(false);
                setError(null);
                return; // Exit early if loaded from cache
            }
        } catch (e) {
            console.error("Failed to read or parse majors cache:", e);
            localStorage.removeItem(cacheKey); // Clear potentially corrupted cache entry
        }

        // 2. Fetch from API (try 'major' first)
        console.log("Fetching majors (category: major) from API:", cacheKey);
        setIsLoadingMajors(true);
        setError(null);

        const fetchMajors = async (category) => {
            try {
                const data = await fetchData(`majors?sendingInstitutionId=${sendingId}&receivingInstitutionId=${receivingId}&academicYearId=${yearId}&categoryCode=${category}`);
                return data; // Return the fetched data
            } catch (err) {
                console.error(`Error fetching majors (category: ${category}):`, err);
                // Throw the error to be caught by the main catch block
                throw new Error(`Failed to load majors (category: ${category}): ${err.message}`);
            }
        };

        fetchMajors('major')
            .then(majorData => {
                console.log("Initial fetch (major) returned:", majorData); // Add for debugging
                // Check if the first fetch returned null, undefined, OR an empty object
                if (majorData === null || typeof majorData === 'undefined' || (typeof majorData === 'object' && Object.keys(majorData).length === 0)) {
                    console.log("Major data was null, undefined, or empty object. Trying category: dept");
                    // Retry with 'dept'
                    return fetchMajors('dept'); // Return the promise for the second fetch
                } else {
                    // First fetch was successful and has data, return its data
                    console.log("Using data from 'major' category.");
                    return majorData;
                }
            })
            .then(finalData => {
                // *** ADD LOG HERE ***
                console.log("Processing finalData (from major or dept):", finalData);

                if (finalData && Object.keys(finalData).length === 0) {
                    console.log("Setting error: No majors or departments found..."); // Log before setting error
                    setError("No majors or departments found for the selected combination.");
                    setMajors({});
                } else if (finalData) {
                    console.log("Setting majors data:", finalData); // Log before setting state
                    setMajors(finalData);
                    setError(null); // Clear any previous error if data is found
                    // Cache the successful result (regardless of which category worked)
                    try {
                        localStorage.setItem(cacheKey, JSON.stringify(finalData));
                        console.log("Saved final majors/depts data to cache:", cacheKey);
                    } catch (e) {
                        console.error("Failed to save final majors/depts data to cache:", e);
                    }
                } else {
                    console.log("Setting error: Received unexpected empty response."); // Log before setting error
                    setError("Received unexpected empty response when fetching majors/departments.");
                    setMajors({});
                }
            })
            .catch(err => {
                // *** ADD LOG HERE ***
                console.error("Caught error in majors fetch chain:", err);
                setError(err.message || "An error occurred fetching majors/departments.");
                setMajors({});
            })
            .finally(() => {
                // *** ADD LOG HERE ***
                console.log("Majors fetch chain finally block executing.");
                setIsLoadingMajors(false);
            });

    }, [sendingId, receivingId, yearId]); // Re-run effect if IDs change

    // Fetch PDF filename AND image filenames when major is selected
    const handleMajorSelect = async (majorKey, majorName) => {
        if (!majorKey || isLoadingPdf) return;

        setSelectedMajorKey(majorKey);
        setSelectedMajorName(majorName); // Store name
        setSelectedPdfFilename(null); // Clear previous PDF filename
        setImageFilenames([]); // Clear previous images
        setIsLoadingPdf(true);
        setError(null); // Clear general errors
        setPdfError(null); // Clear specific PDF errors

        try {
            // 1. Get PDF Filename
            const agreementData = await fetchData(`articulation-agreement?key=${majorKey}`);
            if (agreementData && agreementData.pdf_filename) {
                const pdfFilename = agreementData.pdf_filename;
                setSelectedPdfFilename(pdfFilename); // Set filename for context

                // --- Image Caching Logic ---
                const imageCacheKey = `pdf-images-${pdfFilename}`;
                let fetchedFromCache = false;

                // 2a. Try loading images from localStorage
                try {
                    const cachedImageData = localStorage.getItem(imageCacheKey);
                    if (cachedImageData) {
                        const parsedImageData = JSON.parse(cachedImageData);
                        if (parsedImageData && parsedImageData.image_filenames) {
                            console.log("Loaded images from cache:", imageCacheKey);
                            setImageFilenames(parsedImageData.image_filenames);
                            fetchedFromCache = true; // Mark as fetched from cache
                        } else {
                             console.warn("Cached image data invalid, removing:", imageCacheKey);
                             localStorage.removeItem(imageCacheKey);
                        }
                    }
                } catch (e) {
                    console.error("Failed to read or parse images cache:", e);
                    localStorage.removeItem(imageCacheKey); // Clear potentially corrupted cache entry
                }
                // --- End Image Caching Logic ---

                // 2b. Fetch images from API if not loaded from cache
                if (!fetchedFromCache) {
                    console.log("Fetching images from API:", imageCacheKey);
                    const imageData = await fetchData(`pdf-images/${pdfFilename}`);
                    if (imageData && imageData.image_filenames) {
                        setImageFilenames(imageData.image_filenames);
                        // 3. Save successful image fetch to localStorage
                        try {
                            localStorage.setItem(imageCacheKey, JSON.stringify(imageData));
                            console.log("Saved images to cache:", imageCacheKey);
                        } catch (e) {
                            console.error("Failed to save images to cache:", e);
                        }
                    } else {
                        // Handle case where API returns error or no filenames
                        throw new Error(imageData?.error || 'Failed to load image list for PDF');
                    }
                }
            } else if (agreementData && agreementData.error) {
                throw new Error(`Agreement Error: ${agreementData.error}`);
            } else {
                throw new Error('Received unexpected data or no PDF filename when fetching agreement.');
            }
        } catch (err) {
            console.error("Error fetching agreement or images:", err);
            setPdfError(err.message); // Set specific PDF error
            setSelectedPdfFilename(null); // Clear filename on error
            setImageFilenames([]); // Clear images on error
        } finally {
            setIsLoadingPdf(false); // Done loading PDF info + images
        }
    };

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
            // Remove the *same* handleMouseMove function instance
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    // Ensure handleMouseMove is included if it's used inside, though it's stable now
    }, [handleMouseMove]);

    // Filter majors based on search term
    const filteredMajors = useMemo(() => {
        const lowerCaseSearchTerm = majorSearchTerm.toLowerCase();
        // Ensure majors is an object before trying to get entries
        if (typeof majors !== 'object' || majors === null) {
            return [];
        }
        return Object.entries(majors).filter(([name]) =>
            name.toLowerCase().includes(lowerCaseSearchTerm)
        );
    }, [majors, majorSearchTerm]);

    // --- Resizing Logic (Simplified for one divider) ---
    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        isResizingRef.current = true;
        // Add the *same* memoized handleMouseMove function as the listener
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [handleMouseMove, handleMouseUp]); // handleMouseMove is stable now, so no need to list it if it doesn't change

    

    

    // Cleanup listeners
    useEffect(() => {
        // Define cleanup using the memoized handleMouseMove
        const currentHandleMouseMove = handleMouseMove;
        const currentHandleMouseUp = handleMouseUp;
        return () => {
            window.removeEventListener('mousemove', currentHandleMouseMove);
            window.removeEventListener('mouseup', currentHandleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]); // Depend on the memoized functions

    // --- Toggle Majors Visibility ---
    const toggleMajorsVisibility = () => {
        const gapWidth = 16; // Ensure this matches the gap used in styles/calculations

        // Use the functional update form to get the latest states
        setIsMajorsVisible(prevVisible => {
            const nextVisible = !prevVisible;

            // Adjust chat width based on the *change* in visibility
            setChatColumnWidth(prevChatWidth => {
                if (nextVisible === false) { // Majors are being hidden
                    // Increase chat width to absorb the space
                    return prevChatWidth + fixedMajorsWidth + gapWidth;
                } else { // Majors are being shown
                    // Decrease chat width, ensuring it doesn't go below min width
                    const newWidth = prevChatWidth - fixedMajorsWidth - gapWidth;
                    return Math.max(minColWidth, newWidth);
                }
            });

            return nextVisible; // Return the new visibility state
        });
    };


    // Calculate effective widths for flex styling based on visibility
    const currentMajorsFlexBasis = isMajorsVisible ? `${fixedMajorsWidth}px` : '0px';
    const currentChatFlexBasis = `${chatColumnWidth}px`;

    return (
        <>
            {/* Button Bar */}
            <div style={{ padding: '0.5em 1em', borderBottom: '1px solid #ccc', backgroundColor: '#f8f8f8', display: 'flex', alignItems: 'center' }}>
                <button onClick={toggleMajorsVisibility} style={{ marginRight: '2em' }}>
                    {isMajorsVisible ? 'Hide Majors' : 'Show Majors'}
                </button>
                 {/* Replace Link with button and onClick */}
                 <button 
                    onClick={() => navigate('/')} 
                    className="btn btn-secondary" 
                 >
                    Back to Form
                 </button>
            </div>

            {/* Main container using Flexbox */}
            <div
                ref={containerRef}
                style={{
                    display: 'flex',
                    height: 'calc(91vh - 40px)', // Adjust based on button bar height
                    padding: '0.5em',
                    boxSizing: 'border-box',
                    color: "#333",
                }}>

                {/* Left Column (Majors List) - Conditionally Rendered, Fixed Width */}
                {isMajorsVisible && (
                    <div style={{
                        flex: `0 0 ${currentMajorsFlexBasis}`, // Fixed basis when visible
                        display: 'flex',
                        flexDirection: 'column',
                        minWidth: isMajorsVisible ? `${minColWidth}px` : '0px', // Min width only if visible
                        overflow: 'hidden',
                        transition: 'flex-basis 0.3s ease, min-width 0.3s ease', // Optional: Add transition
                        marginRight: isMajorsVisible ? '1em' : '0' // Add margin instead of gap
                     }}>
                        {/* Content of Majors Column */}
                        <h2 style={{ marginTop: '0', marginBottom: '0.5em', whiteSpace: 'nowrap' }}>Select Major</h2>
                        <input
                            type="text"
                            placeholder="Search majors..."
                            value={majorSearchTerm}
                            onChange={(e) => setMajorSearchTerm(e.target.value)}
                            style={{ marginBottom: '0.5em', padding: '8px', border: '1px solid #ccc' }}
                        />
                        {error && <div style={{ color: 'red', marginBottom: '1em' }}>Error: {error}</div>}
                        {isLoadingMajors && <p>Loading available majors...</p>}
                        {!isLoadingMajors && filteredMajors.length > 0 && (
                            <div style={{ flex: '1 1 auto', overflowY: 'auto', border: '1px solid #ccc' }}>
                                {filteredMajors.map(([name, key]) => (
                                    <div
                                        key={key}
                                        onClick={() => handleMajorSelect(key, name)}
                                        style={{
                                            padding: '8px 12px',
                                            cursor: 'pointer',
                                            borderBottom: '1px solid #eee',
                                            backgroundColor: selectedMajorKey === key ? '#e0e0e0' : 'transparent',
                                            fontWeight: selectedMajorKey === key ? 'bold' : 'normal'
                                        }}
                                        className="major-list-item"
                                    >
                                        {name}
                                        {selectedMajorKey === key && isLoadingPdf && <span style={{ marginLeft: '10px', fontStyle: 'italic' }}>(Loading...)</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                        {!isLoadingMajors && filteredMajors.length === 0 && Object.keys(majors).length > 0 && (
                            <p style={{ marginTop: '1em' }}>No majors match your search.</p>
                        )}
                        {!isLoadingMajors && Object.keys(majors).length === 0 && !error && (
                            <p>No majors found.</p>
                        )}
                    </div>
                )}


                {/* Middle Column (Chat Interface) - Dynamically Sized */}
                <div style={{ flex: `0 0 ${currentChatFlexBasis}`, display: 'flex', flexDirection: 'column', minWidth: `${minColWidth}px` }}>
                    {/* Render ChatInterface unconditionally */}
                    <ChatInterface
                        imageFilenames={imageFilenames} // Pass current imageFilenames (might be empty)
                        selectedMajorName={selectedMajorName} // Pass current major name (might be empty)
                    />
                </div>

                {/* --- Draggable Divider 2 (Now the only one) --- */}
                <div
                    ref={dividerRef} // Use the single dividerRef
                    style={{
                        width: `${dividerWidth}px`,
                        cursor: 'col-resize',
                        backgroundColor: '#e0e0e0',
                        borderLeft: '1px solid #ccc',
                        borderRight: '1px solid #ccc',
                        alignSelf: 'stretch',
                        flexShrink: 0
                    }}
                    onMouseDown={handleMouseDown} // Use the single handleMouseDown
                />
                {/* --- End Divider --- */}


                {/* Right Column (PDF Viewer) - Takes Remaining Space */}
                <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minWidth: `${minColWidth}px` }}>
                    <PdfViewer
                        imageFilenames={imageFilenames}
                        isLoading={isLoadingPdf}
                        error={pdfError}
                        filename={selectedPdfFilename}
                    />
                </div>

            </div>
        </>
    );
}

export default AgreementViewerPage;