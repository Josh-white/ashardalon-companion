import { useState } from 'react'
import { HERO_COLORS, XP_TO_CANCEL_ENCOUNTER, XP_TO_LEVEL_UP } from '../data/heroes.js'
import { PHASES } from '../data/phases.js'
import HeroAttack from './HeroAttack.jsx'
import MonsterTurns, { DrawMonsterButton } from './MonsterTurns.jsx'
import { Button } from './ui.jsx'

// Each phase asks only what the app can't see for itself. The checklist each phase
// used to show is still on the projector, as a reminder for the whole table.

function Note({ children, tone = 'plain' }) {
  const tones = {
    plain: 'bg-zinc-950/50 text-zinc-100',
    warn: 'bg-red-950/70 text-red-200',
    good: 'bg-emerald-950/60 text-emerald-200',
  }
  return <div className={`mt-4 rounded-xl p-3 text-lg ${tones[tone]}`}>{children}</div>
}

function YesNo({ question, onYes, onNo }) {
  return (
    <div className="mt-4">
      <p className="text-2xl font-semibold text-zinc-100">{question}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button variant="gold" className="py-4 text-2xl" onClick={onYes}>
          Yes
        </Button>
        <Button className="py-4 text-2xl" onClick={onNo}>
          No
        </Button>
      </div>
    </div>
  )
}

function HeroPhase({ state, hero, dispatch }) {
  return (
    <>
      {hero.hp === 0 && (
        <Note tone="warn">
          <p>{hero.name} is at 0 HP. Spend a healing surge before anything else.</p>
          <Button
            variant={state.surges > 0 ? 'gold' : 'danger'}
            className="mt-2"
            onClick={() => dispatch({ type: 'USE_SURGE', heroId: hero.id })}
          >
            {state.surges > 0 ? `Use a healing surge (heal to ${hero.surgeValue})` : 'No surges left: the party falls'}
          </Button>
        </Note>
      )}
      <Note>Move and attack, attack and move, or move twice.</Note>

      <HeroAttack state={state} hero={hero} dispatch={dispatch} />

      {hero.level === 1 && state.xp >= XP_TO_LEVEL_UP && (
        <Note tone="good">
          <p>Rolled a natural 20 this turn? Spend {XP_TO_LEVEL_UP} XP to reach level 2.</p>
          <Button variant="gold" className="mt-2" onClick={() => dispatch({ type: 'LEVEL_UP', heroId: hero.id })}>
            Level up
          </Button>
        </Note>
      )}
    </>
  )
}

function ExplorationPhase({ state, hero, dispatch }) {
  const { explored, monsterDrawn } = state.turn
  if (explored !== true) {
    return (
      <YesNo
        question={`Is ${hero.name} standing on an unexplored edge?`}
        onYes={() => dispatch({ type: 'SET_EXPLORED', explored: true })}
        onNo={() => dispatch({ type: 'SET_EXPLORED', explored: false })}
      />
    )
  }
  const newest = monsterDrawn && [...state.monsters].reverse().find((m) => m.ownerId === hero.id)
  return (
    <>
      <Note>Draw a dungeon tile and put it on that edge.</Note>
      {monsterDrawn ? (
        <Note tone="good">
          ✓ {newest ? `${/^[AEIOU]/.test(newest.name) ? 'An' : 'A'} ${newest.name} was drawn.` : 'Monster drawn.'} Put its figure on the new tile.
        </Note>
      ) : (
        <DrawMonsterButton state={state} heroId={hero.id} dispatch={dispatch} className="mt-4 w-full" />
      )}
    </>
  )
}

function VillainPhase({ state, hero, dispatch }) {
  const explored = state.turn.explored === true
  // Only a new tile can skip the encounter, and only when it has no black triangle.
  const [triangle, setTriangle] = useState(null)
  const needEncounter = !explored || triangle === true

  return (
    <>
      {explored && triangle === null ? (
        <YesNo
          question="Does the new tile have a black triangle?"
          onYes={() => setTriangle(true)}
          onNo={() => setTriangle(false)}
        />
      ) : needEncounter ? (
        <Note>
          <p>{explored ? 'The new tile has a black triangle,' : 'No new tile this turn,'} so draw an encounter card and do what it says.</p>
          <Button
            className="mt-2"
            disabled={state.xp < XP_TO_CANCEL_ENCOUNTER}
            onClick={() => dispatch({ type: 'CANCEL_ENCOUNTER' })}
          >
            Spend {XP_TO_CANCEL_ENCOUNTER} XP to cancel the encounter
          </Button>
        </Note>
      ) : (
        <Note tone="good">No encounter card this turn.</Note>
      )}
      <MonsterTurns state={state} dispatch={dispatch} hero={hero} />
    </>
  )
}

export default function TurnGuide({ state, dispatch }) {
  const { heroIndex, phase, round } = state.turn
  const hero = state.heroes[heroIndex]
  const current = PHASES[phase]
  const color = HERO_COLORS[hero.color]
  const stepKey = `${round}-${heroIndex}-${phase}`

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

      {current.key === 'hero' && <HeroPhase key={stepKey} state={state} hero={hero} dispatch={dispatch} />}
      {current.key === 'exploration' && <ExplorationPhase state={state} hero={hero} dispatch={dispatch} />}
      {current.key === 'villain' && <VillainPhase key={stepKey} state={state} hero={hero} dispatch={dispatch} />}

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
