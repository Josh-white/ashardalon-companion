// Must come first: on the #screens page it gives each pane its own storage.
import './state/screenStorage.js'
import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import CrashScreen from './components/CrashScreen.jsx'
// Part of the game's own screens already (the 💡 button), so not loaded separately.
import IdeasPage from './components/IdeaBox.jsx'
import './index.css'

// The hidden pages load only when opened, so the game's own screens download less.
const Audition = lazy(() => import('./components/Audition.jsx'))
const CardCheck = lazy(() => import('./components/CardCheck.jsx'))
const TileCheck = lazy(() => import('./components/TileCheck.jsx'))
const AllScreens = lazy(() => import('./components/AllScreens.jsx'))
const FriendsPage = lazy(() => import('./components/FriendsPage.jsx'))

// A pinch that misses the board would zoom the whole page on an iPad (Safari ignores the
// viewport's no-zoom), and a zoomed page is slow and hard to get back out of. The board
// has its own pinch zoom, and the rest of the screens don't need one.
document.addEventListener('gesturestart', (e) => e.preventDefault())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* A hidden page for picking the ElevenLabs sounds; see server/generate-sounds.js. */}
    {/* The #tiles page draws every dungeon tile layout, to check against the real tiles. */}
    {/* The #cards page lists cards.json problems and cards the app can't find. */}
    {/* The #ideas page lists the ideas the players sent from the 💡 button. */}
    {/* The #friends page shows how much each friend from outside plays. */}
    {/* The #screens page shows the big screen, iPads and a phone side by side, for testing. */}
    {/* A screen that breaks shows "Something went wrong" and reloads, instead of going blank. */}
    <CrashScreen>
      <Suspense fallback={null}>
        {window.location.hash === '#screens' ? (
          <AllScreens />
        ) : window.location.hash === '#audition' ? (
          <Audition />
        ) : window.location.hash === '#tiles' ? (
          <TileCheck />
        ) : window.location.hash === '#ideas' ? (
          <IdeasPage />
        ) : window.location.hash === '#friends' ? (
          <FriendsPage />
        ) : window.location.hash === '#cards' ? (
          <CardCheck />
        ) : (
          <App />
        )}
      </Suspense>
    </CrashScreen>
  </StrictMode>,
)
