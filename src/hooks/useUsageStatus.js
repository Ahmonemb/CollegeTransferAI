import { useState, useEffect } from 'react';
import { fetchData } from '../services/api'; 

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

    useEffect(() => {
        setUsageStatus(prev => ({ ...prev, tier: userTier }));

        if (!user || !user.idToken) {
            setUsageStatus({ usageCount: null, usageLimit: null, resetTime: null, tier: userTier, error: 'Not logged in' });
            return;
        }

        const fetchStatus = async () => {
            try {
                const status = await fetchData('/user-status', { 
                    headers: { 'Authorization': `Bearer ${user.idToken}` }
                });
                setUsageStatus({
                    usageCount: status.usageCount, 
                    usageLimit: status.usageLimit, 
                    resetTime: status.resetTime,   
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
            }
        }, 1000);

        return () => clearInterval(intervalId);
    }, [usageStatus.resetTime]);

    return { usageStatus, countdown };
}
