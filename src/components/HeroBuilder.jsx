import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Button, Chip, useConfirm } from './ui.jsx'
import { COLOR_ROLES, MAX_NAME_LENGTH, MAX_SIZE, MIN_SIZE, NUDGE, SWATCHES } from '../data/forge.js'
import { PARTS, SLOTS, findPart, shapeOf } from '../forge/parts.js'
import { DEFAULT_RECIPE, randomRecipe, STARTERS } from '../forge/recipes.js'

// The 🛠️ Hero Builder (#builder): snap parts together into your own 3D figure, stretch
// each part with its sliders and paint it. It all happens on the iPad (src/forge), so
// trying things costs nothing; 💾 Save keeps the figure's recipe on the Pi
// (server/forge.js) so it can be opened again, on any screen.

const ForgeStage = lazy(() => import('./ForgeStage.jsx'))

const DRAFT_KEY = 'ashardalon-forge-draft'
const NAME_KEY = 'ashardalon-idea-from' // the same remembered name as the 💡 ideas box

const MOVES = [
  ['Idle', '🧍 Stand'],
  ['Walk', '🚶 Walk'],
  ['Swing', '⚔️ Swing'],
  ['Magic', '✨ Magic'],
  ['Cheer', '🙌 Cheer'],
]

function stored(key, fallback) {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}
function rememberedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}
function rememberName(name) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {
    // Private mode.
  }
}
function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private mode: nothing is remembered on this screen, which is fine.
  }
}

async function call(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    cache: 'no-store',
    ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'The Pi did not answer.')
  return data
}

