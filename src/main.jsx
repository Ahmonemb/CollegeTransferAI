import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App.jsx';
// Remove dotenv imports - Vite handles .env files for the frontend

// Access the variable using import.meta.env
// Vite replaces this with the actual value during build/dev
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Add a check to ensure the variable is loaded
if (!googleClientId) {
  console.error("FATAL ERROR: VITE_GOOGLE_CLIENT_ID is not defined.");
  console.error("Ensure you have a .env file in the project root (where package.json is)");
  console.error("and the variable is named VITE_GOOGLE_CLIENT_ID=YOUR_ID");
  // You might want to render an error message to the user here instead of proceeding
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={googleClientId}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </GoogleOAuthProvider>
  </React.StrictMode>
);
