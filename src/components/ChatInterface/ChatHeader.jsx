import React from 'react';

function ChatHeader({ selectedMajorName, isMajorsVisible, toggleMajorsVisibility }) {
    return (
        <div style={{
            padding: '8px 12px',
            borderBottom: '1px solid #ccc',
            backgroundColor: '#eee',
            fontSize: '0.9em',
            color: '#555',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        }}>
            <span>Chatting about: {selectedMajorName || "Selected Agreement"}</span>

            {!isMajorsVisible && (
                <button
                    onClick={toggleMajorsVisibility}
                    style={{
                        padding: '2px 6px',
                        fontSize: '0.8em',
                        marginLeft: '10px'
                    }}
                    className="btn btn-sm btn-outline-secondary"
                >
                    Show Majors
                </button>
            )}
        </div>
    );
}

export default ChatHeader;
