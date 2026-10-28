import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Audition from './components/Audition.jsx'
import TileCheck from './components/TileCheck.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* A hidden page for picking the ElevenLabs sounds; see server/generate-sounds.js. */}
    {/* The #tiles page draws every dungeon tile layout, to check against the real tiles. */}
    {window.location.hash === '#audition' ? <Audition /> : window.location.hash === '#tiles' ? <TileCheck /> : <App />}
  </StrictMode>,
)
