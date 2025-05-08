const USER_STORAGE_KEY = 'collegeTransferUser';
const API_BASE_URL = '/api';

export async function fetchData(endpoint, options = {}) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    const url = `${API_BASE_URL}/${cleanEndpoint}`;
    let token = null;
    try {
        const storedUser = localStorage.getItem(USER_STORAGE_KEY);
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            if (parsedUser?.idToken) {
                token = parsedUser.idToken;
            }
        }
    } catch (e) { console.error("Error reading user token from localStorage", e); }

    const headers = {
        'Content-Type': 'application/json',
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
        if (response.status === 401) {
            console.warn(`API request to ${url} resulted in 401 Unauthorized. Token likely expired or invalid.`);
            window.dispatchEvent(new CustomEvent('auth-expired'));
            throw new Error("Authentication required or session expired.");
        }
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData.error || errorData.message || `HTTP error! status: ${response.status}`);
        }
        const contentType = response.headers.get("content-type");
        if (response.status === 204 || !contentType) {
            return null;
        }
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return response.json();
        } else {
            return response.text();
        }

    } catch (error) {
        console.error(`Fetch error for ${url}:`, error.message);
        if (error.message !== "Authentication required or session expired.") {
             throw error;
        }
        return null;
    }
}
