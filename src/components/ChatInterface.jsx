import React from 'react';
import ChatHeader from './ChatInterface/ChatHeader';
import MessageList from './ChatInterface/MessageList';
import MessageInput from './ChatInterface/MessageInput';
import { useChat } from '../hooks/useChat';

function ChatInterface({
    imageFilenames,
    selectedMajorName,
    userName,
    isMajorsVisible,
    toggleMajorsVisibility,
    sendingInstitutionId,
    allSendingInstitutionIds,
    receivingInstitutionId,
    academicYearId,
    user
}) {
    const {
        userInput,
        setUserInput,
        messages,
        isLoading,
        chatError,
        handleSend
    } = useChat(
        imageFilenames,
        selectedMajorName,
        user,
        sendingInstitutionId,
        allSendingInstitutionIds,
        receivingInstitutionId,
        academicYearId
    );

    const isInteractionDisabled = isLoading || !user || !imageFilenames || imageFilenames.length === 0;
    const isSendDisabled = isInteractionDisabled || !userInput.trim();

    const placeholderText = !user
        ? "Please sign in to use the chat feature."
        : (!imageFilenames || imageFilenames.length === 0)
            ? "Select a major/department to chat."
            : isLoading
                ? (messages.length === 0 ? "Analyzing agreement..." : "Thinking...")
                : "Ask a follow-up question...";

    return (
        <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid #ccc',
            backgroundColor: '#f9f9f9'
        }}>
            <ChatHeader
                selectedMajorName={selectedMajorName}
                isMajorsVisible={isMajorsVisible}
                toggleMajorsVisibility={toggleMajorsVisibility}
            />
            <MessageList
                messages={messages}
                isLoading={isLoading}
                chatError={chatError}
                user={user}
                userName={userName}
                placeholderText={placeholderText}
            />
            <MessageInput
                userInput={userInput}
                setUserInput={setUserInput}
                handleSend={handleSend}
                placeholderText={placeholderText}
                isInteractionDisabled={isInteractionDisabled}
                isSendDisabled={isSendDisabled}
            />
        </div>
    );
}

export default ChatInterface;