import React from 'react';
import { Routes, Route } from 'react-router-dom';
import CollegeTransferForm from './components/CollegeTransferForm';
import AgreementViewerPage from './components/AgreementViewerPage'; // Import the new combined page

function App() {
  return (
    <Routes>
      {/* Route for the main form */}
      <Route path="/" element={<CollegeTransferForm />} />

      {/* Route for the combined Agreement Viewer */}
      <Route
        path="/agreement/:sendingId/:receivingId/:yearId"
        element={<AgreementViewerPage />}
      />

    </Routes>
  );
}

export default App;
