import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const cspPlugin = () => ({
  name: 'inject-csp',
  transformIndexHtml(html) {
    const csp = [
      "default-src 'self'",
      "script-src 'self' https://accounts.google.com https://apis.google.com",
      "connect-src 'self' https://*.onrender.com https://autozalo.vn https://www.autozalo.vn https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com http://127.0.0.1:3000 http://localhost:3000 http://127.0.0.1:4517 http://localhost:4517",
      "frame-src https://accounts.google.com",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');
    return html.replace(
      '<meta name="referrer"',
      `<meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer"`,
    );
  },
});

export default defineConfig(({ command }) => ({
  plugins: [react(), ...(command === 'build' ? [cspPlugin()] : [])],
  server: {
    host: 'localhost',
    port: 3001,
    strictPort: true,
    open: '/',
    warmup: {
      clientFiles: ['./src/main.jsx', './src/App.jsx', './src/pages/ReachPage.jsx'],
    },
  },
  preview: {
    host: 'localhost',
    port: 3001,
    strictPort: true,
    open: '/',
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@mui/material',
      '@mui/icons-material',
      '@mui/lab',
      '@emotion/react',
      '@emotion/styled',
    ],
  },
}));
