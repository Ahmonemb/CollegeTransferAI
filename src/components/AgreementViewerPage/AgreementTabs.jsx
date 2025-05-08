import React from 'react';

function AgreementTabs({
    agreementData,
    activeTabIndex,
    handleTabClick,
}) {
    const tabBaseStyle = {
        padding: '10px 15px',
        border: 'none',
        cursor: 'pointer',
        fontWeight: 'normal',
        fontSize: '0.95em',
        textAlign: 'center',
        borderTopLeftRadius: '4px',
        borderTopRightRadius: '4px',
        marginRight: '2px',
    };

    const activeTabStyle = {
        ...tabBaseStyle,
        borderBottom: '3px solid #0056b3',
        background: '#ffffff',
        color: '#0056b3',
        fontWeight: 'bold',
        borderTop: 'none',
        borderLeft: 'none',
        borderRight: 'none',
    };

    const inactiveTabStyle = {
        ...tabBaseStyle,
        borderBottom: '3px solid transparent',
        background: '#e9ecef',
        color: '#495057',
        borderTop: '1px solid #dee2e6',
        borderLeft: '1px solid #dee2e6',
        borderRight: '1px solid #dee2e6',
    };

    return (
        <div style={{ display: 'flex', borderBottom: '1px solid #ccc', flexShrink: 0, background: '#e9ecef' }}>
            {agreementData.map((agreement, index) => (
                <button
                    key={agreement.sendingId}
                    onClick={() => handleTabClick(index)}
                    style={activeTabIndex === index ? activeTabStyle : inactiveTabStyle}
                    title={`View agreement from ${agreement.sendingName}`}
                    disabled={!agreement.pdfFilename}
                >
                    {agreement.sendingName}
                </button>
            ))}
        </div>
    );
}

export default AgreementTabs;
