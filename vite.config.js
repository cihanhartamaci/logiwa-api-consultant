import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Ensures assets are loaded relative to index.html for GitHub Pages
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/constants/swagger.json')) return 'swagger-data'
          if (id.includes('/src/constants/helpCenter.json')) return 'help-center-data'
        },
      },
    },
  },
})
