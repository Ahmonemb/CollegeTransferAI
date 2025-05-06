/**
 * Fetches data from a backend endpoint via the /api proxy.
 * @param {string} endpoint - The API endpoint *without* the leading /api/ (e.g., 'institutions', 'chat', 'pdf-images/filename.pdf').
 * @param {object} options - Optional fetch options (method, headers, body, etc.). Defaults to GET.
 * @returns {Promise<object|null>} - A promise that resolves with the JSON data or null for empty responses.
 * @throws {Error} - Throws an error if the fetch fails or response is not ok.
 */

// filepath: src/services/api.js
// Assuming USER_STORAGE_KEY is accessible, e.g., imported from a constants file or App.jsx
// If App.jsx defines it, you might need to move it to a shared constants file.
// For example: import { USER_STORAGE_KEY } from '../constants';
const USER_STORAGE_KEY = 'collegeTransferUser'; // Or import from constants
const API_BASE_URL = '/api'; // Ensure no trailing slash

export async function fetchData(endpoint, options = {}) {
    // Ensure endpoint doesn't start with '/' OR base URL doesn't end with '/'
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    const url = `${API_BASE_URL}/${cleanEndpoint}`;

    // Get token from storage
    let token = null;
    try {
        const storedUser = localStorage.getItem(USER_STORAGE_KEY);
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            // Basic check if token exists
            if (parsedUser?.idToken) {
                 // You could add a preliminary expiry check here using jwtDecode,
                 // but the backend check (401) is the definitive one.
                token = parsedUser.idToken;
            }
        }
    } catch (e) { console.error("Error reading user token from localStorage", e); }

    const headers = {
        'Content-Type': 'application/json', // Default content type
        ...options.headers
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(url, {
            ...options,
            headers: headers,
        });

        // --- Check for 401 Unauthorized ---
        if (response.status === 401) {
            console.warn(`API request to ${url} resulted in 401 Unauthorized. Token likely expired or invalid.`);
            // Dispatch custom event to notify the App component to handle logout
            window.dispatchEvent(new CustomEvent('auth-expired'));
            // Throw an error to stop further processing in the calling code
            throw new Error("Authentication required or session expired.");
        }
        // --- End 401 Check ---

        if (!response.ok) {
            // Handle other non-OK responses
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }

        // Handle potential empty responses or non-JSON responses if necessary
        const contentType = response.headers.get("content-type");
        if (response.status === 204 || !contentType) { // Handle No Content or missing content type
            return null; // Or appropriate response
        }
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return response.json();
        } else {
            return response.text(); // Handle plain text response
        }

    } catch (error) {
        console.error(`Fetch error for ${url}:`, error.message);
        // Re-throw the error so calling code (hooks, components) can potentially handle it
        // (e.g., display specific error messages), unless it was the auth error we already handled.
        if (error.message !== "Authentication required or session expired.") {
             throw error;
        }
        // If it was the auth error, we don't need to re-throw, as logout is triggered.
        // Return null or a specific marker if needed by calling code.
        return null;
    }
}
