import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchData } from '../services/api';
import PdfViewer from './PdfViewer';
import ChatInterface from './ChatInterface'; // Import ChatInterface
import '../App.css';

function AgreementViewerPage() {
    const { sendingId, receivingId, yearId } = useParams();

    // State for this page
    const [majors, setMajors] = useState({});
    const [isLoadingMajors, setIsLoadingMajors] = useState(true);
    const [error, setError] = useState(null); // General/Major loading error
    const [pdfError, setPdfError] = useState(null); // Specific PDF loading error
    const [selectedMajorKey, setSelectedMajorKey] = useState(null);
    const [selectedMajorName, setSelectedMajorName] = useState(''); // Store name for chat context
    const [selectedPdfFilename, setSelectedPdfFilename] = useState(null);
    const [imageFilenames, setImageFilenames] = useState([]); // State for image filenames
    const [isLoadingPdf, setIsLoadingPdf] = useState(false); // Loading PDF info + images
    const [majorSearchTerm, setMajorSearchTerm] = useState('');

    // Fetch majors
    useEffect(() => {
        // ... existing useEffect logic to fetch majors ...
        if (!sendingId || !receivingId || !yearId) {
            setError("Required institution or year information is missing in URL.");
            setIsLoadingMajors(false);
            return;
        }
        setIsLoadingMajors(true);
        setError(null);
        fetchData(`majors?sendingInstitutionId=${sendingId}&receivingInstitutionId=${receivingId}&academicYearId=${yearId}&categoryCode=major`)
            .then(data => {
                if (Object.keys(data).length === 0) {
                    setError("No majors found for the selected combination.");
                }
                setMajors(data);
            })
            .catch(err => {
                console.error("Error fetching majors:", err);
                setError(`Failed to load majors: ${err.message}`);
            })
            .finally(() => {
                setIsLoadingMajors(false);
            });
    }, [sendingId, receivingId, yearId]);

    // Fetch PDF filename AND image filenames when major is selected
    const handleMajorSelect = async (majorKey, majorName) => {
        if (!majorKey || isLoadingPdf) return;

        setSelectedMajorKey(majorKey);
        setSelectedMajorName(majorName); // Store name
        setSelectedPdfFilename(null); // Clear previous PDF filename
        setImageFilenames([]); // Clear previous images
        setIsLoadingPdf(true);
        setError(null); // Clear general errors
        setPdfError(null); // Clear specific PDF errors

        try {
            // 1. Get PDF Filename
            const agreementData = await fetchData(`articulation-agreement?key=${majorKey}`);
            if (agreementData.pdf_filename) {
                const pdfFilename = agreementData.pdf_filename;
                setSelectedPdfFilename(pdfFilename); // Set filename for context

                // 2. Get Image Filenames for the PDF
                const imageData = await fetchData(`pdf-images/${pdfFilename}`);
                if (imageData.image_filenames) {
                    setImageFilenames(imageData.image_filenames);
                } else {
                    throw new Error(imageData.error || 'Failed to load image list for PDF');
                }
            } else if (agreementData.error) {
                throw new Error(`Agreement Error: ${agreementData.error}`);
            } else {
                throw new Error('Received unexpected data when fetching agreement.');
            }
        } catch (err) {
            console.error("Error fetching agreement or images:", err);
            setPdfError(err.message); // Set specific PDF error
            setSelectedPdfFilename(null); // Clear filename on error
            setImageFilenames([]); // Clear images on error
        } finally {
            setIsLoadingPdf(false); // Done loading PDF info + images
        }
    };

    // Filter majors based on search term
    const filteredMajors = useMemo(() => {
        // ... existing useMemo logic ...
        const lowerCaseSearchTerm = majorSearchTerm.toLowerCase();
        return Object.entries(majors).filter(([name]) =>
            name.toLowerCase().includes(lowerCaseSearchTerm)
        );
    }, [majors, majorSearchTerm]);

    return (
        // Main container using Flexbox, full height, 3 columns
        <div style={{ display: 'flex', height: '100vh', padding: '1em', boxSizing: 'border-box', gap: '1em' /* Add gap between columns */ }}>

            {/* Left Column (Majors List) */}
            <div style={{ flex: '0 0 300px', /* Fixed width */ display: 'flex', flexDirection: 'column' }}>
                <Link to="/">Back to Form</Link>
                <h2 style={{ marginTop: '0.5em', marginBottom: '0.5em' }}>Select Major</h2>
                <input
                    type="text"
                    placeholder="Search majors..."
                    value={majorSearchTerm}
                    onChange={(e) => setMajorSearchTerm(e.target.value)}
                    style={{ marginBottom: '0.5em', padding: '8px', border: '1px solid #ccc' }}
                />
                {error && <div style={{ color: 'red', marginBottom: '1em' }}>Error: {error}</div>}
                {isLoadingMajors && <p>Loading available majors...</p>}
                {/* Scrollable Major List */}
                {!isLoadingMajors && filteredMajors.length > 0 && (
                    <div style={{ flex: '1 1 auto', overflowY: 'auto', border: '1px solid #ccc' }}>
                        {filteredMajors.map(([name, key]) => (
                            <div
                                key={key}
                                onClick={() => handleMajorSelect(key, name)}
                                style={{
                                    padding: '8px 12px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid #eee',
                                    backgroundColor: selectedMajorKey === key ? '#e0e0e0' : 'transparent',
                                    fontWeight: selectedMajorKey === key ? 'bold' : 'normal'
                                }}
                                className="major-list-item"
                            >
                                {name}
                                {selectedMajorKey === key && isLoadingPdf && <span style={{ marginLeft: '10px', fontStyle: 'italic' }}>(Loading...)</span>}
                            </div>
                        ))}
                    </div>
                )}
                {/* ... other messages for no majors found ... */}
                 {!isLoadingMajors && filteredMajors.length === 0 && Object.keys(majors).length > 0 && (
                     <p style={{ marginTop: '1em' }}>No majors match your search.</p>
                 )}
                 {!isLoadingMajors && Object.keys(majors).length === 0 && !error && (
                     <p>No majors found.</p>
                 )}
            </div>

            {/* Middle Column (Chat Interface) - Conditionally Rendered */}
            <div style={{ flex: '1 1 0', /* Flexible width */ display: 'flex', flexDirection: 'column', minWidth: '300px' /* Prevent collapsing too much */ }}>
                {selectedPdfFilename ? (
                    <ChatInterface imageFilenames={imageFilenames} selectedMajorName={selectedMajorName} />
                ) : (
                    <div style={{ border: '1px dashed #ccc', padding: '20px', textAlign: 'center', marginTop: '5em' }}>
                        Select a major to enable chat.
                    </div>
                )}
            </div>

            {/* Right Column (PDF Viewer) */}
            <div style={{ flex: '1 1 0', /* Flexible width */ display: 'flex', flexDirection: 'column', minWidth: '300px' /* Prevent collapsing too much */ }}>
                {/* Pass image filenames and loading/error state */}
                <PdfViewer
                    imageFilenames={imageFilenames}
                    isLoading={isLoadingPdf}
                    error={pdfError}
                    filename={selectedPdfFilename} // Pass filename for context messages
                />
            </div>

        </div>
    );
}

export default AgreementViewerPage;