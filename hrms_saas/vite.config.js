import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const configuredApiUrl = env.VITE_API_BASE_URL || '/api';
  const socketTarget = /^https?:\/\//.test(configuredApiUrl)
    ? new URL(configuredApiUrl).origin
    : (env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000');

  return {
    server: {
      proxy: {
        '/socket.io': {
          target: socketTarget,
          ws: true,
          changeOrigin: true,
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'production-security-guard',
        buildStart() {
          if (mode === 'production') {
            const apiUrl = env.VITE_API_BASE_URL || '';
            if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
              throw new Error(
                `[Security Guard] Production build failed: VITE_API_BASE_URL contains localhost/127.0.0.1: "${apiUrl}". Production must use relative paths ("/api") or an approved production domain.`
              );
            }
          }
        },
      },
    ],
  };
});
