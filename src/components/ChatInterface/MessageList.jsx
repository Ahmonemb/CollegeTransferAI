import React, { useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import SignInPrompt from './SignInPrompt';

function MessageList({ messages, isLoading, chatError, user, userName, placeholderText }) {
    const messagesEndRef = useRef(null);

    // Scroll to bottom effect
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <div style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            padding: '10px',
            minHeight: 0,
            backgroundColor: !user ? '#e9ecef' : '#f9f9f9' // Subtle background change if not logged in
        }}>
            {!user && <SignInPrompt />}

            {/* Display messages only if user is logged in */}
            {user && messages.length === 0 && !isLoading && (
                <div style={{ textAlign: 'center', color: '#888', marginTop: '20px' }}>
                    {placeholderText}
                </div>
            )}
            {user && messages.map((msg, index) => (
                <ChatMessage key={index} msg={msg} userName={userName} />
            ))}
            <div ref={messagesEndRef} />
            {/* Error Indicator (only show if user is logged in) */}
            {user && chatError && !isLoading && <p style={{ color: 'red', textAlign: 'center', fontWeight: 'bold' }}>{chatError}</p>}
        </div>
    );
}

export default MessageList;
