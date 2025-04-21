import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // Your frontend port
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000', // Use IPv4 address explicitly
        changeOrigin: true, // Recommended
        rewrite: (path) => {
          console.log(`Vite proxy intercepted: ${path}`);
          const rewritten = path.replace(/^\/api/, '');
          console.log(`Rewritten to: ${rewritten}`);
          return rewritten;
        },
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('Proxy error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log(`Proxy request: ${req.method} ${req.url} → ${proxyReq.method} ${proxyReq.path}`);
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log(`Proxy response: ${req.method} ${req.url} → ${proxyRes.statusCode}`);
          });
        }
      }
    }
  }
})
