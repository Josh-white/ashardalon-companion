import { useEffect, useRef, useState } from 'react'
import { SCREEN_PREFIX } from '../state/screenStorage.js'
import { Button } from './ui.jsx'
import { AdminLink } from './AdminLink.jsx'

// The screens at their real sizes in CSS pixels.
const SIZES = {
  big: { label: 'Big screen', width: 1920, height: 1080 },
  ipad: { label: 'iPad', width: 820, height: 1180 },
  phone: { label: 'Phone', width: 390, height: 844 },
}
const GAP = 16
const LABEL = 40
const SETUP_KEY = 'ashardalon-companion/all-screens'

function loadSetup() {
  try {
    return { ipads: 2, phone: true, ...JSON.parse(localStorage.getItem(SETUP_KEY) ?? '{}') }
  } catch {
    return { ipads: 2, phone: true }
  }
}

// Forgets everything one pane remembered, so it starts again like a new device.
function forget(name) {
  const prefix = `${SCREEN_PREFIX}${name}:`
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const keys = []
      for (let i = 0; i < storage.length; i++) if (storage.key(i)?.startsWith(prefix)) keys.push(storage.key(i))
      keys.forEach((key) => storage.removeItem(key))
    } catch {
      // Storage blocked: nothing was remembered either.
    }
  }
}

function Pane({ name, size, scale, version, onReset }) {
  const frame = useRef(null)
  return (
    <div className="flex shrink-0 flex-col gap-1" style={{ width: size.width * scale }}>
      <div className="flex items-center gap-2 text-sm text-zinc-300" style={{ height: LABEL - 4 }}>
        <span className="mr-auto font-semibold">{name}</span>
        <button type="button" className="underline" onClick={() => frame.current?.contentWindow?.location.reload()}>
          Reload
        </button>
        <button type="button" className="underline" onClick={onReset}>
          New device
        </button>
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-700" style={{ width: size.width * scale, height: size.height * scale }}>
        <iframe
          ref={frame}
          key={version}
          title={name}
          src={`/?screen=${encodeURIComponent(name)}`}
          allow="autoplay; fullscreen"
          style={{ width: size.width, height: size.height, transform: `scale(${scale})`, transformOrigin: 'top left', border: 0 }}
        />
      </div>
    </div>
  )
}

// The #screens test page: the big screen, a few iPads and a phone side by side in one
// tab, each at its real size (scaled to fit) and each its own device in the game, so a
// whole turn can be tried without a pile of browser windows.
export default function AllScreens() {
  const [setup, setSetup] = useState(loadSetup)
  const [versions, setVersions] = useState({})
  const [view, setView] = useState({ width: window.innerWidth, height: window.innerHeight })

  useEffect(() => {
    const resize = () => setView({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify(setup))
    } catch {
      // Storage blocked: the layout resets on reload.
    }
  }, [setup])

  const panes = [
    { name: 'Big screen', size: SIZES.big },
    ...Array.from({ length: setup.ipads }, (_, i) => ({ name: `iPad ${i + 1}`, size: SIZES.ipad })),
    ...(setup.phone ? [{ name: 'Phone', size: SIZES.phone }] : []),
  ]
  const totalWidth = panes.reduce((sum, p) => sum + p.size.width, 0)
  const tallest = Math.max(...panes.map((p) => p.size.height))
  const header = 56
  const scale = Math.min((view.width - GAP * (panes.length + 1)) / totalWidth, (view.height - header - LABEL - GAP * 2) / tallest)

  const reset = (name) => {
    forget(name)
    setVersions((v) => ({ ...v, [name]: (v[name] ?? 0) + 1 }))
  }
  const resetAll = () => panes.forEach((p) => reset(p.name))

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex flex-wrap items-center gap-3 px-4" style={{ minHeight: header }}>
        <AdminLink />
        <h1 className="mr-auto font-display text-xl font-bold text-amber-400">All screens</h1>
        <span className="text-sm text-zinc-400">iPads</span>
        <Button className="!px-3 !py-1" disabled={setup.ipads <= 0} onClick={() => setSetup({ ...setup, ipads: setup.ipads - 1 })}>
          −
        </Button>
        <span className="w-4 text-center">{setup.ipads}</span>
        <Button className="!px-3 !py-1" disabled={setup.ipads >= 4} onClick={() => setSetup({ ...setup, ipads: setup.ipads + 1 })}>
          +
        </Button>
        <label className="flex items-center gap-1 text-sm text-zinc-300">
          <input type="checkbox" checked={setup.phone} onChange={(e) => setSetup({ ...setup, phone: e.target.checked })} /> Phone
        </label>
        <Button className="text-sm" onClick={resetAll}>
          Make every screen a new device
        </Button>
      </header>
      <div className="flex items-start justify-center" style={{ gap: GAP, padding: `0 ${GAP}px ${GAP}px` }}>
        {panes.map((pane) => (
          <Pane key={pane.name} name={pane.name} size={pane.size} scale={scale} version={versions[pane.name] ?? 0} onReset={() => reset(pane.name)} />
        ))}
      </div>
    </main>
  )
}
