import React from 'react';
import { formatText } from '../../utils/formatText'; 

function ChatMessage({ msg, userName }) {
    return (
        <div style={{ marginBottom: '10px', display: 'flex', justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start' }}>
            <span style={{
                display: 'inline-block',
                padding: '8px 12px',
                borderRadius: '15px',
                backgroundColor: msg.type === 'user' ? '#007bff' : (msg.type === 'system' ? '#f8d7da' : '#e9ecef'),
                color: msg.type === 'user' ? 'white' : (msg.type === 'system' ? '#721c24' : '#333'),
                border: msg.type === 'system' ? '1px solid #f5c6cb' : 'none',
                maxWidth: '80%',
                wordWrap: 'break-word',
                whiteSpace: 'pre-wrap' 
            }}>
                {msg.type === 'bot' && <strong style={{ marginRight: '5px' }}>AI:</strong>}
                {msg.type === 'user' && <strong style={{ marginRight: '5px' }}>{userName || 'You'}:</strong>}
                {formatText(msg.text)}
            </span>
        </div>
    );
}

export default ChatMessage;
