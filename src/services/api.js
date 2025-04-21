
/**
 * Fetches data from a backend endpoint via the /api proxy.
 * @param {string} endpoint - The API endpoint *without* the leading /api/ (e.g., 'institutions', 'chat', 'pdf-images/filename.pdf').
 * @param {object} options - Optional fetch options (method, headers, body, etc.). Defaults to GET.
 * @returns {Promise<object|null>} - A promise that resolves with the JSON data or null for empty responses.
 * @throws {Error} - Throws an error if the fetch fails or response is not ok.
 */
export async function fetchData(endpoint, options = {}) {
    // Construct the full URL, always prepending /api/
    // Ensure no double slashes if endpoint accidentally starts with one
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    const url = `/api/${cleanEndpoint}`; // Use relative path for the proxy

    try {
        console.log(`Fetching data from: ${url} with options:`, options); // Log URL and options

        // *** Pass the options object as the second argument to fetch ***
        const response = await fetch(url, options);

        if (!response.ok) {
            // Try to get error details from response body if available
            let errorBody = null;
            try {
                // Use .text() first in case the error isn't JSON
                const text = await response.text();
                if (text) {
                    errorBody = JSON.parse(text); // Try parsing as JSON
                }
            } catch (e) {
                // Ignore if response body is not JSON or empty
                console.warn("Could not parse error response body as JSON:", e);
            }
            // Use error from body if available, otherwise use status text
            const errorMessage = errorBody?.error || response.statusText || `HTTP error! status: ${response.status}`;
            throw new Error(errorMessage);
        }

        // Handle cases where response might be empty (e.g., 204 No Content)
        if (response.status === 204) {
            return null; // Return null for empty successful responses
        }

        // Check content type before assuming JSON
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            const data = await response.json();
            return data;
        } else {
            // Handle non-JSON responses if necessary, or throw an error
            console.warn(`Received non-JSON response from ${url}`);
            return await response.text(); // Or handle differently
        }

    } catch (error) {
        console.error(`Error fetching ${url}:`, error);
        // Re-throw the error so the component can handle it
        // Ensure it's an actual Error object
        if (error instanceof Error) {
            throw error;
        } else {
            throw new Error(String(error));
        }
    }
}
