import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchData } from '../services/api';

const IGETC_ID = 'IGETC';
const LOCAL_STORAGE_PREFIX = 'ctaCache_';

export function useAgreementData(initialSendingId, receivingId, yearId, user, allSelectedSendingInstitutions) {
    const [selectedCategory, setSelectedCategory] = useState('major');
    const [majors, setMajors] = useState({});
    const [isLoadingMajors, setIsLoadingMajors] = useState(true);
    const [error, setError] = useState(null);
    const [pdfError, setPdfError] = useState(null);
    const [selectedMajorKey, setSelectedMajorKey] = useState(null);
    const [selectedMajorName, setSelectedMajorName] = useState('');
    const [isLoadingPdf, setIsLoadingPdf] = useState(false);
    const [majorSearchTerm, setMajorSearchTerm] = useState('');
    const [hasMajorsAvailable, setHasMajorsAvailable] = useState(true);
    const [hasDepartmentsAvailable, setHasDepartmentsAvailable] = useState(true);
    const [isLoadingAvailability, setIsLoadingAvailability] = useState(true);
    const [agreementData, setAgreementData] = useState([]);
    const [allAgreementsImageFilenamesState, setAllAgreementsImageFilenamesState] = useState([]);
    const [activeTabIndex, setActiveTabIndex] = useState(0);
    const [imagesForActivePdf, setImagesForActivePdf] = useState([]);
    const imageCacheRef = useRef({});
    const categoryCacheRef = useRef({});
    const currentAgreement = activeTabIndex >= 0 && activeTabIndex < agreementData.length ? agreementData[activeTabIndex] : null;
    const currentPdfFilename = currentAgreement?.pdfFilename;

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
        const availabilityContextKey = `availability_${initialSendingId}-${receivingId}-${yearId}`;

        const checkAvailability = async (category) => {
            const availabilityLocalStorageKey = `${availabilityContextKey}_${category}`;
            try {
                const cachedAvailability = localStorage.getItem(availabilityLocalStorageKey);
                if (cachedAvailability !== null) {
                    console.log(`Cache hit for availability (${availabilityLocalStorageKey}): ${cachedAvailability}`);
                    return cachedAvailability === 'true';
                }
            } catch (e) {
                 console.error("Error reading availability from localStorage:", e);
                 localStorage.removeItem(availabilityLocalStorageKey);
            }
            console.log(`Cache miss for availability (${availabilityLocalStorageKey}). Fetching...`);
            try {
                const data = await fetchData(`/majors?sendingId=${initialSendingId}&receivingId=${receivingId}&academicYearId=${yearId}&categoryCode=${category}`);
                const exists = Object.keys(data || {}).length > 0;
                try {
                    localStorage.setItem(availabilityLocalStorageKey, exists ? 'true' : 'false');
                } catch (e) {
                    console.error("Error writing availability to localStorage:", e);
                }
                return exists;
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

    useEffect(() => {
        if (isLoadingAvailability || !initialSendingId || !receivingId || !yearId) {
            if (!initialSendingId || !receivingId || !yearId) setError("Missing selection criteria.");
            setMajors({});
            setIsLoadingMajors(false);
            return;
        }
        if ((selectedCategory === 'major' && !hasMajorsAvailable) || (selectedCategory === 'dept' && !hasDepartmentsAvailable)) {
            setError(`No ${selectedCategory}s found for the selected combination.`);
            setIsLoadingMajors(false);
            setMajors({});
            return;
        }
        const contextKey = `${initialSendingId}-${receivingId}-${yearId}`;
        const categoryKey = selectedCategory;
        const localStorageKey = `${LOCAL_STORAGE_PREFIX}${contextKey}_${categoryKey}`;
        try {
            const cachedDataString = localStorage.getItem(localStorageKey);
            if (cachedDataString) {
                console.log(`LocalStorage hit for ${localStorageKey}.`);
                const cachedData = JSON.parse(cachedDataString);
                if (!categoryCacheRef.current[contextKey]) {
                    categoryCacheRef.current[contextKey] = {};
                }
                categoryCacheRef.current[contextKey][categoryKey] = cachedData;
                setMajors(cachedData);
                setError(null);
                setIsLoadingMajors(false);
                return;
            }
        } catch (e) {
            console.error("Error reading from localStorage:", e);
            localStorage.removeItem(localStorageKey);
        }
        if (categoryCacheRef.current[contextKey]?.[categoryKey]) {
            console.log(`In-memory cache hit for ${categoryKey} in context ${contextKey}.`);
            setMajors(categoryCacheRef.current[contextKey][categoryKey]);
            setError(null);
            setIsLoadingMajors(false);
            return;
        }
        console.log(`Cache miss for ${localStorageKey}. Fetching...`);
        setIsLoadingMajors(true);
        setError(null);
        setMajors({});

        const fetchCategoryData = async () => {
            try {
                const data = await fetchData(`/majors?sendingId=${initialSendingId}&receivingId=${receivingId}&academicYearId=${yearId}&categoryCode=${selectedCategory}`);
                const fetchedData = data || {};
                setMajors(fetchedData);
                if (!categoryCacheRef.current[contextKey]) {
                    categoryCacheRef.current[contextKey] = {};
                }
                categoryCacheRef.current[contextKey][categoryKey] = fetchedData;
                try {
                    localStorage.setItem(localStorageKey, JSON.stringify(fetchedData));
                    console.log(`Fetched and cached ${categoryKey}s in localStorage (${localStorageKey}).`);
                } catch (e) {
                    console.error("Error writing to localStorage:", e);
                }

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

    const fetchAgreementDetailsAndImages = useCallback(async (majorKey) => {
        if (!majorKey || allSelectedSendingInstitutions.length === 0 || !receivingId || !yearId) {
             console.warn("Skipping agreement fetch: Missing major key or context.");
             setAgreementData([]);
             setAllAgreementsImageFilenamesState([]);
             setImagesForActivePdf([]);
             setActiveTabIndex(0);
             setPdfError("Select a major/department and ensure all institutions/year are set.");
             setIsLoadingPdf(false);
             return;
        }

        console.log(`Fetching agreements and images for majorKey: ${majorKey}`);
        setIsLoadingPdf(true);
        setPdfError(null);
        setAgreementData([]);
        setAllAgreementsImageFilenamesState([]);
        setImagesForActivePdf([]);
        const contextSendingId = initialSendingId || allSelectedSendingInstitutions[0]?.id;
        let combinedAgreements = [];
        let initialActiveIndex = 0;

        try {
            let igetcAgreement = null;
            if (user && user.idToken && contextSendingId && yearId) {
                try {
                    const igetcResponse = await fetchData(`igetc-agreement?sendingId=${contextSendingId}&academicYearId=${yearId}`, {
                        headers: { 'Authorization': `Bearer ${user.idToken}` }
                    });
                    if (igetcResponse?.pdfFilename) {
                        igetcAgreement = {
                            sendingId: IGETC_ID,
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
                }
            } else {
                 console.log("Skipping IGETC fetch: User not logged in or missing context.");
            }
            const sendingIds = allSelectedSendingInstitutions.map(inst => inst.id);
            const response = await fetchData('articulation-agreements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sending_ids: sendingIds, receiving_id: receivingId, year_id: yearId, major_key: majorKey })
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
                 if (!igetcAgreement) {
                    throw new Error(response?.error || "Failed to load major agreements and no IGETC found.");
                 }
            }
            combinedAgreements = igetcAgreement ? [igetcAgreement, ...fetchedAgreements] : fetchedAgreements;
            setAgreementData(combinedAgreements);

            if (combinedAgreements.length === 0) {
                setPdfError("No agreements found for this major/department.");
                setIsLoadingPdf(false);
                setAllAgreementsImageFilenamesState([]);
                return;
            }
            console.log("Fetching images for all agreements...");
            const imageFetchPromises = combinedAgreements
                .filter(a => a.pdfFilename)
                .map(async (agreement) => {
                    const filename = agreement.pdfFilename;
                    if (imageCacheRef.current[filename]) {
                        console.log(`Cache hit for images: ${filename}`);
                        return { filename, images: imageCacheRef.current[filename] };
                    }
                    console.log(`Cache miss, fetching images for: ${filename}`);
                    try {
                        const imgResponse = await fetchData(`pdf-images/${encodeURIComponent(filename)}`);
                        if (imgResponse?.image_filenames) {
                            imageCacheRef.current[filename] = imgResponse.image_filenames;
                            console.log(`Successfully fetched and cached images for: ${filename}`);
                            return { filename, images: imgResponse.image_filenames };
                        }
                         console.warn(`No image filenames received for ${filename}`);
                         imageCacheRef.current[filename] = [];
                         return { filename, images: [] };
                    } catch (imgErr) {
                         console.error(`Error fetching images for ${filename}:`, imgErr);
                         imageCacheRef.current[filename] = [];
                         return { filename, images: [] };
                    }
                });
            await Promise.allSettled(imageFetchPromises);
            console.log("All image fetch attempts completed.");
            const newAllFilenames = combinedAgreements.reduce((acc, agreement) => {
                if (agreement.pdfFilename && imageCacheRef.current[agreement.pdfFilename]) {
                    acc.push(...imageCacheRef.current[agreement.pdfFilename]);
                }
                return acc;
            }, []);
            const uniqueFilenames = [...new Set(newAllFilenames)];
            setAllAgreementsImageFilenamesState(uniqueFilenames);
            console.log("Derived and set allAgreementsImageFilenamesState:", uniqueFilenames);
            const firstRealAgreementIndex = combinedAgreements.findIndex(a => !a.isIgetc);
            initialActiveIndex = firstRealAgreementIndex !== -1 ? firstRealAgreementIndex : 0;
            setActiveTabIndex(initialActiveIndex);

        } catch (err) {
            console.error("Error during agreement details/images fetch:", err);
            setPdfError(`Failed to load agreement data: ${err.message}`);
            setAgreementData([]);
            setImagesForActivePdf([]);
            setActiveTabIndex(0);
            setAllAgreementsImageFilenamesState([]);
        } finally {
             setIsLoadingPdf(false);
             console.log("Finished fetchAgreementDetailsAndImages. isLoadingPdf: false");
        }
    }, [allSelectedSendingInstitutions, receivingId, yearId, initialSendingId, user?.idToken]);

    useEffect(() => {
        if (agreementData.length === 0 || activeTabIndex < 0 || activeTabIndex >= agreementData.length) {
            setImagesForActivePdf([]);
            return;
        }

        const activeAgreement = agreementData[activeTabIndex];
        const filename = activeAgreement?.pdfFilename;

        console.log(`Active tab changed to ${activeTabIndex}. Agreement: ${activeAgreement?.sendingName}, PDF: ${filename}`);

        if (filename) {
            const cachedImages = imageCacheRef.current[filename];
            if (cachedImages) {
                setImagesForActivePdf(cachedImages);
                console.log(`Displaying ${cachedImages.length} cached images for active tab ${activeTabIndex} (${filename}).`);
            } else {
                setImagesForActivePdf([]);
                console.warn(`Images not found in cache for active tab ${activeTabIndex} (${filename}). This might indicate a fetch error for this specific PDF.`);
            }
        } else {
            setImagesForActivePdf([]);
            console.log(`No PDF filename for active tab ${activeTabIndex}. Clearing images.`);
        }
    }, [activeTabIndex, agreementData]);

    useEffect(() => {
        console.log("Core context changed (URL params), resetting selections and agreement data.");
        setSelectedMajorKey(null); setSelectedMajorName('');
        setAgreementData([]);
        setActiveTabIndex(0);
        setImagesForActivePdf([]);
        setPdfError(null);
        setIsLoadingPdf(false);
        imageCacheRef.current = {};
        console.log("Image cache cleared due to context change.");
        categoryCacheRef.current = {};
        console.log("In-memory category cache cleared due to context change.");
        setHasMajorsAvailable(true);
        setHasDepartmentsAvailable(true);
        setIsLoadingAvailability(true);
        setMajors({});
        setError(null);
        setIsLoadingMajors(true);
        setAllAgreementsImageFilenamesState([]);

    }, [initialSendingId, receivingId, yearId]);

    const handleMajorSelect = useCallback((majorKey, majorName) => {
        if (majorKey === selectedMajorKey) return;

        console.log("Major selected:", majorKey, majorName);
        setSelectedMajorKey(majorKey);
        setSelectedMajorName(majorName);
        setAgreementData([]);
        setImagesForActivePdf([]);
        setActiveTabIndex(0);
        setPdfError(null);
        fetchAgreementDetailsAndImages(majorKey);

    }, [selectedMajorKey, fetchAgreementDetailsAndImages]);

    const handleCategoryChange = useCallback((event) => {
        const newCategory = event.target.value;
        if (newCategory === selectedCategory) return;

        console.log("Category changed to:", newCategory);
        setSelectedCategory(newCategory);
        setSelectedMajorKey(null); setSelectedMajorName('');
        setMajorSearchTerm('');
        setAgreementData([]);
        setImagesForActivePdf([]);
        setActiveTabIndex(0);
        setPdfError(null);
        setIsLoadingPdf(false);
    }, [selectedCategory]);

    const handleTabClick = useCallback((index) => {
        if (index === activeTabIndex) return;
        console.log("Tab clicked:", index, "Setting active tab index.");
        setActiveTabIndex(index);
    }, [activeTabIndex]);

    const filteredMajors = useMemo(() => {
        const lowerCaseSearchTerm = majorSearchTerm.toLowerCase();
        if (typeof majors !== 'object' || majors === null) return [];
        return Object.entries(majors).filter(([name]) =>
            name.toLowerCase().includes(lowerCaseSearchTerm)
        );
    }, [majors, majorSearchTerm]);


    return {
        selectedCategory,
        majors,
        isLoadingMajors,
        error,
        pdfError,
        selectedMajorKey,
        selectedMajorName,
        isLoadingPdf,
        majorSearchTerm,
        hasMajorsAvailable,
        hasDepartmentsAvailable,
        isLoadingAvailability,
        agreementData,
        allAgreementsImageFilenames: allAgreementsImageFilenamesState,
        activeTabIndex,
        imagesForActivePdf,
        currentPdfFilename,
        filteredMajors,
        handleMajorSelect,
        handleCategoryChange,
        handleTabClick,
        setMajorSearchTerm,
    };
}
