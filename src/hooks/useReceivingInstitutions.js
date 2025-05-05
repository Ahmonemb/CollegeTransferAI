import { useState, useEffect } from 'react';
import { fetchData } from '../services/api';

// Helper function to calculate intersection of receiving institutions
const calculateIntersection = (results) => {
    if (!results || results.length === 0 || results.some(res => res === null || typeof res === 'undefined')) {
        return {};
    }

    // Filter out any potentially empty results before processing
    const validResults = results.filter(res => typeof res === 'object' && res !== null && Object.keys(res).length > 0);

    if (validResults.length === 0) {
        return {}; // No valid data to intersect
    }

    // Get IDs from the first valid result as the starting point
    let commonIds = new Set(Object.values(validResults[0]));

    // Intersect with IDs from subsequent valid results
    for (let i = 1; i < validResults.length; i++) {
        const currentIds = new Set(Object.values(validResults[i]));
        commonIds = new Set([...commonIds].filter(id => currentIds.has(id)));
    }

    console.log("Common receiving institution IDs:", commonIds);

    // Rebuild the availableReceivingInstitutions object using common IDs
    const intersection = {};
    // Use the first valid result to map IDs back to names
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
            console.warn(`Could not find name for common receiving ID: ${id}.`);
            // Attempt to find name in other results as a fallback (more robust but less efficient)
            for (const res of validResults) {
                const foundEntry = Object.entries(res).find(([, resId]) => resId === id);
                if (foundEntry) {
                    intersection[foundEntry[0]] = id;
                    break;
                }
            }
        }
    });

    console.log("Intersection result:", intersection);
    return intersection;
};


export function useReceivingInstitutions(selectedSendingInstitutions) {
    const [availableReceivingInstitutions, setAvailableReceivingInstitutions] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isMounted = true;
        const senderIds = selectedSendingInstitutions.map(s => s.id);

        if (senderIds.length === 0) {
            setAvailableReceivingInstitutions({});
            setIsLoading(false);
            setError(null);
            return; // No senders, no need to fetch
        }

        const fetchAndIntersect = async () => {
            if (!isMounted) return;
            setIsLoading(true);
            setError(null);
            setAvailableReceivingInstitutions({}); // Clear previous results

            try {
                let data;
                if (senderIds.length === 1) {
                    // --- Fetch for a single sender ---
                    const sendingId = senderIds[0];
                    console.log("Fetching receiving for single sender:", sendingId);
                    data = await fetchData(`receiving-institutions?sendingId=${sendingId}`);
                    if (!isMounted) return;
                    if (data && Object.keys(data).length > 0) {
                        setAvailableReceivingInstitutions(data);
                    } else {
                        setAvailableReceivingInstitutions({});
                        setError(`No receiving institutions found with agreements for the selected sender.`);
                    }
                } else {
                    // --- Fetch for multiple senders and find intersection ---
                    console.log("Fetching receiving for multiple senders:", senderIds);
                    const promises = senderIds.map(id =>
                        fetchData(`receiving-institutions?sendingId=${id}`)
                            .catch(err => {
                                console.error(`Failed to fetch receiving for sender ${id}:`, err);
                                return {}; // Return empty object on error for this sender
                            })
                    );

                    const results = await Promise.all(promises);
                    if (!isMounted) return;
                    console.log("Raw results from multiple fetches:", results);

                    if (results.some(res => res === null || typeof res === 'undefined')) {
                         throw new Error("One or more requests for receiving institutions failed.");
                    }

                    const intersection = calculateIntersection(results);

                    if (Object.keys(intersection).length > 0) {
                        setAvailableReceivingInstitutions(intersection);
                    } else {
                        setAvailableReceivingInstitutions({});
                        setError("No common receiving institutions found for the selected sending institutions.");
                    }
                }
            } catch (err) {
                console.error("Error processing receiving institutions:", err);
                 if (isMounted) {
                    setError(`Failed to load or process receiving institutions: ${err.message}`);
                    setAvailableReceivingInstitutions({}); // Clear on error
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
    // Re-run when the list of selected senders changes (deep comparison isn't perfect here, but IDs changing is the key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(selectedSendingInstitutions.map(s => s.id))]);

    return { availableReceivingInstitutions, isLoading, error };
}
