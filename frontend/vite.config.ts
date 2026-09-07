import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: true,
    proxy: {
      // Forwards API calls to the backend so the browser only ever talks to this
      // single dev server port — required when only one port reaches you (e.g. via proxy/tunnel).
      '/api': {
        target: 'http://localhost:8081',
        changeOrigin: true,
      },
    },
  },
})
