import { useState, useEffect, useRef } from 'react';
import { fetchData } from '../services/api';

const LOCAL_STORAGE_PREFIX = 'ctaCache_';

export function useReceivingInstitutions(selectedSendingInstitutions) {
    const [availableReceivingInstitutions, setAvailableReceivingInstitutions] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const cacheRef = useRef({}); 

    const senderIds = selectedSendingInstitutions.map(s => s.id);
    const senderIdsString = senderIds.sort().join(','); 

    useEffect(() => {
        let isMounted = true;

        if (senderIds.length === 0) {
            setAvailableReceivingInstitutions({});
            setIsLoading(false);
            setError(null);
            return; 
        }

        const fetchCommonReceiving = async () => {
            if (!isMounted) return;
            setIsLoading(true);
            setError(null);
            setAvailableReceivingInstitutions({}); 

            const localStorageKey = `${LOCAL_STORAGE_PREFIX}receiving_intersection_${senderIdsString}`;
            const memoryCacheKey = `receiving_${senderIdsString}`;

            if (cacheRef.current[memoryCacheKey]) {
                console.log(`In-memory cache hit for receiving intersection: ${senderIdsString}`);
                setAvailableReceivingInstitutions(cacheRef.current[memoryCacheKey]);
                setIsLoading(false);
                return;
            }

            try {
                const cachedDataString = localStorage.getItem(localStorageKey);
                if (cachedDataString) {
                    console.log(`LocalStorage hit for receiving intersection (${localStorageKey})`);
                    const cachedData = JSON.parse(cachedDataString);
                    cacheRef.current[memoryCacheKey] = cachedData; 
                    setAvailableReceivingInstitutions(cachedData);
                    setIsLoading(false);
                    return;
                }
            } catch (e) {
                console.error(`Error reading receiving intersection from localStorage (${localStorageKey}):`, e);
                localStorage.removeItem(localStorageKey);
            }

            console.log(`Cache miss for receiving intersection (${senderIdsString}). Fetching...`);
            try {
                const data = await fetchData(`receiving-institutions?sendingId=${senderIdsString}`);

                if (!isMounted) return;

                let finalData = {};
                let warnings = null;

                if (data && data.institutions !== undefined) {
                    finalData = data.institutions || {};
                    warnings = data.warnings;
                    if (warnings) console.warn("Partial fetch failure for receiving institutions:", warnings);
                } else {
                    finalData = data || {}; 
                }

                if (Object.keys(finalData).length === 0 && !warnings) {
                     setError("No common receiving institutions found for the selected sending institutions.");
                }

                setAvailableReceivingInstitutions(finalData);
                cacheRef.current[memoryCacheKey] = finalData; 

                try {
                    localStorage.setItem(localStorageKey, JSON.stringify(finalData));
                } catch (e) {
                    console.error(`Error writing receiving intersection to localStorage (${localStorageKey}):`, e);
                }

            } catch (err) {
                console.error("Error fetching common receiving institutions:", err);
                if (isMounted) {
                    setError(`Failed to load common receiving institutions: ${err.message}`);
                    setAvailableReceivingInstitutions({}); 
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false); 
                }
            }
        };

        fetchCommonReceiving();

        return () => {
            isMounted = false; 
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [senderIdsString]);

    return { availableReceivingInstitutions, isLoading, error };
}
