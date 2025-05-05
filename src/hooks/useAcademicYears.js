import { useState, useEffect } from 'react';
import { fetchData } from '../services/api';

// Helper function to calculate intersection of academic years
const calculateYearIntersection = (results) => {
    if (!results || results.length === 0 || results.some(res => res === null || typeof res === 'undefined')) {
        return {};
    }

    const validResults = results.filter(res => typeof res === 'object' && res !== null && Object.keys(res).length > 0);

    if (validResults.length === 0) {
        return {};
    }

    let commonIds = new Set(Object.values(validResults[0]));

    for (let i = 1; i < validResults.length; i++) {
        const currentIds = new Set(Object.values(validResults[i]));
        commonIds = new Set([...commonIds].filter(id => currentIds.has(id)));
    }

    console.log("Common academic year IDs:", commonIds);

    const intersection = {};
    const nameMapSource = validResults[0];
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
             // Attempt fallback search in other results
            for (const res of validResults) {
                const foundEntry = Object.entries(res).find(([, resId]) => resId === id);
                if (foundEntry) {
                    intersection[foundEntry[0]] = id;
                    break;
                }
            }
        }
    });

    console.log("Intersection year result:", intersection);
    return intersection;
};


export function useAcademicYears(selectedSendingInstitutions, selectedReceivingId) {
    const [academicYears, setAcademicYears] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isMounted = true;
        const senderIds = selectedSendingInstitutions.map(s => s.id);

        // Only proceed if we have at least one sending institution AND a receiving institution selected
        if (senderIds.length === 0 || !selectedReceivingId) {
            setAcademicYears({});
            setIsLoading(false);
            setError(null);
            return; // Clear years if selections are incomplete
        }

        const fetchAndIntersect = async () => {
            if (!isMounted) return;
            setIsLoading(true);
            setError(null);
            setAcademicYears({}); // Clear previous results

            // const cacheKeyBase = `academic-years-${selectedReceivingId}`;
            // let combinedCacheKey = cacheKeyBase + '-' + senderIds.sort().join(','); // Create a consistent key for multiple senders - Not currently used for multi-sender caching

            try {
                // --- Check Cache for the specific combination ---
                // Note: Caching intersection results might be complex if senders change frequently.
                // We'll cache individual results for single senders, but recalculate intersection for multiple.
                if (senderIds.length === 1) {
                    const singleCacheKey = `academic-years-${senderIds[0]}-${selectedReceivingId}`;
                    try {
                        const cachedData = localStorage.getItem(singleCacheKey);
                        if (cachedData) {
                            const parsedData = JSON.parse(cachedData);
                            console.log("Loaded academic years from cache:", singleCacheKey);
                            if (isMounted) {
                                setAcademicYears(parsedData);
                                setIsLoading(false);
                            }
                            return; // Exit early
                        }
                    } catch (e) {
                        console.error("Error loading academic years from cache:", e);
                        localStorage.removeItem(singleCacheKey);
                    }
                }


                // --- Fetch from API ---
                if (senderIds.length === 1) {
                    const sendingId = senderIds[0];
                    console.log(`Fetching years for single sender S=${sendingId}, R=${selectedReceivingId}`);
                    const data = await fetchData(`academic-years?sendingId=${sendingId}&receivingId=${selectedReceivingId}`);
                    if (!isMounted) return;

                    if (data && Object.keys(data).length > 0) {
                        setAcademicYears(data);
                        // Cache Result for single sender
                        const singleCacheKey = `academic-years-${sendingId}-${selectedReceivingId}`;
                        try {
                            localStorage.setItem(singleCacheKey, JSON.stringify(data));
                            console.log("Academic Years cached successfully:", singleCacheKey);
                        } catch (e) {
                            console.error("Error caching academic years:", e);
                        }
                    } else {
                        setAcademicYears({});
                        setError(`No academic years found for the selected combination.`);
                    }
                } else {
                    // --- Fetch for multiple senders and find intersection ---
                    console.log(`Fetching years for multiple senders (Count: ${senderIds.length}), R=${selectedReceivingId}`);
                    const promises = senderIds.map(id =>
                        fetchData(`academic-years?sendingId=${id}&receivingId=${selectedReceivingId}`)
                            .catch(err => {
                                console.error(`Failed to fetch years for S=${id}, R=${selectedReceivingId}:`, err);
                                return {}; // Return empty object on error
                            })
                    );

                    const results = await Promise.all(promises);
                    if (!isMounted) return;
                    console.log("Raw year results from multiple fetches:", results);

                    if (results.some(res => res === null || typeof res === 'undefined')) {
                        throw new Error("One or more requests for academic years failed.");
                    }

                    const intersection = calculateYearIntersection(results);

                    if (Object.keys(intersection).length > 0) {
                        setAcademicYears(intersection);
                    } else {
                        setAcademicYears({});
                        setError("No common academic years found for the selected combination of institutions.");
                    }
                }
            } catch (err) {
                console.error("Error processing academic years:", err);
                if (isMounted) {
                    setError(`Failed to load or process academic years: ${err.message}`);
                    setAcademicYears({}); // Clear on error
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false); // Stop loading
                }
            }
        };

        fetchAndIntersect();

        return () => {
            isMounted = false; // Cleanup
        };
    // Re-run when senders or receiver changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(selectedSendingInstitutions.map(s => s.id)), selectedReceivingId]);

    return { academicYears, isLoading, error };
}
