import { useState, useEffect, useRef } from 'react';
import { fetchData } from '../services/api';

const LOCAL_STORAGE_PREFIX = 'ctaCache_';

export function useAcademicYears(selectedSendingInstitutions, selectedReceivingId) {
    const [academicYears, setAcademicYears] = useState({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const cacheRef = useRef({});
    const senderIds = selectedSendingInstitutions.map(s => s.id);
    const senderIdsString = senderIds.sort().join(',');
    const contextKey = `${senderIdsString}_${selectedReceivingId}`;

    useEffect(() => {
        let isMounted = true;

        if (senderIds.length === 0 || !selectedReceivingId) {
            setAcademicYears({});
            setIsLoading(false);
            setError(null);
            return;
        }

        const fetchCommonYears = async () => {
            if (!isMounted) return;
            setIsLoading(true);
            setError(null);
            setAcademicYears({});

            const localStorageKey = `${LOCAL_STORAGE_PREFIX}years_intersection_${contextKey}`;
            const memoryCacheKey = `years_${contextKey}`;
            if (cacheRef.current[memoryCacheKey]) {
                console.log(`In-memory cache hit for years intersection: ${contextKey}`);
                setAcademicYears(cacheRef.current[memoryCacheKey]);
                setIsLoading(false);
                return;
            }
            try {
                const cachedDataString = localStorage.getItem(localStorageKey);
                if (cachedDataString) {
                    console.log(`LocalStorage hit for years intersection (${localStorageKey})`);
                    const cachedData = JSON.parse(cachedDataString);
                    cacheRef.current[memoryCacheKey] = cachedData;
                    setAcademicYears(cachedData);
                    setIsLoading(false);
                    return;
                }
            } catch (e) {
                console.error(`Error reading years intersection from localStorage (${localStorageKey}):`, e);
                localStorage.removeItem(localStorageKey);
            }
            console.log(`Cache miss for years intersection (${contextKey}). Fetching...`);
            try {
                const data = await fetchData(`academic-years?sendingId=${senderIdsString}&receivingId=${selectedReceivingId}`);

                if (!isMounted) return;

                let finalData = {};
                let warnings = null;
                if (data && data.years !== undefined) {
                    finalData = data.years || {};
                    warnings = data.warnings;
                    if (warnings) console.warn("Partial fetch failure for academic years:", warnings);
                } else {
                    finalData = data || {};
                }

                 if (Object.keys(finalData).length === 0 && !warnings) {
                     setError("No common academic years found for the selected combination.");
                 }

                setAcademicYears(finalData);
                cacheRef.current[memoryCacheKey] = finalData;
                try {
                    localStorage.setItem(localStorageKey, JSON.stringify(finalData));
                } catch (e) {
                    console.error(`Error writing years intersection to localStorage (${localStorageKey}):`, e);
                }

            } catch (err) {
                console.error("Error fetching common academic years:", err);
                if (isMounted) {
                    setError(`Failed to load common academic years: ${err.message}`);
                    setAcademicYears({});
                }
            } finally {
                if (isMounted) {
                    setIsLoading(false);
                }
            }
        };

        fetchCommonYears();

        return () => {
            isMounted = false;
        };
    }, [senderIdsString, selectedReceivingId]);

    return { academicYears, isLoading, error };
}
