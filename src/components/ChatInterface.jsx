import React, { useState, useEffect, useRef } from 'react';
import { fetchData } from '../services/api';

// Helper function to parse basic markdown (bold/italic/bullets)
function formatText(text) {
  if (!text) return ''; // Handle null or undefined text

  // 1. Pre-process lines for bullets ('* ' -> '• ')
  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    // Use trim() to handle potential leading whitespace before '*'
    if (line.trim().startsWith('* ')) {
      // Replace '* ' with '• ' and keep the rest of the line content
      // Use indexOf to find the first '*' to correctly handle indentation
      const starIndex = line.indexOf('*');
      const prefix = line.substring(0, starIndex); // Keep indentation
      return prefix + '• ' + line.substring(starIndex + 2);
    }
    return line;
  });
  const textWithBullets = processedLines.join('\n');

  // 2. Apply bold/italic formatting to the text with bullets
  const regex = /(\*\*.*?\*\*|`.*?`)/g; // Regex to find **bold** or `italic`
  let lastIndex = 0;
  const result = [];
  let match;

  try {
      // Use textWithBullets for bold/italic parsing
      while ((match = regex.exec(textWithBullets)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
          result.push(textWithBullets.substring(lastIndex, match.index));
        }

        const matchedText = match[0];
        // Add bold or italic element
        if (matchedText.startsWith('**') && matchedText.endsWith('**')) {
          // Ensure content exists before slicing
          const content = matchedText.length > 4 ? matchedText.slice(2, -2) : '';
          result.push(<strong key={`bold-${lastIndex}`}>{content}</strong>); // Use unique keys
        } else if (matchedText.startsWith('`') && matchedText.endsWith('`')) {
           // Ensure content exists before slicing
          const content = matchedText.length > 2 ? matchedText.slice(1, -1) : '';
          result.push(<em key={`italic-${lastIndex}`}>{content}</em>); // Use unique keys
        } else {
           // Should not happen with this regex, but as fallback, add the raw match
           result.push(matchedText);
        }

        lastIndex = regex.lastIndex;
      }

      // Add any remaining text after the last match
      if (lastIndex < textWithBullets.length) {
        result.push(textWithBullets.substring(lastIndex));
      }

      // Filter out potential empty strings and ensure valid React children
      return result.filter(part => part !== null && part !== '');
   } catch (error) {
       console.error("Error formatting text:", error, "Original text:", text);
       return text; // Return original text on error
   }
}

