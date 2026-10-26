import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    allowedHosts: ['web', 'localhost'],
    port: 5173,
    proxy: {
      '/api': process.env.API_PROXY_TARGET || 'http://localhost:8080',
      '/actuator': process.env.API_PROXY_TARGET || 'http://localhost:8080',
      '/internal': process.env.API_PROXY_TARGET || 'http://localhost:8080',
    },
  },
})
