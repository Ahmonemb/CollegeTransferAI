import React from 'react';

function MessageInput({
    userInput,
    setUserInput,
    handleSend,
    placeholderText,
    isInteractionDisabled,
    isSendDisabled
}) {
    return (
        <div style={{ display: 'flex', padding: '10px', borderTop: '1px solid #ccc', backgroundColor: '#f1f1f1' }}>
            <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !isSendDisabled && handleSend()}
                placeholder={placeholderText}
                style={{ flexGrow: 1, marginRight: '10px', padding: '10px', borderRadius: '20px', border: '1px solid #ccc' }}
                disabled={isInteractionDisabled}
            />
            <button
                onClick={handleSend}
                disabled={isSendDisabled}
                style={{
                    padding: '10px 15px',
                    borderRadius: '20px',
                    border: 'none',
                    backgroundColor: '#007bff',
                    color: 'white',
                    cursor: isSendDisabled ? 'not-allowed' : 'pointer',
                    opacity: isSendDisabled ? 0.6 : 1
                }}
            >
                Send
            </button>
        </div>
    );
}

export default MessageInput;
