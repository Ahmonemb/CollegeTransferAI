import React, { useEffect, useRef } from 'react';
import ChatMessage from './ChatMessage';
import SignInPrompt from './SignInPrompt';

function MessageList({ messages, isLoading, chatError, user, userName, placeholderText }) {
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <div style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            padding: '10px',
            minHeight: 0,
            backgroundColor: !user ? '#e9ecef' : '#f9f9f9' 
        }}>
            {!user && <SignInPrompt />}

            {user && messages.length === 0 && !isLoading && (
                <div style={{ textAlign: 'center', color: '#888', marginTop: '20px' }}>
                    {placeholderText}
                </div>
            )}
            {user && messages.map((msg, index) => (
                <ChatMessage key={index} msg={msg} userName={userName} />
            ))}
            <div ref={messagesEndRef} />
            {user && chatError && !isLoading && <p style={{ color: 'red', textAlign: 'center', fontWeight: 'bold' }}>{chatError}</p>}
        </div>
    );
}

export default MessageList;
