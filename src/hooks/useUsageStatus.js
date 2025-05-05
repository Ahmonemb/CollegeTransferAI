import { useState, useEffect } from 'react';
import { fetchData } from '../services/api'; // Assuming api.js is in services

// Helper function (can be moved to a utils file)
function formatRemainingTime(resetTimestamp) {
    if (!resetTimestamp) return '';
    const now = new Date();
    const resetDate = new Date(resetTimestamp);
    const diff = resetDate.getTime() - now.getTime();

    if (diff <= 0) return 'Usage reset';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return `Resets in ${hours}h ${minutes}m ${seconds}s`;
}

export function useUsageStatus(user, userTier) {
    const [usageStatus, setUsageStatus] = useState({
        usageCount: null,
        usageLimit: null,
        resetTime: null,
        tier: userTier || null,
        error: null,
    });
    const [countdown, setCountdown] = useState('');

    // Fetch User Usage Status
    useEffect(() => {
        setUsageStatus(prev => ({ ...prev, tier: userTier }));

        if (!user || !user.idToken) {
            setUsageStatus({ usageCount: null, usageLimit: null, resetTime: null, tier: userTier, error: 'Not logged in' });
            return;
        }

        const fetchStatus = async () => {
            try {
                const status = await fetchData('/user-status', { // This path is likely correct if fetchData adds /api
                    headers: { 'Authorization': `Bearer ${user.idToken}` }
                });
                // --- Use the correct keys from the backend response ---
                setUsageStatus({
                    usageCount: status.usageCount, // Use camelCase
                    usageLimit: status.usageLimit, // Use camelCase
                    resetTime: status.resetTime,   // Use camelCase
                    tier: status.tier,
                    error: null,
                });
            } catch (err) {
                console.error("Error fetching usage status:", err);
                setUsageStatus(prev => ({ ...prev, error: err.message || 'Failed to fetch usage status' }));
            }
        };

        fetchStatus();
    }, [user, userTier]);

    // Countdown Timer Logic
    useEffect(() => {
        if (!usageStatus.resetTime) {
            setCountdown('');
            return;
        }

        const initialRemaining = formatRemainingTime(usageStatus.resetTime);
        setCountdown(initialRemaining);

        if (initialRemaining === 'Usage reset') {
            return;
        }

        const intervalId = setInterval(() => {
            const remaining = formatRemainingTime(usageStatus.resetTime);
            setCountdown(remaining);
            if (remaining === 'Usage reset') {
                clearInterval(intervalId);
                // Optionally refetch usage status after reset
            }
        }, 1000);

        return () => clearInterval(intervalId);
    }, [usageStatus.resetTime]);

    return { usageStatus, countdown };
}
