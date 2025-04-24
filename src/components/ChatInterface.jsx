import React, { useState, useEffect, useRef } from 'react'; // Make sure useRef is imported if needed elsewhere
import { fetchData } from '../services/api';

function ChatInterface({ imageFilenames, selectedMajorName }) {
    const [userInput, setUserInput] = useState('');
    const [messages, setMessages] = useState([]); // State to hold the conversation history
    const [isLoading, setIsLoading] = useState(false);
    const [chatError, setChatError] = useState(null);
    const [messageNum, setMessageNum] = useState(0); // Track the number of messages sent/received pairs

    // Ref for scrolling
    const messagesEndRef = useRef(null);

    // Scroll to bottom effect
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]); // Trigger scroll whenever messages update

    // Clear chat and reset message count when agreement context changes
    useEffect(() => {
        setMessages([]); // Clear history
        setUserInput('');
        setChatError(null);
        setMessageNum(0); // Reset message counter for new agreement
        console.log("Chat cleared due to new agreement context.");
    }, [imageFilenames, selectedMajorName]); // Depend on the context identifiers

    const handleSend = async () => {
        // Basic guard: Check for input, loading state.
        // Allow sending even if imageFilenames is empty *after* the first message.
        if (!userInput.trim() || isLoading) return;
        // Guard specifically for the *first* message if images are required then.
        if (messageNum < 1 && (!imageFilenames || imageFilenames.length === 0)) {
             console.warn("Attempted to send first message without image filenames.");
             setChatError("Agreement images not loaded yet. Cannot start chat."); // Inform user
             return;
        }


        const currentInput = userInput; // Capture input before clearing
        const currentHistory = [...messages]; // Capture history *before* adding the new user message

        // Add user message to local state immediately for UI responsiveness
        setMessages(prev => [...prev, { type: 'user', text: currentInput }]);
        setUserInput(''); // Clear input field
        setIsLoading(true);
        setChatError(null);

        // --- Prepare data for Backend ---
        // Map frontend message state to the format expected by the backend/OpenAI
        const apiHistory = currentHistory.map(msg => ({
            role: msg.type === 'bot' ? 'assistant' : msg.type, // Map 'bot' to 'assistant'
            content: msg.text // Assuming simple text content for history
            // NOTE: This simple mapping assumes previous messages didn't contain complex content like images.
            // If the assistant could previously return images, or if user could upload images mid-convo,
            // the 'content' structure here and in the backend would need to be more robust.
        }));

        const payload = {
            new_message: currentInput,
            history: apiHistory
        };

        // Add image_filenames only for the very first message (messageNum is 0)
        const shouldSendImages = messageNum < 1;
        if (shouldSendImages) {
            payload.image_filenames = imageFilenames;
            console.log("Sending image filenames with the first message.");
        }

        // --- Backend Call ---
        try {
            console.log("Sending to /chat:", payload); // Log what's being sent
            const response = await fetchData('chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload) // Send new message, history, and optional images
            });

            // Check if the response contains a reply
            if (response && response.reply) {
                 // Add bot reply to local state
                 setMessages(prev => [...prev, { type: 'bot', text: response.reply }]);
                 setMessageNum(prev => prev + 1); // Increment message counter *after* successful round trip
            } else {
                 // Handle cases where backend might return an error structure differently
                 throw new Error(response?.error || "No reply received or unexpected response format from chat API.");
            }
        } catch (err) {
            console.error("Chat API error:", err);
            setChatError(`Failed to get response: ${err.message}`);
            // Optionally add a system message indicating the error, or revert the user message
            // Reverting might be complex, adding a system error is simpler:
            setMessages(prev => [...prev, { type: 'system', text: `Error: ${err.message}` }]);
        } finally {
            setIsLoading(false);
        }
        // --- End Backend Call ---
    };

    // Disable input/button logic adjusted:
    // Disable if loading.
    // Disable if it's the first message (messageNum === 0) AND imageFilenames are missing/empty.
    const isSendDisabled = isLoading || !userInput.trim() || (messageNum < 1 && (!imageFilenames || imageFilenames.length === 0));
    const placeholderText = (messageNum < 1 && (!imageFilenames || imageFilenames.length === 0))
        ? "Loading agreement context..."
        : "Ask about the agreement...";


    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', border: '1px solid #ccc', backgroundColor: '#f9f9f9' }}>
            {/* Optional Header */}
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #ccc', backgroundColor: '#eee', fontSize: '0.9em', color: '#555' }}>
                Chatting about: {selectedMajorName || "Selected Agreement"}
            </div>

            {/* Message Display Area */}
            <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '10px' }}>
                {messages.length === 0 && !isLoading && (
                    <div style={{ textAlign: 'center', color: '#888', marginTop: '20px' }}>
                        {placeholderText === "Loading agreement context..." ? placeholderText : "Ask a question about the selected transfer agreement."}
                    </div>
                )}
                {messages.map((msg, index) => (
                    <div key={index} style={{ marginBottom: '10px', display: 'flex', justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start' }}>
                        <span style={{
                            display: 'inline-block',
                            padding: '8px 12px',
                            borderRadius: '15px',
                            backgroundColor: msg.type === 'user' ? '#007bff' : (msg.type === 'system' ? '#f8d7da' : '#e9ecef'),
                            color: msg.type === 'user' ? 'white' : (msg.type === 'system' ? '#721c24' : '#333'),
                            border: msg.type === 'system' ? '1px solid #f5c6cb' : 'none',
                            maxWidth: '80%',
                            wordWrap: 'break-word' // Ensure long words break
                        }}>
                            {msg.text}
                        </span>
                    </div>
                ))}
                {/* Add a ref to the end of the messages list for scrolling */}
                <div ref={messagesEndRef} />
                {/* Loading/Error Indicators */}
                {isLoading && <p style={{ fontStyle: 'italic', textAlign: 'center', color: '#666' }}>Thinking...</p>}
                {chatError && !isLoading && <p style={{ color: 'red', textAlign: 'center', fontWeight: 'bold' }}>{chatError}</p>}
            </div>

            {/* Input Area */}
            <div style={{ display: 'flex', padding: '10px', borderTop: '1px solid #ccc', backgroundColor: '#f1f1f1' }}>
                <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !isSendDisabled && handleSend()}
                    placeholder={placeholderText}
                    style={{ flexGrow: 1, marginRight: '10px', padding: '10px', borderRadius: '20px', border: '1px solid #ccc' }}
                    disabled={isLoading || (messageNum < 1 && (!imageFilenames || imageFilenames.length === 0))} // Simplified disable logic
                />
                <button
                    onClick={handleSend}
                    disabled={isSendDisabled} // Use the combined disabled state
                    style={{ padding: '10px 15px', borderRadius: '20px', border: 'none', backgroundColor: '#007bff', color: 'white', cursor: isSendDisabled ? 'not-allowed' : 'pointer' }}
                >
                    Send
                </button>
            </div>
        </div>
    );
}

export default ChatInterface;
