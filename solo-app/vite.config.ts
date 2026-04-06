import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      // Preview is on its own dedicated port (3002) — no proxy needed.
      // The iframe points directly at http://localhost:3002 (or VITE_PREVIEW_ORIGIN).
      // In production SaaS this becomes {project-id}.preview.hostaposta.app.
    },
  },
})
