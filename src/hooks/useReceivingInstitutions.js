import { useState, useEffect, useRef } from 'react';
import { fetchData } from '../services/api';

const LOCAL_STORAGE_PREFIX = 'ctaCache_';
// Remove calculateIntersection helper from frontend

export function useReceivingInstitutions(selectedSendingInstitutions) {
    const [availableReceivingInstitutions, setAvailableReceivingInstitutions] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const cacheRef = useRef({}); // Simple in-memory cache for this hook instance

    // Define senderIds outside useEffect to use in dependency array
    const senderIds = selectedSendingInstitutions.map(s => s.id);
    const senderIdsString = senderIds.sort().join(','); // Create sorted, comma-separated string for cache key & query

    useEffect(() => {
        let isMounted = true;

        if (senderIds.length === 0) {
            setAvailableReceivingInstitutions({});
            setIsLoading(false);
            setError(null);
            return; // No senders, no need to fetch
        }

        const fetchCommonReceiving = async () => {
            if (!isMounted) return;
            setIsLoading(true);
            setError(null);
            setAvailableReceivingInstitutions({}); // Clear previous results

            const localStorageKey = `${LOCAL_STORAGE_PREFIX}receiving_intersection_${senderIdsString}`;
            const memoryCacheKey = `receiving_${senderIdsString}`;

            // 1. Check In-Memory Cache
            if (cacheRef.current[memoryCacheKey]) {
                console.log(`In-memory cache hit for receiving intersection: ${senderIdsString}`);
                setAvailableReceivingInstitutions(cacheRef.current[memoryCacheKey]);
                setIsLoading(false);
                return;
            }

            // 2. Check localStorage
            try {
                const cachedDataString = localStorage.getItem(localStorageKey);
                if (cachedDataString) {
                    console.log(`LocalStorage hit for receiving intersection (${localStorageKey})`);
                    const cachedData = JSON.parse(cachedDataString);
                    cacheRef.current[memoryCacheKey] = cachedData; // Update in-memory
                    setAvailableReceivingInstitutions(cachedData);
                    setIsLoading(false);
                    return;
                }
            } catch (e) {
                console.error(`Error reading receiving intersection from localStorage (${localStorageKey}):`, e);
                localStorage.removeItem(localStorageKey);
            }

            // 3. Fetch from API (Single Call)
            console.log(`Cache miss for receiving intersection (${senderIdsString}). Fetching...`);
            try {
                // Pass comma-separated string
                const data = await fetchData(`receiving-institutions?sendingId=${senderIdsString}`);

                if (!isMounted) return;

                let finalData = {};
                let warnings = null;

                // Handle potential 207 Multi-Status response
                if (data && data.institutions !== undefined) {
                    finalData = data.institutions || {};
                    warnings = data.warnings;
                    if (warnings) console.warn("Partial fetch failure for receiving institutions:", warnings);
                } else {
                    finalData = data || {}; // Assume direct object if not 207 structure
                }

                if (Object.keys(finalData).length === 0 && !warnings) {
                     setError("No common receiving institutions found for the selected sending institutions.");
                }

                setAvailableReceivingInstitutions(finalData);
                cacheRef.current[memoryCacheKey] = finalData; // Store in memory

                // Store in localStorage
                try {
                    localStorage.setItem(localStorageKey, JSON.stringify(finalData));
                } catch (e) {
                    console.error(`Error writing receiving intersection to localStorage (${localStorageKey}):`, e);
                }

            } catch (err) {
                console.error("Error fetching common receiving institutions:", err);
                if (isMounted) {
                    setError(`Failed to load common receiving institutions: ${err.message}`);
                    setAvailableReceivingInstitutions({}); // Clear on error
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false); // Stop loading
                }
            }
        };

        fetchCommonReceiving();

        return () => {
            isMounted = false; // Cleanup
        };
    // Depend on the sorted string representation of sender IDs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [senderIdsString]);

    return { availableReceivingInstitutions, isLoading, error };
}
