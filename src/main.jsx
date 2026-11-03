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
const CardCheck = lazy(() => import('./components/CardCheck.jsx'))
const AllScreens = lazy(() => import('./components/AllScreens.jsx'))
const FriendsPage = lazy(() => import('./components/FriendsPage.jsx'))
const ModelGallery = lazy(() => import('./components/ModelGallery.jsx'))
const WorkshopPage = lazy(() => import('./components/ModelWorkshop.jsx'))
const HeroBuilder = lazy(() => import('./components/HeroBuilder.jsx'))
const AdminPage = lazy(() => import('./components/AdminPage.jsx'))

// The page is picked once, when it loads, so a link that only changes the # (like the
// ones on #admin) reloads to open the new page.
window.addEventListener('hashchange', () => window.location.reload())

// A pinch that misses the board would zoom the whole page on an iPad (Safari ignores the
// viewport's no-zoom), and a zoomed page is slow and hard to get back out of. The board
// has its own pinch zoom, and the rest of the screens don't need one.
document.addEventListener('gesturestart', (e) => e.preventDefault())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* The #cards page lists cards.json problems and cards the app can't find. */}
    {/* The #ideas page lists the ideas the players sent from the 💡 button. */}
    {/* The #friends page shows how much each friend from outside plays. */}
    {/* The #models page shows every 3D figure on a turntable, with its moves. */}
    {/* The #workshop page is the 🧙 Model Workshop on its own: the boys' own 3D figures. */}
    {/* The #builder page is the 🛠️ Hero Builder: snap parts together into your own 3D hero. */}
    {/* The #admin page links to all of these; it opens from the bottom of "Which game?". */}
    {/* The #screens page shows the big screen, iPads and a phone side by side, for testing. */}
    {/* A screen that breaks shows "Something went wrong" and reloads, instead of going blank. */}
    <CrashScreen>
      <Suspense fallback={null}>
        {window.location.hash === '#screens' ? (
          <AllScreens />
        ) : window.location.hash === '#ideas' ? (
          <IdeasPage />
        ) : window.location.hash === '#friends' ? (
          <FriendsPage />
        ) : window.location.hash === '#cards' ? (
          <CardCheck />
        ) : window.location.hash === '#models' ? (
          <ModelGallery />
        ) : window.location.hash === '#workshop' ? (
          <WorkshopPage />
        ) : window.location.hash === '#builder' ? (
          <HeroBuilder />
        ) : window.location.hash === '#admin' ? (
          <AdminPage />
        ) : (
          <App />
        )}
      </Suspense>
    </CrashScreen>
  </StrictMode>,
)