export default function HeroBuilder() {
  // The figure being built, and the saved figure it came from (if any).
  const [draft, setDraft] = useState(() => stored(DRAFT_KEY, { recipe: { ...DEFAULT_RECIPE, from: rememberedName() }, id: null }))
  const { recipe, id } = draft
  const [tab, setTab] = useState('body')
  const [move, setMove] = useState(['Idle', 0])
  const [spin, setSpin] = useState(true)
  const [figures, setFigures] = useState(null)
  const [status, setStatus] = useState(null) // null | saving | saved | error text
  const [ask, dialog] = useConfirm()

  useEffect(() => store(DRAFT_KEY, draft), [draft])
  const loadFigures = useCallback(() => call('/forge.json').then((d) => setFigures(d.figures), () => setFigures([])), [])
  useEffect(() => {
    loadFigures()
  }, [loadFigures])

  const change = (patch) => {
    setStatus(null)
    setDraft((d) => ({ ...d, recipe: { ...d.recipe, ...patch } }))
  }
  const setPart = (slot, partId) => {
    const parts = { ...recipe.parts }
    if (partId) parts[slot] = { id: partId, shape: recipe.parts[slot]?.id === partId ? recipe.parts[slot].shape : {} }
    else delete parts[slot]
    change({ parts })
  }
  // One slider, or every slider back to normal (key null) in one change: one setShape per
  // slider would each start from the same old recipe, and only the last would stick.
  const setShape = (slot, key, value) =>
    change({ parts: { ...recipe.parts, [slot]: { ...recipe.parts[slot], shape: key === null ? {} : { ...recipe.parts[slot].shape, [key]: value } } } })
  // The ↔ Move it sliders; `null` puts the part back where it was made to sit.
  const setNudge = (slot, key, value) => {
    const { nudge, ...pick } = recipe.parts[slot]
    const next = key ? { ...nudge, [key]: value } : {}
    change({ parts: { ...recipe.parts, [slot]: Object.values(next).some((v) => v) ? { ...pick, nudge: next } : pick } })
  }
  const open = (next, nextId = null) => {
    setStatus(null)
    setDraft({ recipe: structuredClone(next), id: nextId })
    setTab('body')
  }

  const save = async () => {
    setStatus('saving')
    try {
      if (recipe.from?.trim()) rememberName(recipe.from.trim())
      const saved = id ? await call(`/forge/${id}`, 'POST', recipe) : await call('/forge', 'POST', recipe)
      setDraft((d) => ({ ...d, id: saved.id }))
      setStatus('saved')
      loadFigures()
    } catch (error) {
      setStatus(error.message)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-3 text-left text-zinc-100 sm:p-4">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-auto font-display text-3xl font-bold text-amber-300 sm:text-4xl">🛠️ Hero Builder</h1>
          <a href="/" className="text-sm text-amber-300 underline">
            Back to the game
          </a>
        </div>
        <div className="mt-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:gap-4">
          <div className="lg:sticky lg:top-3 lg:self-start">
            <Suspense fallback={<div className="h-[42vh] rounded-2xl bg-[#1c1426] lg:h-[calc(100vh-9rem)]" />}>
              <ForgeStage recipe={recipe} move={move[0]} moveKey={move[1]} spin={spin} className="h-[42vh] w-full lg:h-[calc(100vh-9rem)]" />
            </Suspense>
            <div className="mt-2 flex flex-wrap gap-2">
              {MOVES.map(([name, label]) => (
                <button key={name} type="button" className="min-h-10 rounded-full bg-zinc-800 px-3 text-sm text-zinc-200 active:scale-95" onClick={() => setMove([name, Date.now()])}>
                  {label}
                </button>
              ))}
              <button type="button" className={`min-h-10 rounded-full px-3 text-sm active:scale-95 ${spin ? 'bg-zinc-800 text-zinc-200' : 'bg-amber-500 text-zinc-950'}`} onClick={() => setSpin((v) => !v)}>
                {spin ? '⏸ Stop turning' : '🔄 Turn'}
              </button>
            </div>
          </div>

          <div className="mt-3 lg:mt-0">
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-0 flex-1 text-sm text-zinc-400">
                Hero name
                <input className="mt-1 block min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-lg text-zinc-100" value={recipe.name} maxLength={MAX_NAME_LENGTH} onChange={(e) => change({ name: e.target.value })} />
              </label>
              <label className="block w-32 text-sm text-zinc-400">
                Made by
                <input className="mt-1 block min-h-11 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-zinc-100" value={recipe.from ?? ''} placeholder="Your name" maxLength={MAX_NAME_LENGTH} onChange={(e) => change({ from: e.target.value })} />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="gold" disabled={status === 'saving'} onClick={save}>
                {status === 'saving' ? 'Saving…' : status === 'saved' ? '✅ Saved' : id ? '💾 Save changes' : '💾 Save'}
              </Button>
              <Button onClick={() => open(randomRecipe())}>🎲 Surprise me</Button>
              <Button onClick={() => setTab('figures')}>📂 My heroes{figures?.length ? ` (${figures.length})` : ''}</Button>
            </div>
            {status && !['saving', 'saved'].includes(status) && <p className="mt-2 text-red-300">{status}</p>}

            <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist">
              {SLOTS.map((slot) => (
                <SlotTab key={slot.key} active={tab === slot.key} onClick={() => setTab(slot.key)} emoji={findPart(slot.key, recipe.parts[slot.key]?.id)?.emoji ?? slot.emoji} label={slot.label} />
              ))}
              <SlotTab active={tab === 'colors'} onClick={() => setTab('colors')} emoji="🎨" label="Colors" />
            </div>

            <div className="mt-2 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
              {SLOTS.some((s) => s.key === tab) && <SlotPanel slot={SLOTS.find((s) => s.key === tab)} pick={recipe.parts[tab]} setPart={setPart} setShape={setShape} setNudge={setNudge} />}
              {tab === 'colors' && <ColorPanel recipe={recipe} change={change} />}
              {tab === 'figures' && (
                <FigureList
                  figures={figures}
                  currentId={id}
                  onOpen={(f) => open(f.recipe, f.id)}
                  onStart={(r) => open({ ...r, from: recipe.from })}
                  onUse={async (f, on) => {
                    try {
                      await call(`/forge/${f.id}`, 'POST', { useInGame: on })
                      setStatus(null)
                    } catch (error) {
                      setStatus(error.message)
                    }
                    loadFigures()
                  }}
                  onDelete={(f) =>
                    ask({ title: `Throw away ${f.recipe.name}?`, body: 'It goes away on every screen.', yes: 'Throw it away', danger: true }, async () => {
                      await call(`/forge/${f.id}`, 'DELETE').catch(() => null)
                      if (f.id === id) setDraft((d) => ({ ...d, id: null }))
                      loadFigures()
                    })
                  }
                />
              )}
            </div>
          </div>
        </div>
      </div>
      {dialog}
    </div>
  )
}

function SlotTab({ active, onClick, emoji, label }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-h-14 min-w-16 shrink-0 flex-col items-center justify-center rounded-xl px-2 text-xs transition active:scale-95 ${active ? 'bg-amber-500 font-semibold text-zinc-950' : 'bg-zinc-800 text-zinc-300'}`}
    >
      <span className="text-xl leading-none">{emoji}</span>
      <span className="mt-1 whitespace-nowrap">{label}</span>
    </button>
  )
}

function SlotPanel({ slot, pick, setPart, setShape, setNudge }) {
  const part = findPart(slot.key, pick?.id)
  const shape = part ? shapeOf(part, pick.shape) : {}
  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-200">
        {slot.emoji} {slot.label}
      </h2>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
        {slot.optional && <PartButton active={!part} emoji="🚫" name="None" onClick={() => setPart(slot.key, null)} />}
        {PARTS[slot.key].map((p) => (
          <PartButton key={p.id} active={part?.id === p.id} emoji={p.emoji} name={p.name} onClick={() => setPart(slot.key, p.id)} />
        ))}
      </div>
      {part?.shape?.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <h3 className="mr-auto font-semibold text-zinc-200">Change its shape</h3>
            <button type="button" className="min-h-9 rounded-full bg-zinc-800 px-3 text-sm text-zinc-300" onClick={() => setShape(slot.key, null)}>
              ↺ Normal
            </button>
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {part.shape.map(({ key, label, min, max }) => {
              const whole = max - min >= 2 && Number.isInteger(min) && Number.isInteger(max) && max <= 30 && min >= 1
              return (
                <label key={key} className="block text-zinc-200">
                  {label} <span className="text-sm text-zinc-500">{whole ? Math.round(shape[key]) : `${Math.round(shape[key] * 100)}%`}</span>
                  <input
                    type="range"
                    className="mt-1 h-8 w-full accent-amber-400"
                    min={min}
                    max={max}
                    step={whole ? 1 : 0.01}
                    value={shape[key]}
                    aria-label={label}
                    onChange={(e) => setShape(slot.key, key, Number(e.target.value))}
                  />
                </label>
              )
            })}
          </div>
        </div>
      )}
      {part && slot.nudge && (
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <h3 className="mr-auto font-semibold text-zinc-200">↔ Move it</h3>
            <button type="button" className="min-h-9 rounded-full bg-zinc-800 px-3 text-sm text-zinc-300" onClick={() => setNudge(slot.key, null)}>
              ↺ Back in place
            </button>
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {NUDGE.map(({ key, label }) => (
              <label key={key} className="block text-zinc-200">
                {label}
                <input
                  type="range"
                  className="mt-1 h-8 w-full accent-sky-400"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={pick.nudge?.[key] ?? 0}
                  aria-label={`Move it: ${label}`}
                  onChange={(e) => setNudge(slot.key, key, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PartButton({ active, emoji, name, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-16 flex-col items-center justify-center rounded-xl border px-1 py-2 text-sm transition active:scale-95 ${active ? 'border-amber-400 bg-amber-500/20 text-amber-100' : 'border-zinc-700 bg-zinc-800 text-zinc-200'}`}
    >
      <span className="text-2xl leading-none">{emoji}</span>
      <span className="mt-1 text-center leading-tight">{name}</span>
    </button>
  )
}

