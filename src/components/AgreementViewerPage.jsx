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

    // Memoize the array of institution objects
    const allSelectedSendingInstitutions = useMemo(() => {
        // Use the *first* selected institution for IGETC fetching logic
        return location.state?.allSelectedSendingInstitutions || [{ id: initialSendingId, name: 'Unknown Sending Institution' }];
    }, [location.state?.allSelectedSendingInstitutions, initialSendingId]);

    // Memoize the array of institution IDs derived from the above
    const memoizedAllSendingInstitutionIds = useMemo(() => {
        return allSelectedSendingInstitutions.map(inst => inst.id);
    }, [allSelectedSendingInstitutions]); // Dependency is the memoized object array

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
        allAgreementsImageFilenames, // <-- This now comes directly from useAgreementData's state

        // Handlers & Setters
        handleMajorSelect, handleCategoryChange, handleTabClick, setMajorSearchTerm,
    } = useAgreementData(initialSendingId, receivingId, yearId, user, allSelectedSendingInstitutions);

    // --- Toggle Majors Visibility ---
    const toggleMajorsVisibility = () => {
        const gapWidth = 16; // Assuming 1em = 16px (sync with CSS if using em)
        const majorsColumnTotalWidth = FIXED_MAJORS_WIDTH + gapWidth;

        setIsMajorsVisible(prevVisible => {
            const nextVisible = !prevVisible;

            if (containerRef.current) {
                const containerWidth = containerRef.current.getBoundingClientRect().width;
                const pdfMinWidth = MIN_COL_WIDTH;
                const dividerWidth = 1; // Width of the draggable divider

                if (!nextVisible) {
                    // --- HIDING MAJORS ---
                    // Calculate available width when majors are hidden
                    const availableWidthForChatAndPdf = containerWidth - pdfMinWidth - dividerWidth - gapWidth; // Space left for Chat + PDF Min + Gaps
                    // Target width: current chat width + space freed by majors
                    const targetChatWidth = chatColumnWidth + majorsColumnTotalWidth;
                    // New width is the smaller of the target or the max available space
                    const newChatWidth = Math.min(targetChatWidth, availableWidthForChatAndPdf);
                    // Ensure it doesn't go below min width (shouldn't happen when increasing, but good practice)
                    setChatColumnWidth(Math.max(newChatWidth, MIN_COL_WIDTH));
                } else {
                    // --- SHOWING MAJORS ---
                    // Target width: current chat width - space needed for majors
                    const targetChatWidth = chatColumnWidth - majorsColumnTotalWidth;
                    // New width is the larger of the target or the minimum allowed chat width
                    const newChatWidth = Math.max(targetChatWidth, MIN_COL_WIDTH);
                    setChatColumnWidth(newChatWidth);
                }
            }
            return nextVisible;
        });
    };

    // --- Layout Calculation ---
    const currentChatFlexBasis = `${chatColumnWidth}px`;
    const userName = user?.name || user?.email || "You";
    const mainContentHeight = `calc(90vh - 53px)`; // Assuming nav height + padding

    // Determine current sending ID based on the first selected institution
    // Memoize this as well, although less critical than the array
    const currentSendingId = useMemo(() => allSelectedSendingInstitutions[0]?.id, [allSelectedSendingInstitutions]);

    // Use the state from the hook directly and memoize it
    const memoizedImageFilenamesForChat = useMemo(() => {
        return allAgreementsImageFilenames || []; // Default to [] if it's somehow undefined initially
    }, [allAgreementsImageFilenames]);

    // Log to see when it updates
    useEffect(() => {
        console.log("AgreementViewerPage: memoizedImageFilenamesForChat updated:", memoizedImageFilenamesForChat);
    }, [memoizedImageFilenamesForChat]);


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
                        // Pass the memoized COMPLETE list of filenames to useChat
                        imageFilenames={memoizedImageFilenamesForChat}
                        selectedMajorName={selectedMajorName}
                        userName={userName}
                        isMajorsVisible={isMajorsVisible} // Pass visibility state
                        toggleMajorsVisibility={toggleMajorsVisibility} // Pass toggle function
                        sendingInstitutionId={currentSendingId} // Pass memoized current ID
                        allSendingInstitutionIds={memoizedAllSendingInstitutionIds} // Pass memoized ID array
                        receivingInstitutionId={receivingId}
                        academicYearId={yearId}
                        user={user} // Assuming user object reference is stable from parent/context
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
                        allSelectedSendingInstitutions={allSelectedSendingInstitutions} // Pass original object array here
                        yearId={yearId}
                    />
                    <PdfViewer
                        imageFilenames={imagesForActivePdf} // PDF viewer uses the direct state value
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