// Accept new props: isMajorsVisible, toggleMajorsVisibility
function ChatInterface({ imageFilenames, selectedMajorName, userName, isMajorsVisible, toggleMajorsVisibility }) {
    const [userInput, setUserInput] = useState('');
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [chatError, setChatError] = useState(null);

    const messagesEndRef = useRef(null);
    const initialAnalysisSentRef = useRef(false); // Ref to track if initial analysis was sent

    // --- Add this useEffect to log messages ---
    useEffect(() => {
        console.log("Current message history:", messages);
    }, [messages]); // Run whenever the messages array changes
    // --- End logging effect ---

    // Scroll to bottom effect
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Clear chat and reset flag when agreement context changes
    useEffect(() => {
        setMessages([]);
        setUserInput('');
        setChatError(null);
        initialAnalysisSentRef.current = false; // Reset flag for new agreement
        console.log("Chat cleared due to new agreement context.");
    }, [imageFilenames, selectedMajorName]);

    // Effect to send initial analysis request when images are loaded
    useEffect(() => {
        // Run only if:
        // - We have image filenames.
        // - Analysis hasn't been sent for this context yet.
        // - We are not currently loading anything (prevents race conditions).
        if (imageFilenames && imageFilenames.length > 0 && !initialAnalysisSentRef.current && !isLoading) {

            const sendInitialAnalysis = async () => {
                console.log("Sending initial analysis request...");
                setIsLoading(true);
                setChatError(null);
                initialAnalysisSentRef.current = true; // Mark as sent for this context

                // --- Updated Initial Prompt ---
                const initialPrompt = `You are a helpful, knowledgeable, and supportive college counselor specializing in helping community college students successfully transfer to four-year universities. Your guidance should be clear, encouraging, and personalized based on each student's academic goals, major, preferred universities, and career aspirations. You provide information about transfer requirements, application tips, deadlines, articulation agreements, financial aid, scholarships, and campus life insights. Always empower students with accurate, up-to-date information and a positive, motivating tone. If you don't know an answer, offer to help them find resources or suggest next steps.

Analyze the provided agreement images thoroughly. In your response, **first provide a concise summary of the key details found in the agreement**, including articulated courses, non-articulated courses, requirements, and any important notes or conditions. After the summary, answer the user's potential implicit question based on the analysis (e.g., how many courses are not articulated, suggest next steps/institutions if applicable based on proximity or course needs).

**Please format key details, lists (like courses or requirements), and action items using bullet points (* or -). Use **bold** for emphasis on key terms or numbers, and \`italic\` for specific course codes or titles where appropriate.**

**Important:** If the user asks about the details of the agreement being discussed (like the major, institutions, or year), refer to the context provided or the summary you generated. Do not state that you lack personal information about the user in this case.`;
                // --- End Updated Initial Prompt ---

                // Display a system message while analysis runs
                setMessages([{ type: 'system', text: "Analyzing agreement and generating summary..." }]);

                const payload = {
                    new_message: initialPrompt,
                    history: [], // No history for the very first message
                    image_filenames: imageFilenames // Send images with this first request
                };

                try {
                    console.log("Sending initial analysis to /chat:", payload);
                    const response = await fetchData('chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    if (response && response.reply) {
                        // --- Removed cleaning to allow '*' for bullets ---
                        // const cleanedReply = response.reply.replace(/[*`]/g, '');
                        const replyText = response.reply; // Use raw reply
                        // Replace "Analyzing..." message with the actual reply
                        setMessages([{ type: 'bot', text: replyText }]);
                    } else {
                        throw new Error(response?.error || "No reply received for initial analysis.");
                    }
                } catch (err) {
                    console.error("Initial analysis API error:", err);
                    const errorMsg = `Failed initial analysis: ${err.message}`;
                    setChatError(errorMsg);
                    // Replace "Analyzing..." message with an error message
                    setMessages([{ type: 'system', text: `Error during analysis: ${err.message}` }]);
                    // Keep initialAnalysisSentRef true to prevent retries on error for this context
                } finally {
                    setIsLoading(false);
                }
            };

            sendInitialAnalysis();
        }
        // This effect depends on imageFilenames to know when context is ready,
        // and isLoading to avoid running while another request is in progress.
    }, [imageFilenames, isLoading]);


    const handleSend = async () => {
        // Guard: Check for input, loading state.
        if (!userInput.trim() || isLoading) return;

        // User can only send manually *after* the initial analysis is attempted.

        const currentInput = userInput;
        const currentHistory = [...messages];

        // Add user message to local state
        setMessages(prev => [...prev, { type: 'user', text: currentInput }]);
        setUserInput('');
        setIsLoading(true);
        setChatError(null);

        // Prepare history for API
        const apiHistory = currentHistory.map(msg => ({
            role: msg.type === 'bot' ? 'assistant' : msg.type,
            content: msg.text
        }));

        // Payload for subsequent messages (no image_filenames needed)
        const payload = {
            new_message: currentInput,
            history: apiHistory
        };

        // --- Backend Call ---
        try {
            console.log("Sending to /chat:", JSON.stringify(payload));
            const response = await fetchData('chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (response && response.reply) {
                 // --- Removed cleaning to allow '*' for bullets ---
                 // const cleanedReply = response.reply.replace(/[*`]/g, '');
                 const replyText = response.reply; // Use raw reply
                 setMessages(prev => [...prev, { type: 'bot', text: replyText }]);
            } else {
                 throw new Error(response?.error || "No reply received or unexpected response format.");
            }
        } catch (err) {
            console.error("Chat API error:", err);
            setChatError(`Failed to get response: ${err.message}`);
            setMessages(prev => [...prev, { type: 'system', text: `Error: ${err.message}` }]);
        } finally {
            setIsLoading(false);
        }
        // --- End Backend Call ---
    };

    // Disable input/button if loading (covers initial analysis and subsequent messages)
    const isSendDisabled = isLoading || !userInput.trim();
    // Adjust placeholder based on loading state and if messages exist
    const placeholderText = isLoading
        ? (messages.length === 0 ? "Analyzing agreement..." : "Thinking...") // More specific loading text
        : (messages.length === 0 ? "Select an agreement to start." : "Ask a follow-up question..."); // Default placeholder


    return (
        <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid #ccc',
            backgroundColor: '#f9f9f9'
        }}>
            {/* Chat Header */}
            <div style={{
                padding: '8px 12px',
                borderBottom: '1px solid #ccc',
                backgroundColor: '#eee',
                fontSize: '0.9em',
                color: '#555',
                display: 'flex', // Use flex to position button
                justifyContent: 'space-between', // Space between title and button
                alignItems: 'center' // Vertically align items
            }}>
                {/* Title */}
                <span>Chatting about: {selectedMajorName || "Selected Agreement"}</span>

                {/* --- Show Majors Button (Conditional) --- */}
                {!isMajorsVisible && (
                    <button
                        onClick={toggleMajorsVisibility} // Use the passed function
                        style={{
                            padding: '2px 6px', // Smaller padding
                            fontSize: '0.8em', // Smaller font
                            marginLeft: '10px' // Add some space
                        }}
                        className="btn btn-sm btn-outline-secondary"
                    >
                        Show Majors
                    </button>
                )}
                {/* --- End Show Majors Button --- */}
            </div>

            {/* Message Display Area */}
            <div style={{
                flex: '1 1 auto',
                overflowY: 'auto',
                padding: '10px',
                minHeight: 0
            }}>
                {/* Display placeholder only if not loading and no messages */}
                {messages.length === 0 && !isLoading && (
                    <div style={{ textAlign: 'center', color: '#888', marginTop: '20px' }}>
                        {placeholderText}
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
                            wordWrap: 'break-word',
                            whiteSpace: 'pre-wrap' // Crucial for rendering newlines and spaces correctly
                        }}>
                            {/* Add Prefix based on type */}
                            {msg.type === 'bot' && <strong style={{ marginRight: '5px' }}>AI:</strong>}
                            {msg.type === 'user' && <strong style={{ marginRight: '5px' }}>{userName}:</strong>}
                            {/* Render formatted text */}
                            {formatText(msg.text)}
                        </span>
                    </div>
                ))}
                <div ref={messagesEndRef} />
                {/* Error Indicator */}
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
                    disabled={isLoading} // Only disable when loading
                />
                <button
                    onClick={handleSend}
                    disabled={isSendDisabled}
                    style={{ padding: '10px 15px', borderRadius: '20px', border: 'none', backgroundColor: '#007bff', color: 'white', cursor: isSendDisabled ? 'not-allowed' : 'pointer' }}
                >
                    Send
                </button>
            </div>
        </div>
    );
}

export default ChatInterface;
