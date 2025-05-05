import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchData } from '../services/api'; // Assuming api.js is in services

const IGETC_ID = 'IGETC';

export function useAgreementData(initialSendingId, receivingId, yearId, user, allSelectedSendingInstitutions) {
    // --- State for Agreement Data ---
    const [selectedCategory, setSelectedCategory] = useState('major');
    const [majors, setMajors] = useState({});
    const [isLoadingMajors, setIsLoadingMajors] = useState(true);
    const [error, setError] = useState(null); // Error for majors list
    const [pdfError, setPdfError] = useState(null); // Error for PDF viewer area
    const [selectedMajorKey, setSelectedMajorKey] = useState(null);
    const [selectedMajorName, setSelectedMajorName] = useState('');
    const [isLoadingPdf, setIsLoadingPdf] = useState(false); // General loading for PDF viewer area (controlled by fetch)
    const [majorSearchTerm, setMajorSearchTerm] = useState('');
    const [hasMajorsAvailable, setHasMajorsAvailable] = useState(true);
    const [hasDepartmentsAvailable, setHasDepartmentsAvailable] = useState(true);
    const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);

    // --- State for Multiple PDFs/Tabs ---
    const [agreementData, setAgreementData] = useState([]); // Will include IGETC if available
    const [activeTabIndex, setActiveTabIndex] = useState(0); // Start potentially at IGETC (index 0)
    const [imagesForActivePdf, setImagesForActivePdf] = useState([]);
    // const [allAgreementsImageFilenames, setAllAgreementsImageFilenames] = useState([]); // Removed: Not directly used/needed if caching by filename

    // --- Cache Ref for Images ---
    const imageCacheRef = useRef({}); // Store images keyed by PDF filename

    // --- Derived state ---
    const currentAgreement = activeTabIndex >= 0 && activeTabIndex < agreementData.length ? agreementData[activeTabIndex] : null;
    const currentPdfFilename = currentAgreement?.pdfFilename;

    // --- Availability Check ---
    useEffect(() => {
        if (!initialSendingId || !receivingId || !yearId) {
            setIsLoadingAvailability(false);
            setHasMajorsAvailable(false);
            setHasDepartmentsAvailable(false);
            return;
        }
        setIsLoadingAvailability(true);
        setHasMajorsAvailable(false); // Reset on change
        setHasDepartmentsAvailable(false);

        const checkAvailability = async (category) => {
            try {
                const data = await fetchData(`/majors?sendingId=${initialSendingId}&receivingId=${receivingId}&academicYearId=${yearId}&categoryCode=${category}`);
                return Object.keys(data || {}).length > 0;
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
                }
            })
            .finally(() => setIsLoadingAvailability(false));

    }, [initialSendingId, receivingId, yearId, selectedCategory]);


    // --- Fetch Majors/Departments ---
    useEffect(() => {
        if (isLoadingAvailability || !initialSendingId || !receivingId || !yearId) {
            if (!initialSendingId || !receivingId || !yearId) setError("Missing selection criteria.");
            return;
        }

        if ((selectedCategory === 'major' && !hasMajorsAvailable) || (selectedCategory === 'dept' && !hasDepartmentsAvailable)) {
            setError(`No ${selectedCategory}s found for the selected combination.`);
            setIsLoadingMajors(false);
            setMajors({});
            return;
        }

        setIsLoadingMajors(true);
        setError(null);
        setMajors({});

        const fetchCategoryData = async () => {
            try {
                const data = await fetchData(`/majors?sendingId=${initialSendingId}&receivingId=${receivingId}&academicYearId=${yearId}&categoryCode=${selectedCategory}`);
                setMajors(data || {});
            } catch (err) {
                console.error(`Error fetching ${selectedCategory}s:`, err);
                setError(`Failed to load ${selectedCategory}s.`);
                setMajors({});
            } finally {
                setIsLoadingMajors(false);
            }
        };

        fetchCategoryData();
    }, [initialSendingId, receivingId, yearId, selectedCategory, isLoadingAvailability, hasMajorsAvailable, hasDepartmentsAvailable]);


    // --- Fetch Agreement Details and Images (including IGETC) ---
    // This is the main function responsible for fetching ALL agreement data and images
    // It is ONLY called when a major/department is selected via handleMajorSelect.
    const fetchAgreementDetailsAndImages = useCallback(async (majorKey) => {
        // Guard against missing context needed for fetching
        if (!majorKey || allSelectedSendingInstitutions.length === 0 || !receivingId || !yearId) {
             console.warn("Skipping agreement fetch: Missing major key or context.");
             setAgreementData([]);
             // setAllAgreementsImageFilenames([]); // Removed state
             setImagesForActivePdf([]);
             setActiveTabIndex(0);
             setPdfError("Select a major/department and ensure all institutions/year are set.");
             setIsLoadingPdf(false); // Not loading if nothing to fetch
             return;
        }

        console.log(`Fetching agreements and images for majorKey: ${majorKey}`);
        setIsLoadingPdf(true); // START loading indicator for the entire process
        setPdfError(null);
        setAgreementData([]); // Clear previous agreements
        // setAllAgreementsImageFilenames([]); // Removed state
        setImagesForActivePdf([]); // Clear viewer
        setActiveTabIndex(0); // Reset tab index temporarily

        // Determine the sending ID to use for the IGETC check (prefer initial, fallback to first selected)
        const contextSendingId = initialSendingId || allSelectedSendingInstitutions[0]?.id;

        let combinedAgreements = [];
        let initialActiveIndex = 0; // Default to 0

        try {
            let igetcAgreement = null;
            // 1. Fetch IGETC Agreement Filename (if logged in and context available)
            if (user && user.idToken && contextSendingId && yearId) {
                try {
                    const igetcResponse = await fetchData(`/igetc-agreement?sendingId=${contextSendingId}&academicYearId=${yearId}`, {
                        headers: { 'Authorization': `Bearer ${user.idToken}` }
                    });
                    if (igetcResponse?.pdfFilename) {
                        igetcAgreement = {
                            sendingId: IGETC_ID, // Special ID
                            sendingName: 'IGETC',
                            pdfFilename: igetcResponse.pdfFilename,
                            isIgetc: true
                        };
                        console.log("IGETC agreement found:", igetcAgreement.pdfFilename);
                    } else {
                         console.warn("No IGETC PDF filename received:", igetcResponse?.error || "Empty response");
                    }
                } catch (err) {
                    console.error("Error fetching IGETC filename:", err);
                    // Log error but continue to fetch major agreements
                }
            } else {
                 console.log("Skipping IGETC fetch: User not logged in or missing context.");
            }

            // 2. Fetch Major Articulation Agreements
            const sendingIds = allSelectedSendingInstitutions.map(inst => inst.id);
            const response = await fetchData('/articulation-agreements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sending_ids: sendingIds, receiving_id: receivingId, year_id: yearId, major_key: majorKey }) // Use passed majorKey
            });

            let fetchedAgreements = [];
            if (response?.agreements) {
                 fetchedAgreements = response.agreements.map(a => ({
                    ...a,
                    sendingName: allSelectedSendingInstitutions.find(inst => inst.id === a.sendingId)?.name || `ID ${a.sendingId}`,
                    isIgetc: false
                }));
                 console.log(`Fetched ${fetchedAgreements.length} major agreements.`);
            } else {
                 console.error("Invalid response format for major agreements:", response?.error || "No agreements array");
                 if (!igetcAgreement) { // Only throw if IGETC also failed
                    throw new Error(response?.error || "Failed to load major agreements and no IGETC found.");
                 }
            }

            // 3. Combine IGETC and Major Agreements
            combinedAgreements = igetcAgreement ? [igetcAgreement, ...fetchedAgreements] : fetchedAgreements;
            setAgreementData(combinedAgreements); // Set the combined list

            if (combinedAgreements.length === 0) {
                setPdfError("No agreements found for this major/department.");
                // No need to fetch images if no agreements
                setIsLoadingPdf(false); // STOP loading
                return;
            }

            // 4. Fetch Images for ALL agreements in parallel (check/populate cache)
            console.log("Fetching images for all agreements...");
            const imageFetchPromises = combinedAgreements
                .filter(a => a.pdfFilename) // Only fetch for agreements with a PDF
                .map(async (agreement) => {
                    const filename = agreement.pdfFilename;
                    if (imageCacheRef.current[filename]) {
                        console.log(`Cache hit for images: ${filename}`);
                        return { filename, images: imageCacheRef.current[filename] }; // Return filename for mapping
                    }
                    console.log(`Cache miss, fetching images for: ${filename}`);
                    try {
                        const imgResponse = await fetchData(`pdf-images/${encodeURIComponent(filename)}`);
                        if (imgResponse?.image_filenames) {
                            imageCacheRef.current[filename] = imgResponse.image_filenames; // Cache the images
                            console.log(`Successfully fetched and cached images for: ${filename}`);
                            return { filename, images: imgResponse.image_filenames };
                        }
                         console.warn(`No image filenames received for ${filename}`);
                         imageCacheRef.current[filename] = []; // Cache empty array if no images found
                         return { filename, images: [] };
                    } catch (imgErr) {
                         console.error(`Error fetching images for ${filename}:`, imgErr);
                         imageCacheRef.current[filename] = []; // Cache empty array on error
                         return { filename, images: [] }; // Indicate failure for this PDF
                    }
                });

            // Wait for all image fetches to settle
            await Promise.allSettled(imageFetchPromises);
            console.log("All image fetch attempts completed.");

            // 5. Determine initial active tab index (first non-IGETC, or 0 if only IGETC/none)
            const firstRealAgreementIndex = combinedAgreements.findIndex(a => !a.isIgetc);
            initialActiveIndex = firstRealAgreementIndex !== -1 ? firstRealAgreementIndex : 0;
            setActiveTabIndex(initialActiveIndex); // Set the final active tab index

            // 6. Set images for the initially active PDF (using initialActiveIndex)
            // This is now handled by the useEffect watching activeTabIndex
            // We just need to ensure the cache is populated by this point.

        } catch (err) {
            console.error("Error during agreement details/images fetch:", err);
            setPdfError(`Failed to load agreement data: ${err.message}`);
            setAgreementData([]); // Clear data on error
            // setAllAgreementsImageFilenames([]); // Removed state
            setImagesForActivePdf([]);
            setActiveTabIndex(0); // Reset index
        } finally {
            // Loading stops AFTER all fetches (agreements + images) are attempted and initial tab is set.
            // The useEffect watching activeTabIndex will then display the images for that tab from the cache.
             setIsLoadingPdf(false); // STOP loading indicator
             console.log("Finished fetchAgreementDetailsAndImages. isLoadingPdf: false");
        }
    // Dependencies: All inputs that should trigger a full refetch when they change.
    // Note: `majorKey` is passed as an argument, so it doesn't need to be a dependency here.
    // `user` dependency ensures refetch if login state changes (for IGETC).
    }, [allSelectedSendingInstitutions, receivingId, yearId, initialSendingId, user?.idToken]); // Refined dependencies


    // --- Effect to Handle Active Tab Image Loading (Display Only) ---
    useEffect(() => {
        // This effect ONLY sets the images for the currently active tab based on fetched data in the cache.
        // It does NOT trigger fetches or manage the main isLoadingPdf state.
        if (agreementData.length === 0 || activeTabIndex < 0 || activeTabIndex >= agreementData.length) {
            setImagesForActivePdf([]);
            // pdfError should be handled by the fetch function if data is missing or failed to load
            return;
        }

        const activeAgreement = agreementData[activeTabIndex];
        const filename = activeAgreement?.pdfFilename;

        console.log(`Active tab changed to ${activeTabIndex}. Agreement: ${activeAgreement?.sendingName}, PDF: ${filename}`);

        if (filename) {
            const cachedImages = imageCacheRef.current[filename];
            if (cachedImages) {
                // Images are expected to be in the cache if fetchAgreementDetailsAndImages succeeded for this PDF
                setImagesForActivePdf(cachedImages);
                console.log(`Displaying ${cachedImages.length} cached images for active tab ${activeTabIndex} (${filename}).`);
                // Clear transient errors maybe? Or rely on fetchAgreementDetailsAndImages to set persistent errors.
                // setPdfError(null); // Let fetch manage persistent errors.
            } else {
                // This case should ideally not happen if fetchAgreementDetailsAndImages completed successfully
                // and the PDF had images. It might indicate an error during the image fetch for this specific PDF.
                setImagesForActivePdf([]);
                console.warn(`Images not found in cache for active tab ${activeTabIndex} (${filename}). This might indicate a fetch error for this specific PDF.`);
                // Do not set pdfError here; rely on the error state set during the main fetch process.
                // If isLoadingPdf is false here, it means the main fetch finished, but these images are missing.
                // The UI should ideally reflect the error set by the fetch function (pdfError state).
            }
        } else {
            // No PDF filename associated with this agreement tab
            setImagesForActivePdf([]);
            console.log(`No PDF filename for active tab ${activeTabIndex}. Clearing images.`);
            // pdfError related to "No PDF available" should be handled by UI based on missing filename or set during fetch.
        }
        // This effect does not manage isLoadingPdf.
    // Depend only on the active tab index and the agreement data itself.
    }, [activeTabIndex, agreementData]); // Correct dependencies for display logic


    // --- Effect to reset selections when core context changes (URL params) ---
    useEffect(() => {
        console.log("Core context changed (URL params), resetting selections and agreement data.");
        setSelectedMajorKey(null); setSelectedMajorName('');
        setAgreementData([]);
        // setAllAgreementsImageFilenames([]); // Removed state
        setActiveTabIndex(0); // Default back to index 0
        setImagesForActivePdf([]);
        setPdfError(null); // Clear errors
        setIsLoadingPdf(false); // Ensure loading is off
        // Clear image cache when core context changes, as agreements might be different
        imageCacheRef.current = {};
        console.log("Image cache cleared due to context change.");
    }, [initialSendingId, receivingId, yearId]);

    // --- Handlers ---
    const handleMajorSelect = useCallback((majorKey, majorName) => {
        if (majorKey === selectedMajorKey) return; // Avoid refetch if same major clicked

        console.log("Major selected:", majorKey, majorName);
        setSelectedMajorKey(majorKey);
        setSelectedMajorName(majorName);

        // Clear previous data immediately for responsiveness before fetch starts
        setAgreementData([]);
        // setAllAgreementsImageFilenames([]); // Removed state
        setImagesForActivePdf([]);
        setActiveTabIndex(0); // Reset to 0 temporarily
        setPdfError(null); // Clear previous errors
        // setIsLoadingPdf(true); // Set inside fetchAgreementDetailsAndImages

        // Trigger the main fetch function for the new major
        fetchAgreementDetailsAndImages(majorKey); // Pass majorKey directly

    }, [selectedMajorKey, fetchAgreementDetailsAndImages]); // Dependency on fetch function is key

    const handleCategoryChange = useCallback((event) => {
        const newCategory = event.target.value;
        setSelectedCategory(newCategory);
        // Reset major selection and agreement data when category changes
        setSelectedMajorKey(null); setSelectedMajorName('');
        setMajorSearchTerm('');
        setAgreementData([]);
        // setAllAgreementsImageFilenames([]); // Removed state
        setImagesForActivePdf([]);
        setActiveTabIndex(0);
        setError(null);
        setPdfError(null);
        setIsLoadingPdf(false); // Ensure loading is off
        // Keep image cache, category change doesn't invalidate PDFs for same context
    }, []);

    const handleTabClick = useCallback((index) => {
        if (index === activeTabIndex) return;
        console.log("Tab clicked:", index, "Setting active tab index.");
        setActiveTabIndex(index);
        // DO NOT trigger fetches or set isLoadingPdf here.
        // The useEffect watching activeTabIndex will handle displaying cached images.
    }, [activeTabIndex]);

    // --- Filtered Majors ---
    const filteredMajors = useMemo(() => {
        const lowerCaseSearchTerm = majorSearchTerm.toLowerCase();
        if (typeof majors !== 'object' || majors === null) return [];
        return Object.entries(majors).filter(([name]) =>
            name.toLowerCase().includes(lowerCaseSearchTerm)
        );
    }, [majors, majorSearchTerm]);


    return {
        // State
        selectedCategory,
        majors,
        isLoadingMajors,
        error,
        pdfError,
        selectedMajorKey,
        selectedMajorName,
        isLoadingPdf, // Indicates loading of agreements/images AFTER major select
        majorSearchTerm,
        hasMajorsAvailable,
        hasDepartmentsAvailable,
        isLoadingAvailability,
        agreementData, // Includes IGETC + Major agreements
        activeTabIndex,
        imagesForActivePdf, // Images for the currently selected tab

        // Derived State
        currentPdfFilename,
        filteredMajors,

        // Handlers
        handleMajorSelect,
        handleCategoryChange,
        handleTabClick,
        setMajorSearchTerm,
    };
}
