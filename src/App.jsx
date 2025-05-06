import React, { useState, useEffect, useCallback } from 'react'; // Add useCallback
import { Routes, Route, useNavigate } from 'react-router-dom';
import { GoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";
import CollegeTransferForm from './components/CollegeTransferForm';
import AgreementViewerPage from './components/AgreementViewerPage';
import CourseMap from './components/CourseMap';
import './App.css';
import { fetchData } from './services/api'; // Import fetchData

// --- Stripe Imports ---
import { loadStripe } from '@stripe/stripe-js';

// Load Stripe outside component to avoid recreating on render
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
// --- End Stripe Imports ---


// Make USER_STORAGE_KEY exportable or move to constants.js
export const USER_STORAGE_KEY = 'collegeTransferUser';

// --- Simple Payment Status Components ---
const PaymentSuccess = () => {
    // You could fetch session details here to show more info if needed
    return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
            <h2>Payment Successful!</h2>
            <p>Your subscription is now active. Thank you!</p>
            <a href="/">Go to Home</a>
        </div>
    );
};

const PaymentCancel = () => {
    return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
            <h2>Payment Cancelled</h2>
            <p>Your payment process was cancelled. You can try again anytime.</p>
            <a href="/">Go to Home</a>
        </div>
    );
};
// --- End Payment Status Components ---


function App() {
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

  // --- Add User Tier State ---
  const [userTier, setUserTier] = useState('free'); // Default to free
  const [isLoadingTier, setIsLoadingTier] = useState(false);
  // --- End User Tier State ---

  const navigate = useNavigate();

  // --- Wrap handleLogout in useCallback ---
  const handleLogout = useCallback(() => {
    googleLogout(); // Clear Google session
    setUser(null); // Clear React state
    try {
      localStorage.removeItem(USER_STORAGE_KEY);
      console.log("Removed user from localStorage");
    } catch (storageError) {
      console.error("Failed to remove user from localStorage:", storageError);
    }
    console.log("User logged out.");
    navigate('/'); // Navigate to home
    setUserTier('free'); // Reset tier
  }, [navigate]); // Add navigate as dependency

  // --- Effect to handle automatic logout on token expiry ---
  useEffect(() => {
    const handleAuthExpired = () => {
      // Avoid logging out if already logged out
      if (localStorage.getItem(USER_STORAGE_KEY)) {
          console.log("Auth expired event received. Logging out.");
          alert("Your session has expired. Please sign in again."); // Inform user
          handleLogout();
      }
    };

    window.addEventListener('auth-expired', handleAuthExpired);

    // Cleanup listener on component unmount
    return () => {
      window.removeEventListener('auth-expired', handleAuthExpired);
    };
  }, [handleLogout]); // Add handleLogout dependency
  // --- End Auto Logout Effect ---


  // --- Fetch User Status/Tier Effect ---
  useEffect(() => {
    // Function to fetch status
    const fetchUserStatus = () => {
        if (user && user.idToken) {
            setIsLoadingTier(true);
            fetchData('/user-status', {
                headers: { 'Authorization': `Bearer ${user.idToken}` }
            })
            .then(data => {
                if (data && data.tier) {
                    setUserTier(data.tier);
                    console.log("User tier updated:", data.tier); // Log update
                } else {
                    console.warn("Could not fetch user tier:", data?.error);
                    setUserTier('free'); // Fallback
                }
            })
            .catch(err => {
                console.error("Error fetching user status:", err);
                setUserTier('free'); // Fallback on error
            })
            .finally(() => {
                setIsLoadingTier(false);
            });
        } else {
            // If no user, ensure tier is reset to free and not loading
            setUserTier('free');
            setIsLoadingTier(false);
        }
    };

    // Call fetchUserStatus immediately when the effect runs
    fetchUserStatus();

    // OPTIONAL: Add a listener to refetch when the window gains focus
    // This helps if the user switches tabs and comes back after the webhook has processed
    window.addEventListener('focus', fetchUserStatus);

    // Cleanup listener on unmount or when user changes
    return () => {
        window.removeEventListener('focus', fetchUserStatus);
    };

  // Re-run this effect ONLY when the user object (specifically idToken) changes.
  // The fetchUserStatus function itself will handle the logic based on the current user state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.idToken]); // Depend only on user.idToken
  // --- End Fetch User Status/Tier ---


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
    // User state update will trigger the useEffect to fetch tier
  };

  const handleLoginError = () => {
    console.error("Google Login Failed");
    setUser(null);
    localStorage.removeItem(USER_STORAGE_KEY); // Clear storage on login error
    setUserTier('free'); // Reset tier on login error
  };

  // --- Use useCallback version for manual logout button ---
  const handleManualLogoutClick = useCallback(() => {
      handleLogout();
  }, [handleLogout]);


  const handleUpgradeClick = async () => {
      if (!user || !user.idToken) {
          alert("Please log in to upgrade.");
          return;
      }

      try {
          console.log("Requesting checkout session...");
          // Call your backend to create the checkout session
          const response = await fetchData('create-checkout-session', {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${user.idToken}`,
                  'Content-Type': 'application/json' // Ensure content type is set if sending body (though not needed here)
              },
              // body: JSON.stringify({ priceId: 'YOUR_STRIPE_PRICE_ID' }) // If sending priceId from frontend
          });

          if (response && response.sessionId) {
              console.log("Received session ID:", response.sessionId);
              const stripe = await stripePromise;
              const { error } = await stripe.redirectToCheckout({
                  sessionId: response.sessionId,
              });
              // If `redirectToCheckout` fails due to browser blocking, display an error
              if (error) {
                  console.error("Stripe redirect failed:", error);
                  alert(`Payment redirect failed: ${error.message}`);
              }
          } else {
              throw new Error(response?.error || "Failed to get checkout session ID.");
          }
      } catch (error) {
          console.error("Upgrade failed:", error);
          alert(`Could not initiate payment: ${error.message}`);
      }
  };
  // --- End Handle Upgrade Click ---


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
              <span style={{ marginRight: '10px', fontSize: '0.9em' }}>
                  Welcome, {user.name || user.email}!
                  {/* Display Tier */}
                  {!isLoadingTier && ` (Tier: ${userTier})`}
                  {isLoadingTier && ` (Loading tier...)`}
              </span>

              {/* Conditionally show Upgrade Button */}
              {userTier === 'free' && !isLoadingTier && (
                  <button
                      onClick={handleUpgradeClick}
                      className="btn btn-success" // Use a different color for upgrade
                      style={{ margin: '0 10px' }}
                  >
                      Upgrade to Premium
                  </button>
              )}

              <button onClick={handleManualLogoutClick} className="btn btn-danger"> {/* Use useCallback version */}
                Logout
              </button>
            </>
          ) : (
            <GoogleLogin
              onSuccess={handleLoginSuccess}
              onError={handleLoginError}
            />
          )}
        </div>
      </nav>

      {/* Routes remain the same */}
      <Routes>
        <Route path="/" element={<CollegeTransferForm />} />
        <Route
          path="/agreement/:sendingId/:receivingId/:yearId"
          // Pass user and tier to AgreementViewerPage
          element={<AgreementViewerPage user={user} userTier={userTier} />}
        />
        <Route
          path="/course-map"
          // Always render CourseMap, pass user (null if not logged in)
          element={<CourseMap user={user} />}
        />
        {/* Add routes for payment status */}
        <Route path="/payment-success" element={<PaymentSuccess />} />
        <Route path="/payment-cancel" element={<PaymentCancel />} />
      </Routes>
    </>
  );
}

export default App;