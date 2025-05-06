import { useState, useEffect, useRef } from 'react';
import { fetchData } from '../services/api';

const LOCAL_STORAGE_PREFIX = 'ctaCache_';

export function useAcademicYears(selectedSendingInstitutions, selectedReceivingId) {
    const [academicYears, setAcademicYears] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const cacheRef = useRef({}); // Simple in-memory cache

    // Define senderIds and key outside useEffect
    const senderIds = selectedSendingInstitutions.map(s => s.id);
    const senderIdsString = senderIds.sort().join(',');
    const contextKey = `${senderIdsString}_${selectedReceivingId}`; // Key for cache/localStorage

    useEffect(() => {
        let isMounted = true;

        if (senderIds.length === 0 || !selectedReceivingId) {
            setAcademicYears({});
            setIsLoading(false);
            setError(null);
            return; // Clear years if selections are incomplete
        }

        const fetchCommonYears = async () => {
            if (!isMounted) return;
            setIsLoading(true);
            setError(null);
            setAcademicYears({}); // Clear previous results

            const localStorageKey = `${LOCAL_STORAGE_PREFIX}years_intersection_${contextKey}`;
            const memoryCacheKey = `years_${contextKey}`;

            // 1. Check In-Memory Cache
            if (cacheRef.current[memoryCacheKey]) {
                console.log(`In-memory cache hit for years intersection: ${contextKey}`);
                setAcademicYears(cacheRef.current[memoryCacheKey]);
                setIsLoading(false);
                return;
            }

            // 2. Check localStorage
            try {
                const cachedDataString = localStorage.getItem(localStorageKey);
                if (cachedDataString) {
                    console.log(`LocalStorage hit for years intersection (${localStorageKey})`);
                    const cachedData = JSON.parse(cachedDataString);
                    cacheRef.current[memoryCacheKey] = cachedData; // Update in-memory
                    setAcademicYears(cachedData);
                    setIsLoading(false);
                    return;
                }
            } catch (e) {
                console.error(`Error reading years intersection from localStorage (${localStorageKey}):`, e);
                localStorage.removeItem(localStorageKey);
            }

            // 3. Fetch from API (Single Call)
            console.log(`Cache miss for years intersection (${contextKey}). Fetching...`);
            try {
                // Pass comma-separated sending IDs and single receiving ID
                const data = await fetchData(`academic-years?sendingId=${senderIdsString}&receivingId=${selectedReceivingId}`);

                if (!isMounted) return;

                let finalData = {};
                let warnings = null;

                // Handle potential 207 Multi-Status response
                if (data && data.years !== undefined) {
                    finalData = data.years || {};
                    warnings = data.warnings;
                    if (warnings) console.warn("Partial fetch failure for academic years:", warnings);
                } else {
                    finalData = data || {}; // Assume direct object if not 207 structure
                }

                 if (Object.keys(finalData).length === 0 && !warnings) {
                     setError("No common academic years found for the selected combination.");
                 }

                setAcademicYears(finalData);
                cacheRef.current[memoryCacheKey] = finalData; // Store in memory

                // Store in localStorage
                try {
                    localStorage.setItem(localStorageKey, JSON.stringify(finalData));
                } catch (e) {
                    console.error(`Error writing years intersection to localStorage (${localStorageKey}):`, e);
                }

            } catch (err) {
                console.error("Error fetching common academic years:", err);
                if (isMounted) {
                    setError(`Failed to load common academic years: ${err.message}`);
                    setAcademicYears({}); // Clear on error
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false); // Stop loading
                }
            }
        };

        fetchCommonYears();

        return () => {
            isMounted = false; // Cleanup
        };
    // Depend on the sorted string of sender IDs and the receiver ID
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [senderIdsString, selectedReceivingId]);

    return { academicYears, isLoading, error };
}
