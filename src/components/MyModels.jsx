import { useCallback, useEffect, useState } from 'react'
import { myModels, modelPath } from '../data/myModels.js'

// 🎮 My models: one place for each player to pick which figure is their hero in the game,
// from everything they made in the 🧙 Model Workshop and the 🛠️ Hero Builder. Shown in the
// workshop (a tab) and on its own page (#mine).

async function loadAll() {
  const get = async (path, key) => {
    const res = await fetch(path, { cache: 'no-store' })
    if (!res.ok) throw new Error('Could not open your models.')
    const list = (await res.json())[key]
    return Array.isArray(list) ? list : []
  }
  const [requests, figures] = await Promise.all([get('/workshop.json', 'requests'), get('/forge.json', 'figures')])
  return myModels(requests, figures)
}

export function MyModels() {
  const [players, setPlayers] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const reload = useCallback(
    () =>
      loadAll().then(
        (p) => {
          setPlayers(p)
          setError(null)
        },
        (e) => setError(e.message),
      ),
    [],
  )
  useEffect(() => {
    reload()
  }, [reload])

  // Turning one on turns the player's others off on the Pi; "Normal hero" turns theirs off.
  const pick = async (player, model) => {
    setBusy(true)
    try {
      const target = model ?? player.models.find((m) => m.on)
      if (target) {
        const res = await fetch(modelPath(target), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ useInGame: Boolean(model) }) })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not change it.')
      }
      await reload()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !players) return <p className="mt-4 text-red-300">{error}</p>
  if (!players) return <p className="mt-6 text-zinc-400">Opening your models…</p>
  return (
    <div className="mt-4">
      <p className="text-zinc-300">
        Pick the figure your hero is on the 3D board. Type the same name when you pick your hero in a game.
      </p>
      {error && <p className="mt-2 text-red-300">{error}</p>}
      {!players.length && (
        <p className="mt-6 text-center text-lg text-zinc-400">
          No models with a name on them yet. Love a model in the workshop, or save one in the{' '}
          <a href="/#builder" className="text-amber-300 underline">
            🛠️ Hero Builder
          </a>{' '}
          with your name in "Made by".
        </p>
      )}
      <div className="mt-3 space-y-5">
        {players.map((p) => {
          const none = !p.models.some((m) => m.on)
          return (
            <section key={p.key} className="rounded-2xl border border-zinc-700 bg-zinc-900/60 p-3" aria-label={`${p.name}'s models`}>
              <h2 className="font-display text-2xl font-bold text-amber-200">{p.name}</h2>
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <ModelTile active={none} disabled={busy} onClick={() => !none && pick(p, null)} label={`${p.name}: normal hero`}>
                  <span className="flex h-24 items-center justify-center text-5xl">🙂</span>
                  <span className="mt-1 block font-semibold">Normal hero</span>
                  <span className="block text-xs text-zinc-400">The game's own figure</span>
                </ModelTile>
                {p.models.map((m) => (
                  <ModelTile key={`${m.source}-${m.id}`} active={m.on} disabled={busy} onClick={() => !m.on && pick(p, m)} label={`${p.name}: ${m.title}`}>
                    {m.picture ? (
                      <img src={m.picture} alt="" className="h-24 w-full rounded-lg bg-zinc-950 object-contain" />
                    ) : (
                      <span className="flex h-24 items-center justify-center gap-0.5 rounded-lg bg-zinc-950 text-3xl">{m.emojis.slice(0, 4).join('') || '🛠️'}</span>
                    )}
                    <span className="mt-1 block truncate font-semibold">{m.title}</span>
                    <span className="block text-xs text-zinc-400">{m.source === 'workshop' ? '🧙 Model Workshop' : '🛠️ Hero Builder'}</span>
                  </ModelTile>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function ModelTile({ active, disabled, onClick, label, children }) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={`relative block w-full rounded-xl border-2 p-2 text-left transition active:scale-95 disabled:opacity-60 ${active ? 'border-emerald-400 bg-emerald-950/50' : 'border-zinc-700 bg-zinc-800'}`}
      >
        {children}
        {active && <span className="absolute right-2 top-2 rounded-full bg-emerald-500 px-2 py-0.5 text-xs font-bold text-zinc-950">🎮 Playing</span>}
      </button>
    </li>
  )
}

export default function MyModelsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-100">
      <div className="mx-auto max-w-3xl text-left">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto font-display text-3xl font-bold text-amber-300 sm:text-4xl">🎮 My models</h1>
          <a href="/" className="text-sm text-amber-300 underline">
            Back to the game
          </a>
        </div>
        <p className="mt-1 flex flex-wrap gap-3 text-sm">
          <a href="/#builder" className="text-amber-200 underline">
            🛠️ Hero Builder
          </a>
          <a href="/#workshop" className="text-violet-300 underline">
            🧙 Model Workshop
          </a>
        </p>
        <MyModels />
      </div>
    </main>
  )
}