function ColorPanel({ recipe, change }) {
  const setColor = (key, hex) => change({ colors: { ...recipe.colors, [key]: hex } })
  return (
    <div>
      <label className="block text-zinc-200">
        📏 Whole size <span className="text-sm text-zinc-500">{Math.round((recipe.size ?? 1) * 100)}%</span>
        <input type="range" className="mt-1 h-8 w-full accent-amber-400" min={MIN_SIZE} max={MAX_SIZE} step={0.01} value={recipe.size ?? 1} aria-label="Whole size" onChange={(e) => change({ size: Number(e.target.value) })} />
      </label>
      {COLOR_ROLES.map(({ key, label }) => (
        <section key={key} className="mt-3">
          <div className="flex items-center gap-2">
            <h3 className="mr-auto font-semibold text-zinc-200">{label}</h3>
            <label className="flex items-center gap-1 text-sm text-zinc-400">
              Any color
              <input type="color" className="h-9 w-12 rounded border border-zinc-700 bg-zinc-900" value={recipe.colors?.[key] ?? '#ffffff'} aria-label={`${label}: any color`} onChange={(e) => setColor(key, e.target.value)} />
            </label>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`${label} ${hex}`}
                className={`h-8 w-8 rounded-full border-2 ${recipe.colors?.[key] === hex ? 'border-amber-300 ring-2 ring-amber-400' : 'border-zinc-700'}`}
                style={{ background: hex }}
                onClick={() => setColor(key, hex)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function FigureList({ figures, currentId, onOpen, onStart, onUse, onDelete }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-200">✨ Start from</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {STARTERS.map((r) => (
          <Chip key={r.name} onClick={() => onStart(r)}>
            {r.name}
          </Chip>
        ))}
      </div>
      <h2 className="mt-5 text-lg font-semibold text-zinc-200">📂 Saved heroes</h2>
      <p className="mt-1 text-sm text-zinc-400">Tap 🎮 to play with one: your hero wears it on the 3D board when your name in the game is the same as "Made by".</p>
      {figures === null && <p className="mt-2 text-zinc-400">Opening…</p>}
      {figures?.length === 0 && <p className="mt-2 text-zinc-400">None yet. Build one and tap 💾 Save.</p>}
      <ul className="mt-2 space-y-2">
        {(figures ?? []).map((f) => (
          <li key={f.id} className={`flex flex-wrap items-center gap-2 rounded-xl border p-2 ${f.id === currentId ? 'border-amber-500/70 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'}`}>
            <div className="mr-auto min-w-0">
              <p className="truncate font-semibold text-zinc-100">{f.recipe.name}</p>
              <p className="text-sm text-zinc-500">{[f.recipe.from, f.savedAt?.slice(0, 10)].filter(Boolean).join(' · ')}</p>
            </div>
            <Button variant={f.useInGame ? 'gold' : 'default'} aria-pressed={Boolean(f.useInGame)} disabled={!f.recipe.from} onClick={() => onUse(f, !f.useInGame)}>
              {f.useInGame ? '🎮 In the game' : '🎮 Use'}
            </Button>
            <Button onClick={() => onOpen(f)}>Open</Button>
            <Button variant="ghost" aria-label={`Throw away ${f.recipe.name}`} onClick={() => onDelete(f)}>
              🗑️
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
