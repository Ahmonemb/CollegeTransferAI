import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { fetchData } from '../services/api';
import PdfViewer from './PdfViewer';
import ChatInterface from './ChatInterface';
import '../App.css';

// Constants remain the same
const minColWidth = 150;
const dividerWidth = 1;
const fixedMajorsWidth = 300;

function AgreementViewerPage({ user }) {
    const { sendingId, receivingId, yearId } = useParams();

    // --- State for resizing ---
    const [chatColumnWidth, setChatColumnWidth] = useState(400);
    const isResizingRef = useRef(false);
    const dividerRef = useRef(null);
    const containerRef = useRef(null);

    // --- State for Majors Column Visibility ---
    const [isMajorsVisible, setIsMajorsVisible] = useState(true);
    const isMajorsVisibleRef = useRef(isMajorsVisible);

    // --- Effect to update the ref ---
    useEffect(() => {
        isMajorsVisibleRef.current = isMajorsVisible;
    }, [isMajorsVisible]);

    // --- Existing State ---
    const [selectedCategory, setSelectedCategory] = useState('major');
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
    const [hasMajorsAvailable, setHasMajorsAvailable] = useState(true);
    const [hasDepartmentsAvailable, setHasDepartmentsAvailable] = useState(true);
    const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);

    // --- Existing Effects (Availability, Fetching Data, Cleanup) ---
    useEffect(() => {
        if (!sendingId || !receivingId || !yearId) {
            setIsLoadingAvailability(false);
            setHasMajorsAvailable(false);
            setHasDepartmentsAvailable(false);
            return;
        }

        setIsLoadingAvailability(true);
        setHasMajorsAvailable(false);
        setHasDepartmentsAvailable(false);

        const checkAvailability = async (category) => {
            const cacheKey = `agreements-${category}-${sendingId}-${receivingId}-${yearId}`;
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
                const data = await fetchData(`majors?sendingInstitutionId=${sendingId}&receivingInstitutionId=${receivingId}&academicYearId=${yearId}&categoryCode=${category}`);
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

    }, [sendingId, receivingId, yearId, selectedCategory]);

    useEffect(() => {
        if (isLoadingAvailability || !sendingId || !receivingId || !yearId) {
            if (!sendingId || !receivingId || !yearId) {
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

        const cacheKey = `agreements-${selectedCategory}-${sendingId}-${receivingId}-${yearId}`;
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
                const data = await fetchData(`majors?sendingInstitutionId=${sendingId}&receivingInstitutionId=${receivingId}&academicYearId=${yearId}&categoryCode=${selectedCategory}`);
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

    }, [sendingId, receivingId, yearId, selectedCategory, isLoadingAvailability, hasMajorsAvailable, hasDepartmentsAvailable]);

    const handleMouseMove = useCallback((e) => {
        if (!isResizingRef.current || !containerRef.current) {
            return;
        }

        const containerRect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX;
        const containerLeft = containerRect.left;
        const totalWidth = containerRect.width;
        const gapWidth = 16;

        const currentVisibility = isMajorsVisibleRef.current;

        const majorsEffectiveWidth = currentVisibility ? fixedMajorsWidth : 0;
        const gap1EffectiveWidth = currentVisibility ? gapWidth : 0;
        const chatStartOffset = majorsEffectiveWidth + gap1EffectiveWidth;

        let newChatWidth = mouseX - containerLeft - chatStartOffset;

        const maxChatWidth = totalWidth - chatStartOffset - minColWidth - gapWidth - dividerWidth;
        newChatWidth = Math.max(minColWidth, Math.min(newChatWidth, maxChatWidth));

        setChatColumnWidth(newChatWidth);

    }, []);

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

    const handleMajorSelect = async (majorKey, majorName) => {
        if (!majorKey || isLoadingPdf) return;

        setSelectedMajorKey(majorKey);
        setSelectedMajorName(majorName);
        setSelectedPdfFilename(null);
        setImageFilenames([]);
        setIsLoadingPdf(true);
        setError(null);
        setPdfError(null);

        try {
            const agreementData = await fetchData(`articulation-agreement?key=${majorKey}`);
            if (agreementData && agreementData.pdf_filename) {
                const pdfFilename = agreementData.pdf_filename;
                setSelectedPdfFilename(pdfFilename);

                const imageCacheKey = `pdf-images-${pdfFilename}`;
                let fetchedFromCache = false;

                try {
                    const cachedImageData = localStorage.getItem(imageCacheKey);
                    if (cachedImageData) {
                        const parsedImageData = JSON.parse(cachedImageData);
                        if (parsedImageData && parsedImageData.image_filenames) {
                            console.log("Loaded images from cache:", imageCacheKey);
                            setImageFilenames(parsedImageData.image_filenames);
                            fetchedFromCache = true;
                        } else {
                            console.warn("Cached image data invalid, removing:", imageCacheKey);
                            localStorage.removeItem(imageCacheKey);
                        }
                    }
                } catch (e) {
                    console.error("Failed to read or parse images cache:", e);
                    localStorage.removeItem(imageCacheKey);
                }

                if (!fetchedFromCache) {
                    console.log("Fetching images from API:", imageCacheKey);
                    const imageData = await fetchData(`pdf-images/${pdfFilename}`);
                    if (imageData && imageData.image_filenames) {
                        setImageFilenames(imageData.image_filenames);
                        try {
                            localStorage.setItem(imageCacheKey, JSON.stringify(imageData));
                            console.log("Saved images to cache:", imageCacheKey);
                        } catch (e) {
                            console.error("Failed to save images to cache:", e);
                        }
                    } else {
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
            setPdfError(err.message);
            setSelectedPdfFilename(null);
            setImageFilenames([]);
        } finally {
            setIsLoadingPdf(false);
        }
    };

    

    

    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        isResizingRef.current = true;
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [handleMouseMove, handleMouseUp]);

    const handleCategoryChange = (event) => {
        setSelectedCategory(event.target.value);
        setSelectedMajorKey(null);
        setSelectedMajorName('');
        setSelectedPdfFilename(null);
        setImageFilenames([]);
        setPdfError(null);
        setError(null);
    };

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
                }}>

                {/* Left Column (Majors/Depts List) */}
                {isMajorsVisible && (
                    <div style={{
                        flex: `0 0 ${currentMajorsFlexBasis}`,
                        display: 'flex',
                        flexDirection: 'column',
                        minWidth: `${minColWidth}px`,
                        overflow: 'hidden',
                        transition: 'flex-basis 0.3s ease, min-width 0.3s ease',
                        marginRight: '1em',
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
                        imageFilenames={imageFilenames}
                        selectedMajorName={selectedMajorName}
                        userName={userName}
                        isMajorsVisible={isMajorsVisible}
                        toggleMajorsVisibility={toggleMajorsVisibility}
                    />
                </div>

                {/* Draggable Divider */}
                <div ref={dividerRef} style={{ width: `${dividerWidth}px`, cursor: 'col-resize', backgroundColor: '#e0e0e0', borderLeft: '1px solid #ccc', borderRight: '1px solid #ccc', alignSelf: 'stretch', flexShrink: 0, marginLeft: isMajorsVisible ? '1em' : '0' }} onMouseDown={handleMouseDown} />

                {/* Right Column (PDF Viewer) */}
                <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', minWidth: `${minColWidth}px`, marginLeft: '1em' }}>
                    <PdfViewer imageFilenames={imageFilenames} isLoading={isLoadingPdf} error={pdfError} filename={selectedPdfFilename} />
                </div>
            </div>
        </>
    );
}

export default AgreementViewerPage;