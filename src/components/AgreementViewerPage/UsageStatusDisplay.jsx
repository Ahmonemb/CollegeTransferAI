import React from 'react';

function UsageStatusDisplay({ user, usageStatus, countdown }) {
    if (!user || (usageStatus.usageLimit === null && !usageStatus.error)) {
        return null; // Don't display if not logged in or status not loaded (and no error)
    }

    return (
        <div style={{
            position: 'absolute',
            bottom: '10px',
            right: '20px',
            background: 'rgba(255, 255, 255, 0.8)',
            padding: '5px 10px',
            borderRadius: '4px',
            fontSize: '0.85em',
            color: usageStatus.error ? 'red' : '#555',
            border: '1px solid #ccc',
            zIndex: 10
        }}>
            {usageStatus.error ? (
                <span>{usageStatus.error}</span>
            ) : (
                <>
                    <span>Tier: {usageStatus.tier || 'N/A'} | </span>
                    <span>Usage: {usageStatus.usageCount ?? 'N/A'} / {usageStatus.usageLimit ?? 'N/A'} | </span>
                    <span>{countdown || 'Calculating reset...'}</span>
                </>
            )}
        </div>
    );
}

export default UsageStatusDisplay;
