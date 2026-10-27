import { useState } from 'react'
import { HERO_COLORS, XP_TO_CANCEL_ENCOUNTER } from '../data/heroes.js'
import { PHASES } from '../data/phases.js'
import MonsterTurns, { DrawMonsterButton } from './MonsterTurns.jsx'
import { PowerTile } from './PowerList.jsx'
import { Button } from './ui.jsx'

export default function TurnGuide({ state, dispatch }) {
  const { heroIndex, phase, round } = state.turn
  const hero = state.heroes[heroIndex]
  const current = PHASES[phase]
  const color = HERO_COLORS[hero.color]
  const [checked, setChecked] = useState({})
  const stepKey = `${round}-${heroIndex}-${phase}`

  const toggleStep = (i) =>
    setChecked((c) => ({ ...c, [stepKey]: { ...c[stepKey], [i]: !c[stepKey]?.[i] } }))

  const isLastPhase = phase === PHASES.length - 1
  const nextHero = state.heroes[(heroIndex + 1) % state.heroes.length]

  return (
    <section className={`rounded-3xl border border-zinc-800 p-5 sm:p-6 ${color.bg}`}>
      <p className="text-sm uppercase tracking-widest text-zinc-400">Round {round}</p>
      <h2 className={`font-display text-4xl font-bold sm:text-5xl ${color.text}`}>
        Your turn, {hero.player || hero.name}!
      </h2>
      {hero.player && <p className="text-zinc-400">playing {hero.name}</p>}

      <div className="mt-5 grid grid-cols-3 gap-2">
        {PHASES.map((p, i) => (
          <div
            key={p.key}
            className={`rounded-xl px-2 py-2 text-center text-sm sm:text-base ${
              i === phase ? 'bg-amber-500 font-bold text-zinc-950' : i < phase ? 'bg-zinc-800 text-zinc-500' : 'bg-zinc-900 text-zinc-400'
            }`}
          >
            <span className="mr-1">{p.emoji}</span>
            {p.title.replace(' Phase', '')}
          </div>
        ))}
      </div>

      <ul className="mt-5 space-y-2">
        {current.steps.map((step, i) => {
          const done = checked[stepKey]?.[i]
          return (
            <li key={step}>
              <button
                type="button"
                onClick={() => toggleStep(i)}
                className="flex w-full items-start gap-3 rounded-xl bg-zinc-950/50 p-3 text-left text-lg"
              >
                <span
                  className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${
                    done ? 'border-amber-500 bg-amber-500 text-zinc-950' : 'border-zinc-600'
                  }`}
                >
                  {done && '✓'}
                </span>
                <span className={done ? 'text-zinc-500 line-through' : 'text-zinc-100'}>{step}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* The hero's chosen powers, right where the Hero Phase asks for an attack. Tap a
          daily or utility to flip it over once it's used. */}
      {current.key === 'hero' && hero.powers.length > 0 && (
        <div className="mt-5">
          <h3 className="font-display text-xl font-bold text-zinc-200">{hero.name}'s powers</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[...hero.powers]
              .sort((a, b) => Number(a.used) - Number(b.used))
              .map((power) => (
                <PowerTile
                  key={power.id}
                  power={power}
                  onToggle={() => dispatch({ type: 'TOGGLE_POWER', heroId: hero.id, powerId: power.id })}
                />
              ))}
          </div>
        </div>
      )}

      {current.key === 'exploration' && (
        <DrawMonsterButton state={state} heroId={hero.id} dispatch={dispatch} className="mt-4 w-full" />
      )}

      {current.key === 'villain' && (
        <>
          <div className="mt-3">
            <Button
              disabled={state.xp < XP_TO_CANCEL_ENCOUNTER}
              onClick={() => dispatch({ type: 'CANCEL_ENCOUNTER' })}
            >
              Spend {XP_TO_CANCEL_ENCOUNTER} XP to cancel the encounter
            </Button>
          </div>
          <MonsterTurns key={stepKey} state={state} dispatch={dispatch} hero={hero} />
        </>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => dispatch({ type: 'PREVIOUS_PHASE' })}>
          ← Back
        </Button>
        <Button variant="gold" className="px-6 py-3 text-lg" onClick={() => dispatch({ type: 'NEXT_PHASE' })}>
          {isLastPhase ? `Pass to ${nextHero.player || nextHero.name} →` : `On to ${PHASES[phase + 1].title} →`}
        </Button>
      </div>
    </section>
  )
}
