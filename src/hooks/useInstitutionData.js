import { useState, useEffect } from 'react';
import { fetchData } from '../services/api';

const CACHE_KEY = "institutions";

export function useInstitutionData() {
    const [institutions, setInstitutions] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let isMounted = true;
        setIsLoading(true);
        setError(null);

        // --- Check Cache ---
        try {
            const cachedData = localStorage.getItem(CACHE_KEY);
            if (cachedData) {
                const parsedData = JSON.parse(cachedData);
                console.log("Loaded institutions from cache:", CACHE_KEY);
                if (isMounted) {
                    setInstitutions(parsedData);
                    setIsLoading(false);
                }
                return; // Exit early if loaded from cache
            }
        } catch (e) {
            console.error("Error loading institutions from cache:", e);
            localStorage.removeItem(CACHE_KEY); // Clear cache on error
        }

        // --- Fetch from API ---
        fetchData('institutions')
            .then(data => {
                if (isMounted) {
                    setInstitutions(data);
                    // --- Cache Result ---
                    try {
                        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
                        console.log("Institutions cached successfully:", CACHE_KEY);
                    } catch (e) {
                        console.error("Error caching institutions:", e);
                    }
                }
            })
            .catch(err => {
                if (isMounted) {
                    setError(`Failed to load institutions: ${err.message}`);
                    setInstitutions({}); // Clear on error
                }
            })
            .finally(() => {
                if (isMounted) {
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false; // Cleanup function to prevent state updates on unmounted component
        };
    }, []); // Empty dependency array means this runs once on mount

    return { institutions, isLoading, error };
}
