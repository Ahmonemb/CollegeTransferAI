import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';

// Import Components
import PdfViewer from './PdfViewer';
import ChatInterface from './ChatInterface';
import MajorsList from './AgreementViewerPage/MajorsList'; // Adjusted path
import AgreementTabs from './AgreementViewerPage/AgreementTabs'; // Adjusted path
import UsageStatusDisplay from './AgreementViewerPage/UsageStatusDisplay'; // Adjusted path

// Import Hooks
import { useResizeHandler } from '../hooks/useResizeHandler'; // Adjusted path
import { useUsageStatus } from '../hooks/useUsageStatus'; // Adjusted path
import { useAgreementData } from '../hooks/useAgreementData'; // Adjusted path

// Import CSS
import '../App.css'; // Keep general styles if needed

// Constants
const MIN_COL_WIDTH = 150;
const FIXED_MAJORS_WIDTH = 300;

// Helper function to format remaining time (moved to useUsageStatus hook)
// function formatRemainingTime(resetTimestamp) { ... }


function AgreementViewerPage({ user, userTier }) {
    const { sendingId: initialSendingId, receivingId, yearId } = useParams();
    const location = useLocation();

    const allSelectedSendingInstitutions = useMemo(() => {
        // Use the *first* selected institution for IGETC fetching logic
        return location.state?.allSelectedSendingInstitutions || [{ id: initialSendingId, name: 'Unknown Sending Institution' }];
    }, [location.state?.allSelectedSendingInstitutions, initialSendingId]);

    // --- State for Majors Column Visibility ---
    const [isMajorsVisible, setIsMajorsVisible] = useState(true);
    const isMajorsVisibleRef = useRef(isMajorsVisible);
    useEffect(() => { isMajorsVisibleRef.current = isMajorsVisible; }, [isMajorsVisible]);

    // --- Custom Hooks ---
    const {
        chatColumnWidth,
        setChatColumnWidth, // Get setter from hook
        dividerRef,
        containerRef,
        handleMouseDown,
    } = useResizeHandler(400, MIN_COL_WIDTH, FIXED_MAJORS_WIDTH, isMajorsVisibleRef);

    const { usageStatus, countdown } = useUsageStatus(user, userTier);

    const {
        // State & Derived State
        selectedCategory, majors, isLoadingMajors, error, pdfError,
        selectedMajorKey, selectedMajorName, isLoadingPdf, majorSearchTerm,
        hasMajorsAvailable, hasDepartmentsAvailable, isLoadingAvailability,
        agreementData, activeTabIndex, imagesForActivePdf,
        currentPdfFilename, filteredMajors,

        // Handlers & Setters
        handleMajorSelect, handleCategoryChange, handleTabClick, setMajorSearchTerm,
    } = useAgreementData(initialSendingId, receivingId, yearId, user, allSelectedSendingInstitutions);

    // --- Toggle Majors Visibility ---
    const toggleMajorsVisibility = () => {
        const gapWidth = 16; // Assuming 1em = 16px
        setIsMajorsVisible(prevVisible => {
            const nextVisible = !prevVisible;
            // Adjust chat width if hiding majors to prevent jump
            if (!nextVisible && containerRef.current) {
                const containerWidth = containerRef.current.getBoundingClientRect().width;
                const pdfMinWidth = MIN_COL_WIDTH;
                const availableWidth = containerWidth - pdfMinWidth - gapWidth - 1; // 1 for divider
                setChatColumnWidth(prevChatWidth => Math.min(prevChatWidth + FIXED_MAJORS_WIDTH + gapWidth, availableWidth));
            }
            return nextVisible;
        });
    };

    // --- Layout Calculation ---
    const currentChatFlexBasis = `${chatColumnWidth}px`;
    const userName = user?.name || user?.email || "You";
    const mainContentHeight = `calc(90vh - 53px)`; // Assuming nav height + padding

    // Determine images for chat
    const currentSendingId = (activeTabIndex >= 0 ? agreementData[activeTabIndex]?.sendingId : null) || allSelectedSendingInstitutions[0]?.id;


    return (
        <>
            <div
                ref={containerRef}
                style={{
                    display: 'flex',
                    height: mainContentHeight,
                    padding: '0.5em',
                    boxSizing: 'border-box',
                    color: "#333",
                    position: 'relative',
                }}
            >
                <UsageStatusDisplay user={user} usageStatus={usageStatus} countdown={countdown} />

                {/* Pass isMajorsVisible directly */}
                <MajorsList
                    isMajorsVisible={isMajorsVisible}
                    toggleMajorsVisibility={toggleMajorsVisibility}
                    selectedCategory={selectedCategory}
                    handleCategoryChange={handleCategoryChange}
                    majorSearchTerm={majorSearchTerm}
                    setMajorSearchTerm={setMajorSearchTerm}
                    filteredMajors={filteredMajors} // Pass filtered list
                    handleMajorSelect={handleMajorSelect}
                    isLoadingMajors={isLoadingMajors}
                    error={error} // Pass majors list error
                    hasMajorsAvailable={hasMajorsAvailable}
                    hasDepartmentsAvailable={hasDepartmentsAvailable}
                    isLoadingAvailability={isLoadingAvailability}
                    selectedMajorKey={selectedMajorKey}
                    isLoadingPdf={isLoadingPdf} // Pass PDF loading state for indicator
                    majors={majors} // Pass raw majors for checking length in component
                />

                {/* Middle Column (Chat Interface) */}
                <div style={{
                    flex: `0 0 ${currentChatFlexBasis}`,
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: `${MIN_COL_WIDTH}px`,
                    // Add margin if majors are visible
                    marginLeft: isMajorsVisible ? '1em' : '0',
                    transition: 'margin-left 0.3s ease' // Smooth transition for margin
                }}>
                    <ChatInterface
                        selectedMajorName={selectedMajorName}
                        userName={userName}
                        isMajorsVisible={isMajorsVisible} // Pass visibility state
                        toggleMajorsVisibility={toggleMajorsVisibility} // Pass toggle function
                        sendingInstitutionId={currentSendingId}
                        allSendingInstitutionIds={allSelectedSendingInstitutions.map(inst => inst.id)}
                        receivingInstitutionId={receivingId}
                        academicYearId={yearId}
                        user={user}
                    />
                </div>

                {/* Draggable Divider */}
                <div
                    ref={dividerRef}
                    style={{
                        width: `1px`, // Fixed width
                        cursor: 'col-resize',
                        backgroundColor: '#e0e0e0',
                        borderLeft: '1px solid #ccc',
                        borderRight: '1px solid #ccc',
                        alignSelf: 'stretch',
                        flexShrink: 0,
                        // Adjust margin based on majors visibility
                        marginLeft: '1em', // Always have margin before PDF viewer
                        transition: 'margin-left 0.3s ease'
                    }}
                    onMouseDown={handleMouseDown}
                />

                {/* Right Column (PDF Viewer) */}
                <div style={{
                    flex: '1 1 0', // Takes remaining space
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: `${MIN_COL_WIDTH}px`,
                    marginLeft: '1em' // Always have margin after divider
                }}>
                    <AgreementTabs
                        agreementData={agreementData}
                        activeTabIndex={activeTabIndex}
                        handleTabClick={handleTabClick}
                        allSelectedSendingInstitutions={allSelectedSendingInstitutions}
                        yearId={yearId}
                    />
                    <PdfViewer
                        imageFilenames={imagesForActivePdf}
                        // Refined loading state check
                        error={pdfError} // Pass PDF viewer error
                        filename={currentPdfFilename}
                    />
                </div>
            </div>
        </>
    );
}

export default AgreementViewerPage;