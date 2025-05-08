import React from 'react';

function PdfViewer({ imageFilenames, isLoading, error, filename }) { 

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {!filename && <p style={{ textAlign: 'center', marginTop: '2em' }}>Select a major/department to view the agreement.</p>}
      {error && <p style={{ color: 'red' }}>Error loading agreement: {error}</p>}

      {!isLoading && !error && filename && (!imageFilenames || imageFilenames.length === 0) && (
          <p>No images found or extracted for this agreement.</p>
      )}

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
            return (
              <div key={imgFilename} style={{ marginBottom: '0.5em' }}>
                <img
                  src={imageUrl}
                  alt={`Page from ${filename || 'agreement'}`} 
                  style={{ maxWidth: '100%', display: 'block' }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PdfViewer;