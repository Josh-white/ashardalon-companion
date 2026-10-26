import { useState } from 'react'
import { HERO_COLORS, HERO_TEMPLATES } from '../data/heroes.js'
import { createHero } from '../state/game.js'
import { Button, Stepper } from './ui.jsx'

export default function Setup({ onStart }) {
  const [picked, setPicked] = useState([])
  const [stats, setStats] = useState(() =>
    Object.fromEntries(HERO_TEMPLATES.map((t) => [t.key, { maxHp: t.maxHp, ac: t.ac, surgeValue: t.surgeValue }])),
  )
  const [players, setPlayers] = useState({})

  const togglePick = (key) =>
    setPicked((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]))

  const setStat = (key, stat, value) => setStats((s) => ({ ...s, [key]: { ...s[key], [stat]: value } }))

  const start = () => {
    const heroes = picked.map((key) => {
      const template = HERO_TEMPLATES.find((t) => t.key === key)
      const hero = createHero(template, stats[key])
      return { ...hero, player: players[key]?.trim() || '' }
    })
    onStart(heroes)
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-8">
      <header className="mb-8 text-center">
        <h1 className="font-display text-4xl font-bold text-amber-400 sm:text-5xl">Wrath of Ashardalon</h1>
        <p className="mt-2 text-lg text-zinc-400">Choose your heroes. Tap them in the order you'll take turns.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {HERO_TEMPLATES.map((template) => {
          const order = picked.indexOf(template.key)
          const isPicked = order >= 0
          const color = HERO_COLORS[template.color]
          return (
            <div
              key={template.key}
              className={`rounded-2xl border border-zinc-800 p-4 transition ${
                isPicked ? `${color.bg} ring-2 ${color.ring}` : 'bg-zinc-900'
              }`}
            >
              <button type="button" className="flex w-full items-center gap-4 text-left" onClick={() => togglePick(template.key)}>
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-xl font-bold ${
                    isPicked ? `${color.solid} text-zinc-950` : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {isPicked ? order + 1 : '+'}
                </span>
                <span>
                  <span className={`block font-display text-2xl font-bold ${color.text}`}>{template.name}</span>
                  <span className="text-zinc-400">{template.className}</span>
                </span>
              </button>

              {isPicked && (
                <div className="mt-4 space-y-3">
                  <input
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100"
                    placeholder="Who's playing this hero?"
                    value={players[template.key] ?? ''}
                    onChange={(e) => setPlayers((p) => ({ ...p, [template.key]: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-4">
                    <Stepper label="HP" value={stats[template.key].maxHp} min={1} onChange={(v) => setStat(template.key, 'maxHp', v)} />
                    <Stepper label="AC" value={stats[template.key].ac} min={1} onChange={(v) => setStat(template.key, 'ac', v)} />
                    <Stepper label="Surge heals" value={stats[template.key].surgeValue} min={1} onChange={(v) => setStat(template.key, 'surgeValue', v)} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-center text-sm text-zinc-500">Check the numbers against your hero cards before you start.</p>

      <div className="mt-6 flex justify-center">
        <Button variant="gold" className="px-10 py-4 text-xl" disabled={picked.length === 0} onClick={start}>
          Enter the dungeon
        </Button>
      </div>
    </div>
  )
}
