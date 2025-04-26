import React, { useState } from 'react';
// Import useNavigate
import { Routes, Route, useNavigate } from 'react-router-dom';
import { GoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";
import CollegeTransferForm from './components/CollegeTransferForm';
import AgreementViewerPage from './components/AgreementViewerPage';
import CourseMap from './components/CourseMap';
import './App.css';

// Define a key for localStorage
const USER_STORAGE_KEY = 'collegeTransferUser';

function App() {
  // Initialize user state from localStorage on initial load
  const [user, setUser] = useState(() => {
    try {
      const storedUser = localStorage.getItem(USER_STORAGE_KEY);
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);

        // *** Check Token Expiration ***
        if (parsedUser.idToken) {
          const decoded = jwtDecode(parsedUser.idToken);
          const isExpired = decoded.exp * 1000 < Date.now(); // Convert exp (seconds) to milliseconds

          if (isExpired) {
            console.log("Stored token expired, clearing storage.");
            localStorage.removeItem(USER_STORAGE_KEY);
            return null; // Treat as logged out
          }
        } else {
           // Handle case where token might be missing in stored data
           console.warn("Stored user data missing idToken, clearing storage.");
           localStorage.removeItem(USER_STORAGE_KEY);
           return null;
        }
        // *** End Check ***

        console.log("Loaded valid user from localStorage");
        return parsedUser;
      }
    } catch (error) {
      console.error("Failed to load or validate user from localStorage:", error);
      localStorage.removeItem(USER_STORAGE_KEY); // Clear corrupted/invalid data
    }
    return null; // Default to null
  });

  const navigate = useNavigate(); // Get navigate function

  // Function to handle successful login
  const handleLoginSuccess = (credentialResponse) => {
    console.log("Google Login Success:", credentialResponse);
    try {
      const decoded = jwtDecode(credentialResponse.credential);
      console.log("Decoded JWT:", decoded);
      const newUser = {
        idToken: credentialResponse.credential,
        id: decoded.sub,
        name: decoded.name,
        email: decoded.email,
      };
      setUser(newUser); // Update React state

      // Save user data to localStorage
      try {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
        console.log("Saved user to localStorage");
      } catch (storageError) {
        console.error("Failed to save user to localStorage:", storageError);
      }

    } catch (error) {
      console.error("Error decoding JWT:", error);
      setUser(null);
      localStorage.removeItem(USER_STORAGE_KEY); // Clear storage on error
    }
  };

  const handleLoginError = () => {
    console.error("Google Login Failed");
    setUser(null);
    localStorage.removeItem(USER_STORAGE_KEY); // Clear storage on login error
  };

  // Function to handle logout
  const handleLogout = () => {
    googleLogout(); // Clear Google session
    setUser(null); // Clear React state

    // Remove user data from localStorage
    try {
      localStorage.removeItem(USER_STORAGE_KEY);
      console.log("Removed user from localStorage");
    } catch (storageError) {
      console.error("Failed to remove user from localStorage:", storageError);
    }

    console.log("User logged out");
    navigate('/');
  };

  return (
    <>
      {/* Navigation/Header remains the same */}
      <nav style={{ padding: '10px 20px', backgroundColor: '#eee', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {/* Replace Link with button and onClick */}
          <button 
            onClick={() => navigate('/')} 
            className="btn btn-primary" 
            style={{ marginRight: '15px' }} // Keep margin separate if needed
          >
            Home
          </button>
          {/* Replace Link with button and onClick */}
          <button 
            onClick={() => navigate('/course-map')}
            className="btn btn-secondary"
          >
            Course Map
          </button>
        </div>
        <div>
          {user ? (
            <>
              <span style={{ marginRight: '10px', fontSize: '0.9em' }}>Welcome, {user.name || user.email}!</span>
              {/* Style the logout button similarly */}
              <button 
                onClick={handleLogout}
                className="btn btn-danger"
              >
                Logout
              </button>
            </>
          ) : (
            <GoogleLogin
              onSuccess={handleLoginSuccess}
              onError={handleLoginError}
              // Note: Styling the GoogleLogin button directly might require specific props or wrapper elements
            />
          )}
        </div>
      </nav>

      {/* Routes remain the same */}
      <Routes>
        <Route path="/" element={<CollegeTransferForm />} />
        <Route
          path="/agreement/:sendingId/:receivingId/:yearId"
          element={<AgreementViewerPage />}
        />
        <Route
          path="/course-map"
          // Always render CourseMap, pass user (null if not logged in)
          element={<CourseMap user={user} />}
        />
      </Routes>
    </>
  );
}

export default App;
