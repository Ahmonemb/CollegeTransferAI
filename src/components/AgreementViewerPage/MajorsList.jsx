import React from 'react';

function MajorsList({
    isMajorsVisible,
    toggleMajorsVisibility,
    selectedCategory,
    handleCategoryChange, 
    majorSearchTerm,
    setMajorSearchTerm,
    filteredMajors,
    handleMajorSelect,
    isLoadingMajors,
    error,
    hasMajorsAvailable,
    hasDepartmentsAvailable,
    isLoadingAvailability,
    selectedMajorKey,
    isLoadingPdf,
    majors 
}) {
    if (!isMajorsVisible) return null;

    return (
        <div style={{
            flex: `0 0 300px`, 
            display: 'flex',
            flexDirection: 'column',
            minWidth: '150px', 
            overflow: 'hidden',
            transition: 'flex-basis 0.3s ease, min-width 0.3s ease', 
            marginRight: '1em',
            position: 'relative',
            paddingTop: '2.5em'
        }}>
            <button
                onClick={toggleMajorsVisibility}
                style={{
                    position: 'absolute',
                    top: '0.5em',
                    left: '0.5em',
                    zIndex: 1,
                    padding: '4px 8px',
                    fontSize: '0.85em'
                }}
                className="btn btn-sm btn-outline-secondary"
            >
                Hide Majors
            </button>

            <h2 style={{ marginTop: '0', marginBottom: '0.5em', whiteSpace: 'nowrap' }}>
                Select {selectedCategory === 'major' ? 'Major' : 'Department'}
            </h2>

            <div style={{ marginBottom: '0.5em', display: 'flex', justifyContent: 'center', gap: '1em' }}>
                {isLoadingAvailability ? (<p>Checking availability...</p>) : (
                    <>
                        <label style={{ opacity: hasMajorsAvailable ? 1 : 0.5, cursor: hasMajorsAvailable ? 'pointer' : 'not-allowed' }}>
                            <input type="radio" name="category" value="major" checked={selectedCategory === 'major'} onChange={handleCategoryChange} disabled={!hasMajorsAvailable} /> Majors
                        </label>
                        <label style={{ opacity: hasDepartmentsAvailable ? 1 : 0.5, cursor: hasDepartmentsAvailable ? 'pointer' : 'not-allowed' }}>
                            <input type="radio" name="category" value="dept" checked={selectedCategory === 'dept'} onChange={handleCategoryChange} disabled={!hasDepartmentsAvailable} /> Departments
                        </label>
                    </>
                )}
            </div>

            <input
                type="text"
                placeholder={`Search ${selectedCategory === 'major' ? 'majors' : 'departments'}...`}
                value={majorSearchTerm}
                onChange={(e) => setMajorSearchTerm(e.target.value)}
                style={{ marginBottom: '0.5em', padding: '8px', border: '1px solid #ccc' }}
            />

            {error && <div style={{ color: 'red', marginBottom: '1em' }}>Error: {error}</div>}
            {isLoadingMajors && <p>Loading available {selectedCategory === 'major' ? 'majors' : 'departments'}...</p>}

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
                            {name} {selectedMajorKey === key && isLoadingPdf && <span style={{ marginLeft: '10px', fontStyle: 'italic' }}>(Loading...)</span>}
                        </div>
                    ))}
                </div>
            )}

            {!isLoadingMajors && filteredMajors.length === 0 && Object.keys(majors).length > 0 && (
                 <p style={{ marginTop: '1em' }}>No {selectedCategory === 'major' ? 'majors' : 'departments'} match your search.</p>
            )}
            {!isLoadingMajors && Object.keys(majors).length === 0 && !error && (
                 <p>No {selectedCategory === 'major' ? 'majors' : 'departments'} found.</p>
            )}
            {!isLoadingMajors && !isLoadingAvailability && !hasMajorsAvailable && !hasDepartmentsAvailable && (
                 <p>No majors or departments found for this combination.</p>
            )}
        </div>
    );
}

export default MajorsList;
