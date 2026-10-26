import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In development, `npm run dev:server` holds the shared game.
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
})
