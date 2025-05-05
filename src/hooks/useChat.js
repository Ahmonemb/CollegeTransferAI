import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchData } from '../services/api';

export function useChat(
    imageFilenames,
    selectedMajorName,
    user,
    sendingInstitutionId,
    allSendingInstitutionIds,
    receivingInstitutionId,
    academicYearId
) {
    const [userInput, setUserInput] = useState('');
    const [messages, setMessages] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [chatError, setChatError] = useState(null);
    const initialAnalysisSentRef = useRef(false);

    // Log messages
    useEffect(() => {
        console.log("Current message history:", messages);
    }, [messages]);

    // Clear chat and reset flag when context changes or user logs out
    useEffect(() => {
        setMessages([]);
        setUserInput('');
        setChatError(null);
        initialAnalysisSentRef.current = false;
        console.log("Chat cleared due to new context or user change.");
    }, [imageFilenames, selectedMajorName, user]);

    // Effect to send initial analysis request
    useEffect(() => {
        if (!user) {
            initialAnalysisSentRef.current = false;
            return;
        }

        if (imageFilenames && imageFilenames.length > 0 && !initialAnalysisSentRef.current && !isLoading) {
            const sendInitialAnalysis = async () => {
                if (!user || !user.idToken) {
                    console.error("Cannot send initial analysis: User not logged in or token missing.");
                    setChatError("Authentication error. Please log in again.");
                    setMessages([{ type: 'system', text: "Authentication error. Please log in again." }]);
                    initialAnalysisSentRef.current = false;
                    return;
                }

                console.log("Sending initial analysis request...");
                setIsLoading(true);
                setChatError(null);
                initialAnalysisSentRef.current = true;

                const currentContextInfo = `The user is viewing an articulation agreement for the academic year ${academicYearId || 'N/A'} between sending institution ID ${sendingInstitutionId || 'N/A'} (the 'current' agreement) and receiving institution ID ${receivingInstitutionId || 'N/A'}. The selected major/department is "${selectedMajorName || 'N/A'}".`;
                const overallContextInfo = allSendingInstitutionIds && allSendingInstitutionIds.length > 1
                    ? `Note: The user originally selected multiple sending institutions (IDs: ${allSendingInstitutionIds.join(', ')}). Images for all selected agreements have been provided.`
                    : 'Only one sending institution was selected.';

                const initialPrompt = `You are a helpful, knowledgeable, and supportive college counselor specializing in helping community college students successfully transfer to four-year universities. Your guidance should be clear, encouraging, and personalized based on each student's academic goals, major, preferred universities, and career aspirations. You provide information about transfer requirements, application tips, deadlines, articulation agreements, financial aid, scholarships, and campus life insights. Always empower students with accurate, up-to-date information and a positive, motivating tone. If you don't know an answer, offer to help them find resources or suggest next steps.

**Current Context:** ${currentContextInfo}
${overallContextInfo ? `**Overall Context:** ${overallContextInfo}` : ''}

Analyze the provided agreement images thoroughly. Perform the following steps:
1.  **Focus on the Current Context:** Analyze the agreement for the major between the **current sending institution** and the receiving institution.
2.  **Explicitly state the current context:** Start your response with: "Analyzing the agreement for the [Major Name] (bold) major between [Current Sending Instituion Name] (bold) and [Receiving Institution Name] (bold) for the [academic year name] (bold) academic year."
3.  **Provide a concise summary** of the key details for the **current** agreement (articulated courses, requirements, etc.). Identify any required courses for the major at the receiving institution that are **not articulated** by the current sending institution.
4.  **Compare Articulation (If Applicable):** If you identified non-articulated courses in step 3 AND other sending institutions were selected (see Overall Context), examine the provided images for the **other** agreements (Sending IDs: ${allSendingInstitutionIds.filter(id => id !== sendingInstitutionId).join(', ') || 'None'}). For each non-articulated course from the current agreement, state whether it **is articulated** by any of the **other** sending institutions based on their respective agreements. Present this comparison clearly, perhaps in a separate section or list.
5.  **Suggest Next Steps:** Conclude with relevant advice or next steps for the student based on the analysis and comparison.

**Formatting:** Use bullet points (* or -) for lists, **bold** for emphasis, and \`italic\` for course codes/titles.`;

                setMessages([{ type: 'system', text: "Analyzing agreements and generating summary..." }]);

                const payload = {
                    new_message: initialPrompt,
                    history: [],
                    image_filenames: imageFilenames
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
                        setMessages([{ type: 'bot', text: response.reply }]);
                    } else {
                        if (response?.error?.includes("Authorization")) {
                            throw new Error("Authorization token missing or invalid");
                        }
                        throw new Error(response?.error || "No reply received for initial analysis.");
                    }
                } catch (err) {
                    console.error("Initial analysis API error:", err);
                    const errorMsg = `Failed initial analysis: ${err.message}`;
                    setChatError(errorMsg);
                    setMessages([{ type: 'system', text: `Error during analysis: ${err.message}` }]);
                    if (err.message.includes("Authorization")) {
                        initialAnalysisSentRef.current = false;
                    }
                } finally {
                    setIsLoading(false);
                }
            };

            sendInitialAnalysis();
        }
    }, [imageFilenames, isLoading, selectedMajorName, sendingInstitutionId, allSendingInstitutionIds, receivingInstitutionId, academicYearId, user]);

    const handleSend = useCallback(async () => {
        if (!userInput.trim() || isLoading || !user || !user.idToken) {
            if (!user || !user.idToken) {
                console.error("Cannot send message: User not logged in or token missing.");
                setChatError("Authentication error. Please log in again.");
                setMessages(prev => [...prev, { type: 'system', text: "Authentication error. Please log in again." }]);
            }
            return;
        }

        const currentInput = userInput;
        const currentHistory = [...messages];

        setMessages(prev => [...prev, { type: 'user', text: currentInput }]);
        setUserInput('');
        setIsLoading(true);
        setChatError(null);

        const apiHistory = currentHistory
            .filter(msg => msg.type === 'user' || msg.type === 'bot')
            .map(msg => ({
                role: msg.type === 'bot' ? 'assistant' : msg.type,
                content: msg.text
            }));

        const payload = {
            new_message: currentInput,
            history: apiHistory
        };

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
                setMessages(prev => [...prev, { type: 'bot', text: response.reply }]);
            } else {
                if (response?.error?.includes("Authorization")) {
                    throw new Error("Authorization token missing or invalid");
                }
                throw new Error(response?.error || "No reply received or unexpected response format.");
            }
        } catch (err) {
            console.error("Chat API error:", err);
            setChatError(`Failed to get response: ${err.message}`);
            setMessages(prev => [...prev, { type: 'system', text: `Error: ${err.message}` }]);
        } finally {
            setIsLoading(false);
        }
    }, [userInput, isLoading, user, messages]); // Dependencies for handleSend

    return {
        userInput,
        setUserInput,
        messages,
        isLoading,
        chatError,
        handleSend
    };
}
