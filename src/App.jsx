import React, { useState, useEffect, useCallback } from 'react'; 
import { Routes, Route, useNavigate } from 'react-router-dom';
import { GoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from "jwt-decode";
import CollegeTransferForm from './components/CollegeTransferForm';
import AgreementViewerPage from './components/AgreementViewerPage';
import CourseMap from './components/CourseMap';
import './App.css';
import { fetchData } from './services/api'; 

import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);


export const USER_STORAGE_KEY = 'collegeTransferUser';

const PaymentSuccess = () => {
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


function App() {
  const [user, setUser] = useState(() => {
    try {
      const storedUser = localStorage.getItem(USER_STORAGE_KEY);
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);

        if (parsedUser.idToken) {
          const decoded = jwtDecode(parsedUser.idToken);
          const isExpired = decoded.exp * 1000 < Date.now(); 

          if (isExpired) {
            console.log("Stored token expired, clearing storage.");
            localStorage.removeItem(USER_STORAGE_KEY);
            return null; 
          }
        } else {
           console.warn("Stored user data missing idToken, clearing storage.");
           localStorage.removeItem(USER_STORAGE_KEY);
           return null;
        }

        console.log("Loaded valid user from localStorage");
        return parsedUser;
      }
    } catch (error) {
      console.error("Failed to load or validate user from localStorage:", error);
      localStorage.removeItem(USER_STORAGE_KEY); 
    }
    return null; 
  });

  const [userTier, setUserTier] = useState('free'); 
  const [isLoadingTier, setIsLoadingTier] = useState(false);

  const navigate = useNavigate();

  const handleLogout = useCallback(() => {
    googleLogout(); 
    setUser(null); 
    try {
      localStorage.removeItem(USER_STORAGE_KEY);
      console.log("Removed user from localStorage");
    } catch (storageError) {
      console.error("Failed to remove user from localStorage:", storageError);
    }
    console.log("User logged out.");
    navigate('/'); 
    setUserTier('free'); 
  }, [navigate]); 

  useEffect(() => {
    const handleAuthExpired = () => {
      if (localStorage.getItem(USER_STORAGE_KEY)) {
          console.log("Auth expired event received. Logging out.");
          alert("Your session has expired. Please sign in again."); 
          handleLogout();
      }
    };

    window.addEventListener('auth-expired', handleAuthExpired);

    return () => {
      window.removeEventListener('auth-expired', handleAuthExpired);
    };
  }, [handleLogout]); 


  useEffect(() => {
    const fetchUserStatus = () => {
        if (user && user.idToken) {
            setIsLoadingTier(true);
            fetchData('/user-status', {
                headers: { 'Authorization': `Bearer ${user.idToken}` }
            })
            .then(data => {
                if (data && data.tier) {
                    setUserTier(data.tier);
                    console.log("User tier updated:", data.tier); 
                } else {
                    console.warn("Could not fetch user tier:", data?.error);
                    setUserTier('free'); 
                }
            })
            .catch(err => {
                console.error("Error fetching user status:", err);
                setUserTier('free'); 
            })
            .finally(() => {
                setIsLoadingTier(false);
            });
        } else {
            setUserTier('free');
            setIsLoadingTier(false);
        }
    };

    fetchUserStatus();

    window.addEventListener('focus', fetchUserStatus);

    return () => {
        window.removeEventListener('focus', fetchUserStatus);
    };

  }, [user?.idToken]); 


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
      setUser(newUser); 

      try {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
        console.log("Saved user to localStorage");
      } catch (storageError) {
        console.error("Failed to save user to localStorage:", storageError);
      }

    } catch (error) {
      console.error("Error decoding JWT:", error);
      setUser(null);
      localStorage.removeItem(USER_STORAGE_KEY); 
    }
  };

  const handleLoginError = () => {
    console.error("Google Login Failed");
    setUser(null);
    localStorage.removeItem(USER_STORAGE_KEY); 
    setUserTier('free'); 
  };

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
          const response = await fetchData('create-checkout-session', {
              method: 'POST',
              headers: {
                  'Authorization': `Bearer ${user.idToken}`,
                  'Content-Type': 'application/json' 
              },
          });

          if (response && response.sessionId) {
              console.log("Received session ID:", response.sessionId);
              const stripe = await stripePromise;
              const { error } = await stripe.redirectToCheckout({
                  sessionId: response.sessionId,
              });
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


  return (
    <>
      <nav style={{ padding: '10px 20px', backgroundColor: '#eee', borderBottom: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <button 
            onClick={() => navigate('/')} 
            className="btn btn-primary" 
            style={{ marginRight: '15px' }} 
          >
            Home
          </button>
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
                  {!isLoadingTier && ` (Tier: ${userTier})`}
                  {isLoadingTier && ` (Loading tier...)`}
              </span>

              {userTier === 'free' && !isLoadingTier && (
                  <button
                      onClick={handleUpgradeClick}
                      className="btn btn-success" 
                      style={{ margin: '0 10px' }}
                  >
                      Upgrade to Premium
                  </button>
              )}

              <button onClick={handleManualLogoutClick} className="btn btn-danger"> 
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

      <Routes>
        <Route path="/" element={<CollegeTransferForm />} />
        <Route
          path="/agreement/:sendingId/:receivingId/:yearId"
          element={<AgreementViewerPage user={user} userTier={userTier} />}
        />
        <Route
          path="/course-map"
          element={<CourseMap user={user} />}
        />
        <Route path="/payment-success" element={<PaymentSuccess />} />
        <Route path="/payment-cancel" element={<PaymentCancel />} />
      </Routes>
    </>
  );
}

export default App;