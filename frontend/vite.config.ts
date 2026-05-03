import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {}
  },
  server: {
    host: '0.0.0.0',
    hmr: false,
    proxy: {
      '/api': {
        target: 'http://inventory-api:8000',
        changeOrigin: true
      }
    }
  }
})
