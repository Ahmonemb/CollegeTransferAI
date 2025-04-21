import React, { useState, useEffect } from 'react';
import { fetchData } from '../services/api';

function ChatInterface({ imageFilenames, selectedMajorName }) {
    const [messages, setMessages] = useState([]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [chatError, setChatError] = useState(null);

    // Clear chat when imageFilenames change (new agreement selected)
    useEffect(() => {
        setMessages([{ type: 'system', text: `Chatting about: ${selectedMajorName || 'Agreement'}` }]);
        setUserInput('');
        setChatError(null);
    }, [imageFilenames, selectedMajorName]);

    const handleSend = async () => {
        if (!userInput.trim() || isLoading || !imageFilenames || imageFilenames.length === 0) return;

        const userMessage = { type: 'user', text: userInput };
        setMessages(prev => [...prev, userMessage]);
        const currentInput = userInput; // Capture input before clearing
        setUserInput('');
        setIsLoading(true);
        setChatError(null);

        // --- Backend Call ---
        try {
            // *** Pass only 'chat' as the endpoint ***
            const response = await fetchData('chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: currentInput,
                    image_filenames: imageFilenames
                })
            });

            // Check if the response contains a reply
            if (response && response.reply) { // Check if response is not null
                 setMessages(prev => [...prev, { type: 'bot', text: response.reply }]);
            } else {
                 // If no reply, throw an error using the error message from the backend if available
                 // Check response object itself before accessing .error
                 throw new Error(response?.error || "No reply received or unexpected response format from chat API.");
            }
        } catch (err) {
            console.error("Chat API error:", err);
            // Display the error message to the user
            setChatError(`Failed to get response: ${err.message}`);
            // Optionally add a system message indicating the error
            setMessages(prev => [...prev, { type: 'system', text: `Error: ${err.message}` }]);
        } finally {
            setIsLoading(false);
        }
        // --- End Backend Call ---
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', border: '1px solid #ccc' }}>
            <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '10px' }}>
                {messages.map((msg, index) => (
                    <div key={index} style={{ marginBottom: '10px', textAlign: msg.type === 'user' ? 'right' : 'left' }}>
                        <span style={{
                            display: 'inline-block',
                            padding: '8px 12px',
                            borderRadius: '10px',
                            backgroundColor: msg.type === 'user' ? '#d1eaff' : (msg.type === 'system' ? '#f0f0f0' : '#e0e0e0'),
                            border: msg.type === 'system' ? '1px dashed #ccc' : 'none',
                            maxWidth: '80%'
                        }}>
                            {msg.text}
                        </span>
                    </div>
                ))}
                {isLoading && <p style={{ fontStyle: 'italic', textAlign: 'center' }}>Thinking...</p>}
                {chatError && <p style={{ color: 'red', textAlign: 'center' }}>{chatError}</p>}
            </div>
            <div style={{ display: 'flex', padding: '10px', borderTop: '1px solid #ccc' }}>
                <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Ask about the agreement..."
                    style={{ flexGrow: 1, marginRight: '10px', padding: '8px' }}
                    disabled={isLoading || !imageFilenames || imageFilenames.length === 0}
                />
                <button onClick={handleSend} disabled={isLoading || !userInput.trim() || !imageFilenames || imageFilenames.length === 0}>
                    Send
                </button>
            </div>
        </div>
    );
}

export default ChatInterface;
