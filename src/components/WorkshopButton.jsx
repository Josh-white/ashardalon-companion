import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { playerNames } from './IdeaBox.jsx'
import { workshopStatus } from '../data/workshop.js'

// The 🧙 Model Workshop (and the 🎮 My models tab with the Hero Builder's parts list inside
// it) loads only when the pill is tapped, so every screen's first download stays small.
const Workshop = lazy(() => import('./ModelWorkshop.jsx').then((m) => ({ default: m.Workshop })))

export async function loadWorkshop() {
  const res = await fetch('/workshop.json', { cache: 'no-store' })
  if (!res.ok) throw new Error('Could not open the workshop.')
  return (await res.json()).requests
}

// The workshop's list, loaded now and again every `every` ms while it's showing.
export function useWorkshop(every) {
  const [requests, setRequests] = useState(null)
  const [removed, setRemoved] = useState([])
  const [error, setError] = useState(null)
  const reload = useCallback(
    () =>
      loadWorkshop().then(
        (r) => {
          // Some other screen's pretend Pi (the tests) may answer with no list at all.
          const all = Array.isArray(r) ? r : []
          setRequests(all.filter((x) => !x.hidden))
          setRemoved(all.filter((x) => x.hidden))
          setError(null)
        },
        (e) => setError(e.message),
      ),
    [],
  )
  useEffect(() => {
    reload()
    if (!every) return undefined
    const timer = setInterval(reload, every)
    return () => clearInterval(timer)
  }, [reload, every])
  return { requests, removed, error, reload }
}

// The 🧙 pill on the game bar. It says "📸 Pictures!" when Claude has sent new ones.
export function WorkshopButton({ state, me = '', className = '' }) {
  const [open, setOpen] = useState(false)
  const { requests } = useWorkshop(60000)
  const newPictures = (requests ?? []).some((r) => workshopStatus(r) === 'look')
  return (
    <>
      <button type="button" className={`py-1.5 text-violet-200 ${newPictures ? 'animate-pulse bg-violet-500/40' : 'bg-violet-500/15'} ${className}`} onClick={() => setOpen(true)}>
        {newPictures ? '🧙 📸 Pictures!' : '🧙 My model'}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70] overflow-y-auto bg-zinc-950/95 p-3 sm:p-6">
            <Suspense fallback={<p className="text-center text-zinc-400">Opening the workshop…</p>}>
              <Workshop names={playerNames(state)} me={me} onClose={() => setOpen(false)} />
            </Suspense>
          </div>,
          document.body,
        )}
    </>
  )
}
