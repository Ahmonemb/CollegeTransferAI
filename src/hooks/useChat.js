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

    useEffect(() => {
        console.log("Current message history:", messages);
    }, [messages]);

    useEffect(() => {
        setMessages([]);
        setUserInput('');
        setChatError(null);
        initialAnalysisSentRef.current = false;
        console.log("DEBUG: Chat cleared and initialAnalysisSentRef reset due to context/user change.");
    }, [imageFilenames, selectedMajorName, user, sendingInstitutionId, receivingInstitutionId, academicYearId]);

    useEffect(() => {
        console.log("DEBUG: Initial analysis effect triggered.");
        console.log("DEBUG: User object:", user);
        console.log("DEBUG: User ID:", user ? user.id : "N/A");
        console.log("DEBUG: User ID Token:", user ? (user.idToken ? "Present" : "MISSING") : "N/A");
        console.log("DEBUG: imageFilenames (for initial analysis):", imageFilenames);
        console.log("DEBUG: initialAnalysisSentRef.current:", initialAnalysisSentRef.current);
        console.log("DEBUG: isLoading:", isLoading);

        if (!user) {
            console.log("DEBUG: Skipping initial analysis - User not logged in.");
            initialAnalysisSentRef.current = false;
            return;
        }
        const shouldSend = imageFilenames && imageFilenames.length > 0 && !initialAnalysisSentRef.current && !isLoading;
        console.log("DEBUG: Should send initial analysis?", shouldSend);
        if (shouldSend && false) {
            const sendInitialAnalysis = async () => {
                if (!user || !user.idToken) {
                    console.error("DEBUG: Cannot send initial analysis: User logged out or token missing just before sending.");
                    setChatError("Authentication error. Please log in again.");
                    setMessages([{ type: 'system', text: "Authentication error. Please log in again." }]);
                    initialAnalysisSentRef.current = false;
                    return;
                }

                console.log("DEBUG: Conditions met. Calling sendInitialAnalysis function...");
                setIsLoading(true);
                setChatError(null);
                initialAnalysisSentRef.current = true;
                console.log("DEBUG: initialAnalysisSentRef.current set to true.");
                console.log("DEBUG: Context for prompt - academicYearId:", academicYearId);
                console.log("DEBUG: Context for prompt - sendingInstitutionId:", sendingInstitutionId);
                console.log("DEBUG: Context for prompt - receivingInstitutionId:", receivingInstitutionId);
                console.log("DEBUG: Context for prompt - selectedMajorName:", selectedMajorName);
                console.log("DEBUG: Context for prompt - allSendingInstitutionIds:", allSendingInstitutionIds);

                const currentContextInfo = `The user is viewing an articulation agreement for the academic year ${academicYearId || 'N/A'} between sending institution ID ${sendingInstitutionId || 'N/A'} (the 'current' agreement) and receiving institution ID ${receivingInstitutionId || 'N/A'}. The selected major/department is "${selectedMajorName || 'N/A'}".`;
                const overallContextInfo = allSendingInstitutionIds && allSendingInstitutionIds.length > 1
                    ? `Note: The user originally selected multiple sending institutions (IDs: ${allSendingInstitutionIds.join(', ')}). Images for all selected agreements have been provided.`
                    : 'Only one sending institution was selected.';

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
4.  **Compare Articulation (If Applicable):** If you identified non-articulated courses in step 3 AND other sending institutions were selected (see Overall Context), examine the provided images for the **other** agreements (Sending IDs: ${allSendingInstitutionIds?.filter(id => id !== sendingInstitutionId).join(', ') || 'None'}). For each non-articulated course from the current agreement, state whether it **is articulated** by any of the **other** sending institutions based on their respective agreements. Present this comparison clearly, perhaps in a separate section or list (e.g., "Comparison with Other Selected Colleges:").
5.  **Suggest Next Steps:** Conclude with relevant advice or next steps for the student based on the analysis and comparison.
6.  **Offer Education Plan:** After providing the analysis and next steps, ask the user: "Would you like me to generate a potential 2-year education plan based on this information? If yes, I will outline courses semester-by-semester (Year 1 Fall, Year 1 Spring, Year 1 Summer, Year 2 Fall, Year 2 Spring, Year 2 Summer) aiming for approximately 4 classes per Fall/Spring semester and 2 classes during the Summer. This plan will incorporate courses from the **[Sending Institution(s) names]** to meet the requirements for the **[Receiving Institution name]**. For each course, I will include its *unit count* and *check for common prerequisites* using my knowledge base. If the prerequisite information isn't readily available, I can perform a web search to find it. Importantly, I will ensure that any identified prerequisite course is placed in a semester *before* the course that requires it."

**Formatting:** Use bullet points (* or -) for lists, **bold** for emphasis (especially names and key terms), and \`italic\` for course codes/titles. Ensure the summary in step 3 is well-organized and easy to read.`;

                setMessages([{ type: 'system', text: "Analyzing agreements and generating summary..." }]);

                const payload = {
                    new_message: initialPrompt,
                    history: [],
                    image_filenames: imageFilenames
                };

                try {
                    console.log("DEBUG: Sending initial analysis to /chat with payload:", payload);
                    const response = await fetchData('chat', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${user.idToken}`
                        },
                        body: JSON.stringify(payload)
                    });
                    console.log("DEBUG: Received response from /chat:", response);

                    if (response && response.reply) {
                        setMessages([{ type: 'bot', text: response.reply }]);
                    } else {
                        if (response?.error?.includes("Authorization")) {
                            throw new Error("Authorization token missing or invalid");
                        }
                        throw new Error(response?.error || "No reply received for initial analysis.");
                    }
                } catch (err) {
                    console.error("DEBUG: Initial analysis API error:", err);
                    const errorMsg = `Failed initial analysis: ${err.message}`;
                    setChatError(errorMsg);
                    setMessages([{ type: 'system', text: `Error during analysis: ${err.message}` }]);
                    if (err.message.includes("Authorization")) {
                        console.log("DEBUG: Resetting initialAnalysisSentRef due to Authorization error.");
                        initialAnalysisSentRef.current = false;
                    } else {
                        console.log("DEBUG: Keeping initialAnalysisSentRef true despite non-auth error.");
                    }
                } finally {
                    console.log("DEBUG: Initial analysis finished (success or error). Setting isLoading to false.");
                    setIsLoading(false);
                }
            };

            sendInitialAnalysis();
        } else {
            console.log("DEBUG: Conditions not met for sending initial analysis.");
            if (!imageFilenames || imageFilenames.length === 0) console.log("Reason: No image filenames provided.");
            if (initialAnalysisSentRef.current) console.log("Reason: Initial analysis already sent.");
            if (isLoading) console.log("Reason: Already loading.");
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
            history: apiHistory,
            image_filenames: imageFilenames
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
    }, [userInput, isLoading, user, messages, imageFilenames]);

    return {
        userInput,
        setUserInput,
        messages,
        isLoading,
        chatError,
        handleSend
    };
}
