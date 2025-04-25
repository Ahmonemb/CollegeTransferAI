import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  // eslint-disable-next-line no-undef
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    define: {
      // Expose environment variables to your client code
      'process.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(env.VITE_GOOGLE_CLIENT_ID),
    },
    server: {
      // Configure headers for development server (useful for OAuth popups)
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
      proxy: {
        // Proxy API requests to the Flask backend
        '/api': {
          target: 'http://127.0.0.1:5000', // Your Flask backend address
          changeOrigin: true, // Recommended for virtual hosted sites
          secure: false, // Set to true if your backend uses HTTPS with a valid cert
          // --- Add rewrite rule ---
          rewrite: (path) => path.replace(/^\/api/, ''), // Remove /api prefix
          // --- End rewrite rule ---
        },
      },
    },
  };
});
