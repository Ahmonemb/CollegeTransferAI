import React from 'react';

// Accept imageFilenames directly as a prop
function PdfViewer({ imageFilenames, isLoading, error, filename }) { // Added isLoading, error, filename for context messages

  // Render content based on props
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Show messages passed from parent */}
      {!filename && <p style={{ textAlign: 'center', marginTop: '2em' }}>Select a major/department to view the agreement.</p>}
      {error && <p style={{ color: 'red' }}>Error loading agreement: {error}</p>}

      {!isLoading && !error && filename && (!imageFilenames || imageFilenames.length === 0) && (
          <p>No images found or extracted for this agreement.</p>
      )}

      {/* --- Scrollable Image Container --- */}
      {!isLoading && !error && filename && imageFilenames && imageFilenames.length > 0 && (
        <div
          style={{
            flex: '1 1 auto',
            overflowY: 'auto',
            border: '1px solid #ccc',
            padding: '5px'
          }}
        >
          {imageFilenames.map((imgFilename) => {
            const imageUrl = `/api/image/${imgFilename}`;
            // console.log("Rendering image:", imageUrl); // Keep this if needed
            return (
              <div key={imgFilename} style={{ marginBottom: '0.5em' }}>
                <img
                  src={imageUrl}
                  alt={`Page from ${filename || 'agreement'}`} // Use filename prop if available
                  style={{ maxWidth: '100%', display: 'block' }}
                />
              </div>
            );
          })}
        </div>
      )}
      {/* --- End Scrollable Image Container --- */}
    </div>
  );
}

export default PdfViewer;