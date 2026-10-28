import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Audition from './components/Audition.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* A hidden page for picking the ElevenLabs sounds; see server/generate-sounds.js. */}
    {window.location.hash === '#audition' ? <Audition /> : <App />}
  </StrictMode>,
)
