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

// Accept new props for context
function ChatInterface({
    allContextImageFilenames, // <-- NEW: Combined list for payload
    imageFilenames, // Keep if needed for display logic or initial prompt details
    // allAgreementsImageFilenames, // Keep if needed for initial prompt details
    selectedMajorName,
    userName, // Keep userName prop for display when logged in
    isMajorsVisible,
    toggleMajorsVisibility,
    sendingInstitutionId, // ID for the currently viewed agreement (Current Context)
    allSendingInstitutionIds, // Array of all selected sending IDs (Overall Context)
    receivingInstitutionId,
    academicYearId,
    user // Add user prop
}) {
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

    // Clear chat and reset flag when agreement context changes OR user logs out
    useEffect(() => {
        setMessages([]);
        setUserInput('');
        setChatError(null);
        initialAnalysisSentRef.current = false; // Reset flag
        console.log("Chat cleared due to new context or user change.");
    }, [imageFilenames, selectedMajorName, user]); // Add user dependency here

    // Effect to send initial analysis request when images are loaded
    useEffect(() => {
        // --- Add user check at the beginning ---
        if (!user) {
            initialAnalysisSentRef.current = false; // Ensure flag is reset if user logs out
            return; // Don't proceed if user is not logged in
        }
        // --- End user check ---

        // Run only if:
        // - We have image filenames.
        // - Analysis hasn't been sent for this context yet.
        // - We are not currently loading anything (prevents race conditions).
        // - User is logged in (checked above)
        if (allContextImageFilenames && allContextImageFilenames.length > 0 && !initialAnalysisSentRef.current && !isLoading) {

            const sendInitialAnalysis = async () => {
                // User/token check is still good practice here, though the outer effect also checks
                if (!user || !user.idToken) {
                    console.error("Cannot send initial analysis: User not logged in or token missing.");
                    setChatError("Authentication error. Please log in again.");
                    setMessages([{ type: 'system', text: "Authentication error. Please log in again." }]);
                    initialAnalysisSentRef.current = false; // Allow retry if user logs in
                    return; // Stop execution
                }

                console.log("Sending initial analysis request...");
                setIsLoading(true);
                setChatError(null);
                initialAnalysisSentRef.current = true; // Mark as sent for this context

                const currentContextInfo = `The user is viewing an articulation agreement for the academic year ${academicYearId || 'N/A'} between sending institution ID ${sendingInstitutionId || 'N/A'} (the 'current' agreement) and receiving institution ID ${receivingInstitutionId || 'N/A'}. The selected major/department is "${selectedMajorName || 'N/A'}".`;
                const overallContextInfo = allSendingInstitutionIds && allSendingInstitutionIds.length > 1
                    ? `Note: The user originally selected multiple sending institutions (IDs: ${allSendingInstitutionIds.join(', ')}). Images for all selected agreements have been provided.`
                    : 'Only one sending institution was selected.';

                // --- MODIFIED Initial Prompt ---
                const initialPrompt = `You are a helpful, knowledgeable, and supportive college counselor specializing in helping community college students successfully transfer to four-year universities. Your guidance should be clear, encouraging, and personalized based on each student's academic goals, major, preferred universities, and career aspirations. You provide information about transfer requirements, application tips, deadlines, articulation agreements, financial aid, scholarships, and campus life insights. Always empower students with accurate, up-to-date information and a positive, motivating tone. If you don't know an answer, offer to help them find resources or suggest next steps.

**Current Context:** ${currentContextInfo}
${overallContextInfo ? `**Overall Context:** ${overallContextInfo}` : ''}

Analyze the provided agreement images thoroughly. Perform the following steps:
1.  **Focus on the Current Context:** Analyze the agreement for the major between the **current sending institution** and the receiving institution.
2.  **Explicitly state the current context:** Start your response with: "Analyzing the agreement for the **[Major Name]** major between **[Current Sending Institution Name]** and **[Receiving Institution Name]** for the **[academic year name]** academic year." (Replace bracketed placeholders with actual names/year).
3.  **Provide a detailed, accurate, yet concise summary** of the key details for the **current** agreement. This summary should include:
    *   All articulated courses (sending course -> receiving course).
    *   Any specific GPA requirements mentioned.
    *   Any other critical requirements or notes from the agreement.
    *   Crucially, identify any required courses for the major at the receiving institution that are **not articulated** by the current sending institution according to this agreement. List these clearly.
4.  **Compare Articulation (If Applicable):** If you identified non-articulated courses in step 3 AND other sending institutions were selected (see Overall Context), examine the provided images for the **other** agreements (Sending IDs: ${allSendingInstitutionIds.filter(id => id !== sendingInstitutionId).join(', ') || 'None'}). For each non-articulated course from the current agreement, state whether it **is articulated** by any of the **other** sending institutions based on their respective agreements. Present this comparison clearly, perhaps in a separate section or list (e.g., "Comparison with Other Selected Colleges:").
5.  **Suggest Next Steps:** Conclude with relevant advice or next steps for the student based on the analysis and comparison.
6.  **Offer Education Plan:** After providing the analysis and next steps, ask the user: "Would you like me to generate a potential 2-year education plan based on this information? If yes, I will outline courses semester-by-semester (Year 1 Fall, Year 1 Spring, Year 1 Summer, Year 2 Fall, Year 2 Spring, Year 2 Summer) aiming for approximately 4 classes per Fall/Spring semester and 2 classes during the Summer. This plan will incorporate courses from the **[Sending Institution(s) names]** to meet the requirements for the **[Receiving Institution name]**. For each course, I will include its *unit count* and *check for common prerequisites* using my knowledge base. If the prerequisite information isn't readily available, I can perform a web search to find it. Importantly, I will ensure that any identified prerequisite course is placed in a semester *before* the course that requires it."

**Formatting:** Use bullet points (* or -) for lists, **bold** for emphasis (especially names and key terms), and \`italic\` for course codes/titles. Ensure the summary in step 3 is well-organized and easy to read.`;
                // --- End MODIFIED Initial Prompt ---

                // Display a system message while analysis runs
                setMessages([{ type: 'system', text: "Analyzing agreements and generating summary..." }]);

                const payload = {
                    new_message: initialPrompt,
                    history: [], // No history for the very first message
                    image_filenames: allContextImageFilenames // <-- USE COMBINED LIST
                };

                try {
                    console.log("Sending initial analysis to /chat:", payload);
                    const response = await fetchData('chat', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${user.idToken}`
                        },
                        body: JSON.stringify(payload)
                    });

                    if (response && response.reply) {
                        const replyText = response.reply;
                        // Replace the "Analyzing..." message with the actual reply
                        setMessages([{ type: 'bot', text: replyText }]);
                    } else {
                        // Check specifically for auth error from backend response if possible
                        if (response?.error?.includes("Authorization")) {
                            throw new Error("Authorization token missing or invalid");
                        }
                        throw new Error(response?.error || "No reply received for initial analysis.");
                    }
                } catch (err) {
                    console.error("Initial analysis API error:", err);
                    const errorMsg = `Failed initial analysis: ${err.message}`;
                    setChatError(errorMsg);
                    // Replace "Analyzing..." with error message
                    setMessages([{ type: 'system', text: `Error during analysis: ${err.message}` }]);
                    // Consider resetting initialAnalysisSentRef.current = false; if the error is auth-related
                    if (err.message.includes("Authorization")) {
                        initialAnalysisSentRef.current = false;
                    }
                } finally {
                    setIsLoading(false);
                }
            };

            sendInitialAnalysis();
        }
        // This effect depends on imageFilenames to know when context is ready,
        // and isLoading to avoid running while another request is in progress.
        // Also depends on user to re-evaluate if user logs in/out
    }, [allContextImageFilenames, isLoading, selectedMajorName, sendingInstitutionId, allSendingInstitutionIds, receivingInstitutionId, academicYearId, user]);


    const handleSend = async () => {
        // Guard: Check for input, loading state, and user login
        if (!userInput.trim() || isLoading || !user) return;

        // User/token check (redundant with the main guard but safe)
        if (!user || !user.idToken) {
            console.error("Cannot send message: User not logged in or token missing.");
            setChatError("Authentication error. Please log in again.");
            setMessages(prev => [...prev, { type: 'system', text: "Authentication error. Please log in again." }]);
            return; // Stop execution
        }

        const currentInput = userInput;
        const currentHistory = [...messages];

        // Add user message to local state
        setMessages(prev => [...prev, { type: 'user', text: currentInput }]);
        setUserInput('');
        setIsLoading(true);
        setChatError(null);

        // Prepare history for API
        const apiHistory = currentHistory
            .filter(msg => msg.type === 'user' || msg.type === 'bot') // Only send user/bot messages as history
            .map(msg => ({
                role: msg.type === 'bot' ? 'assistant' : msg.type, // 'user' or 'assistant'
                content: msg.text
            }));

        // Payload for subsequent messages - NOW INCLUDES ACTIVE image_filenames
        const payload = {
            new_message: currentInput,
            history: apiHistory,
            // Send the filenames relevant to the currently active view
            image_filenames: allContextImageFilenames // <-- USE COMBINED LIST
        };

        // --- Backend Call ---
        try {
            console.log("Sending to /chat:", JSON.stringify(payload));
            const response = await fetchData('chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                     'Authorization': `Bearer ${user.idToken}`
                },
                body: JSON.stringify(payload)
            });

            if (response && response.reply) {
                 const replyText = response.reply;
                 setMessages(prev => [...prev, { type: 'bot', text: replyText }]);
            } else {
                 // Check specifically for auth error from backend response if possible
                 if (response?.error?.includes("Authorization")) {
                     throw new Error("Authorization token missing or invalid");
                 }
                 throw new Error(response?.error || "No reply received or unexpected response format.");
            }
        } catch (err) {
            console.error("Chat API error:", err);
            setChatError(`Failed to get response: ${err.message}`);
            // Add error message back to chat, but don't re-add user input
            setMessages(prev => [...prev, { type: 'system', text: `Error: ${err.message}` }]);
        } finally {
            setIsLoading(false);
        }
        // --- End Backend Call ---
    };

    // Disable input/button if loading OR if user is not logged in
    const isInteractionDisabled = isLoading || !user || !allContextImageFilenames || allContextImageFilenames.length === 0;
    const isSendDisabled = isInteractionDisabled || !userInput.trim();

    // Adjust placeholder based on loading state, user state, and agreement context
    const placeholderText = !user
        ? "Please sign in to use the chat feature."
        : (!allContextImageFilenames || allContextImageFilenames.length === 0)
            ? "Select a major/department to load agreements and chat." // Updated placeholder
            : isLoading
                ? (messages.length === 0 ? "Analyzing agreement..." : "Thinking...")
                : "Ask a follow-up question..."; // Placeholder when ready


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
                minHeight: 0,
                 // Add a subtle background change if user is not logged in
                backgroundColor: !user ? '#e9ecef' : '#f9f9f9'
            }}>
                {/* --- Show Sign-in Prompt if user is not logged in --- */}
                {!user && (
                    <div style={{ textAlign: 'center', color: '#6c757d', marginTop: '30px', padding: '20px', fontSize: '1.1em' }}>
                        Please sign in to analyze agreements and chat with the AI counselor.
                    </div>
                )}
                {/* --- End Sign-in Prompt --- */}

                {/* Display messages only if user is logged in */}
                {user && messages.length === 0 && !isLoading && (
                    <div style={{ textAlign: 'center', color: '#888', marginTop: '20px' }}>
                        {placeholderText}
                    </div>
                )}
                {user && messages.map((msg, index) => (
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
                            {/* Use userName prop if available, otherwise fallback */}
                            {msg.type === 'user' && <strong style={{ marginRight: '5px' }}>{userName || 'You'}:</strong>}
                            {/* Render formatted text */}
                            {formatText(msg.text)}
                        </span>
                    </div>
                ))}
                <div ref={messagesEndRef} />
                {/* Error Indicator (only show if user is logged in) */}
                {user && chatError && !isLoading && <p style={{ color: 'red', textAlign: 'center', fontWeight: 'bold' }}>{chatError}</p>}
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
                    disabled={isInteractionDisabled} // Disable if loading OR not logged in
                />
                <button
                    onClick={handleSend}
                    disabled={isSendDisabled} // Disable if loading OR not logged in OR no input
                    style={{
                        padding: '10px 15px',
                        borderRadius: '20px',
                        border: 'none',
                        backgroundColor: '#007bff',
                        color: 'white',
                        cursor: isSendDisabled ? 'not-allowed' : 'pointer',
                        opacity: isSendDisabled ? 0.6 : 1 // Visual cue for disabled state
                    }}
                >
                    Send
                </button>
            </div>
        </div>
    );
}

export default ChatInterface;
