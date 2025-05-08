import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import PdfViewer from './PdfViewer';
import ChatInterface from './ChatInterface';
import MajorsList from './AgreementViewerPage/MajorsList';
import AgreementTabs from './AgreementViewerPage/AgreementTabs';
import UsageStatusDisplay from './AgreementViewerPage/UsageStatusDisplay';
import { useResizeHandler } from '../hooks/useResizeHandler';
import { useUsageStatus } from '../hooks/useUsageStatus';
import { useAgreementData } from '../hooks/useAgreementData';
import '../App.css';

const MIN_COL_WIDTH = 150;
const FIXED_MAJORS_WIDTH = 300;

function AgreementViewerPage({ user, userTier }) {
    const { sendingId: initialSendingId, receivingId, yearId } = useParams();
    const location = useLocation();

    const allSelectedSendingInstitutions = useMemo(() => {
        return location.state?.allSelectedSendingInstitutions || [{ id: initialSendingId, name: 'Unknown Sending Institution' }];
    }, [location.state?.allSelectedSendingInstitutions, initialSendingId]);

    const memoizedAllSendingInstitutionIds = useMemo(() => {
        return allSelectedSendingInstitutions.map(inst => inst.id);
    }, [allSelectedSendingInstitutions]);

    const [isMajorsVisible, setIsMajorsVisible] = useState(true);
    const isMajorsVisibleRef = useRef(isMajorsVisible);
    useEffect(() => { isMajorsVisibleRef.current = isMajorsVisible; }, [isMajorsVisible]);

    const {
        chatColumnWidth,
        setChatColumnWidth,
        dividerRef,
        containerRef,
        handleMouseDown,
    } = useResizeHandler(400, MIN_COL_WIDTH, FIXED_MAJORS_WIDTH, isMajorsVisibleRef);

    const { usageStatus, countdown } = useUsageStatus(user, userTier);

    const {
        selectedCategory, majors, isLoadingMajors, error, pdfError,
        selectedMajorKey, selectedMajorName, isLoadingPdf, majorSearchTerm,
        hasMajorsAvailable, hasDepartmentsAvailable, isLoadingAvailability,
        agreementData, activeTabIndex, imagesForActivePdf,
        currentPdfFilename, filteredMajors,
        allAgreementsImageFilenames,
        handleMajorSelect, handleCategoryChange, handleTabClick, setMajorSearchTerm,
    } = useAgreementData(initialSendingId, receivingId, yearId, user, allSelectedSendingInstitutions);

    const toggleMajorsVisibility = () => {
        const gapWidth = 16;
        const majorsColumnTotalWidth = FIXED_MAJORS_WIDTH + gapWidth;

        setIsMajorsVisible(prevVisible => {
            const nextVisible = !prevVisible;

            if (containerRef.current) {
                const containerWidth = containerRef.current.getBoundingClientRect().width;
                const pdfMinWidth = MIN_COL_WIDTH;
                const dividerWidth = 1;

                if (!nextVisible) {
                    const availableWidthForChatAndPdf = containerWidth - pdfMinWidth - dividerWidth - gapWidth;
                    const targetChatWidth = chatColumnWidth + majorsColumnTotalWidth;
                    const newChatWidth = Math.min(targetChatWidth, availableWidthForChatAndPdf);
                    setChatColumnWidth(Math.max(newChatWidth, MIN_COL_WIDTH));
                } else {
                    const targetChatWidth = chatColumnWidth - majorsColumnTotalWidth;
                    const newChatWidth = Math.max(targetChatWidth, MIN_COL_WIDTH);
                    setChatColumnWidth(newChatWidth);
                }
            }
            return nextVisible;
        });
    };

    const currentChatFlexBasis = `${chatColumnWidth}px`;
    const userName = user?.name || user?.email || "You";
    const mainContentHeight = `calc(90vh - 53px)`;

    const currentSendingId = useMemo(() => allSelectedSendingInstitutions[0]?.id, [allSelectedSendingInstitutions]);

    const memoizedImageFilenamesForChat = useMemo(() => {
        return allAgreementsImageFilenames || [];
    }, [allAgreementsImageFilenames]);

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

                <MajorsList
                    isMajorsVisible={isMajorsVisible}
                    toggleMajorsVisibility={toggleMajorsVisibility}
                    selectedCategory={selectedCategory}
                    handleCategoryChange={handleCategoryChange}
                    majorSearchTerm={majorSearchTerm}
                    setMajorSearchTerm={setMajorSearchTerm}
                    filteredMajors={filteredMajors}
                    handleMajorSelect={handleMajorSelect}
                    isLoadingMajors={isLoadingMajors}
                    error={error}
                    hasMajorsAvailable={hasMajorsAvailable}
                    hasDepartmentsAvailable={hasDepartmentsAvailable}
                    isLoadingAvailability={isLoadingAvailability}
                    selectedMajorKey={selectedMajorKey}
                    isLoadingPdf={isLoadingPdf}
                    majors={majors}
                />

                <div style={{
                    flex: `0 0 ${currentChatFlexBasis}`,
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: `${MIN_COL_WIDTH}px`,
                    marginLeft: isMajorsVisible ? '1em' : '0',
                    transition: 'margin-left 0.3s ease'
                }}>
                    <ChatInterface
                        imageFilenames={memoizedImageFilenamesForChat}
                        selectedMajorName={selectedMajorName}
                        userName={userName}
                        isMajorsVisible={isMajorsVisible}
                        toggleMajorsVisibility={toggleMajorsVisibility}
                        sendingInstitutionId={currentSendingId}
                        allSendingInstitutionIds={memoizedAllSendingInstitutionIds}
                        receivingInstitutionId={receivingId}
                        academicYearId={yearId}
                        user={user}
                    />
                </div>

                <div
                    ref={dividerRef}
                    style={{
                        width: `1px`,
                        cursor: 'col-resize',
                        backgroundColor: '#e0e0e0',
                        borderLeft: '1px solid #ccc',
                        borderRight: '1px solid #ccc',
                        alignSelf: 'stretch',
                        flexShrink: 0,
                        marginLeft: '1em',
                        transition: 'margin-left 0.3s ease'
                    }}
                    onMouseDown={handleMouseDown}
                />

                <div style={{
                    flex: '1 1 0',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: `${MIN_COL_WIDTH}px`,
                    marginLeft: '1em'
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
                        error={pdfError}
                        filename={currentPdfFilename}
                    />
                </div>
            </div>
        </>
    );
}

export default AgreementViewerPage;