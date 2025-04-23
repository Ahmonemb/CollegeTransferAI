import React, { useState, useEffect } from 'react'; // Import useEffect
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
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
        // Optional: Add token expiration check here
        // const decoded = jwtDecode(parsedUser.idToken);
        // if (decoded.exp * 1000 < Date.now()) {
        //   console.log("Stored token expired, clearing storage.");
        //   localStorage.removeItem(USER_STORAGE_KEY);
        //   return null; // Treat as logged out
        // }
        console.log("Loaded user from localStorage");
        return parsedUser;
      }
    } catch (error) {
      console.error("Failed to load user from localStorage:", error);
      localStorage.removeItem(USER_STORAGE_KEY); // Clear corrupted data
    }
    return null; // Default to null if nothing valid is stored
  });

  const navigate = useNavigate();

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

  // Optional: Effect to listen for storage changes in other tabs (advanced)
  // useEffect(() => {
  //   const handleStorageChange = (event) => {
  //     if (event.key === USER_STORAGE_KEY) {
  //       if (!event.newValue) { // User logged out in another tab
  //         setUser(null);
  //       } else { // User logged in/updated in another tab
  //         try {
  //           setUser(JSON.parse(event.newValue));
  //         } catch {
  //           setUser(null);
  //         }
  //       }
  //     }
  //   };
  //   window.addEventListener('storage', handleStorageChange);
  //   return () => window.removeEventListener('storage', handleStorageChange);
  // }, []);

  return (
    <>
      {/* Navigation/Header remains the same */}
      <nav style={{ padding: '10px 20px', backgroundColor: '#eee', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link to="/" style={{ marginRight: '15px' }}>Home</Link>
          {user && <Link to="/course-map">Course Map</Link>}
        </div>
        <div>
          {user ? (
            <>
              <span style={{ marginRight: '10px', fontSize: '0.9em' }}>Welcome, {user.name || user.email}!</span>
              <button onClick={handleLogout}>Logout</button>
            </>
          ) : (
            <GoogleLogin
              onSuccess={handleLoginSuccess}
              onError={handleLoginError}
              useOneTap
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
          element={user ? <CourseMap user={user} /> : <p>Please log in to view the course map.</p>}
        />
      </Routes>
    </>
  );
}

export default App;
