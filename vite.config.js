import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'

// Which commit this build is, shown on the game picker. On the Pi the Docker build has no
// .git, so scripts/auto-update.sh passes it in as APP_VERSION; elsewhere git is asked.
function appVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion()),
    'import.meta.env.VITE_BUILT_AT': JSON.stringify(new Date().toISOString()),
  },
  server: {
    // In development, `npm run dev:server` holds the shared game.
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
      '/cards.json': 'http://localhost:3000',
    },
  },
})
