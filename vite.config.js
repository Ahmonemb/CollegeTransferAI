import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // Your frontend port
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000', // Your Flask backend address
        changeOrigin: true,
        // No rewrite needed if Flask routes start with /api
      },
    },
    // Adjust headers for development to allow Google OAuth popup communication
    headers: {
      // Option 1: Potentially allows the popup communication needed by Google
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      // Option 2: Less secure, use only if Option 1 doesn't work and for testing
      // 'Cross-Origin-Opener-Policy': 'unsafe-none',
      'Cross-Origin-Embedder-Policy': 'require-corp', // Or 'unsafe-none' if needed
    }
  },
  // Define environment variables for client-side access
  define: {
    // ESLint should no longer complain about 'process' here
    // eslint-disable-next-line no-undef
    'process.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(process.env.VITE_GOOGLE_CLIENT_ID)
  }
})
