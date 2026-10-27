import { useState } from 'react'
import { HERO_COLORS, XP_TO_CANCEL_ENCOUNTER, XP_TO_LEVEL_UP } from '../data/heroes.js'
import { PHASES } from '../data/phases.js'
import { reactionsFor } from '../data/powerEffects.js'
import HeroAttack, { AttackAftermath } from './HeroAttack.jsx'
import MonsterTurns, { DrawMonsterButton } from './MonsterTurns.jsx'
import { rollD20 } from '../state/random.js'
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

// Free at-will attacks from Cause Fear or Acrobatic Onslaught, and how the last one went.
// `onlyHeroId` shows just one hero's, on that hero's own iPad.
export function ExtraAttacks({ state, dispatch, onlyHeroId = null }) {
  const extras = (state.turn.bonusAttacks ?? []).filter((b) => !onlyHeroId || b.heroId === onlyHeroId)
  const last = state.turn.lastAttack
  const showLast = last?.bonus && (!onlyHeroId || last.heroId === onlyHeroId)
  return (
    <>
      {showLast && (
        <div className="mt-5 rounded-2xl border-2 border-amber-600/60 bg-zinc-950/60 p-4">
          <AttackAftermath state={state} last={last} dispatch={dispatch} />
        </div>
      )}
      {extras.map((extra, i) => {
        const hero = state.heroes.find((h) => h.id === extra.heroId)
        return hero ? <HeroAttack key={`${extra.heroId}-${extra.source}-${i}`} state={state} hero={hero} dispatch={dispatch} extra={extra} /> : null
      })}
    </>
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
      {hero.conditions.includes('Dazed') ? (
        <Note tone="warn">{hero.name} is Dazed: move <b>or</b> attack this turn, not both. Dazed wears off after this phase.</Note>
      ) : (
        <Note>Move and attack, attack and move, or move twice.</Note>
      )}
      {hero.conditions.includes('Poisoned') && (
        <Note tone="warn">{hero.name} is Poisoned. When you end the Hero Phase, the app rolls: 10 or more shakes it off.</Note>
      )}

      <HeroAttack state={state} hero={hero} dispatch={dispatch} />
      <ExtraAttacks state={state} dispatch={dispatch} />

      {hero.level === 1 && state.turn.natural20 === hero.id && (
        <Note tone="good">
          <p>
            Natural 20!{' '}
            {state.xp >= XP_TO_LEVEL_UP
              ? `Spend ${XP_TO_LEVEL_UP} XP to reach level 2.`
              : `Leveling up takes ${XP_TO_LEVEL_UP} XP, and the party has ${state.xp}.`}
          </p>
          <Button
            variant="gold"
            className="mt-2"
            disabled={state.xp < XP_TO_LEVEL_UP}
            onClick={() => dispatch({ type: 'LEVEL_UP', heroId: hero.id })}
          >
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

// Perseverance: cancelling costs 1 XP less for each hero on the cleric's tile.
function Perseverance({ state, dispatch }) {
  const [offer] = reactionsFor(state.heroes, 'perseverance')
  if (!offer) return null
  const { hero, power } = offer
  return (
    <div className="mt-3">
      <p className="text-base text-zinc-300">
        {hero.name}'s Perseverance makes it cheaper. How many heroes are on {hero.name}'s tile, counting {hero.name}?
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {state.heroes.map((_, i) => {
          const cost = Math.max(0, XP_TO_CANCEL_ENCOUNTER - (i + 1))
          return (
            <Button
              key={i}
              disabled={state.xp < cost}
              onClick={() => dispatch({ type: 'CANCEL_ENCOUNTER', perseverance: { heroId: hero.id, powerId: power.id, heroesOnTile: i + 1 } })}
            >
              {i + 1} → {cost} XP
            </Button>
          )
        })}
      </div>
    </div>
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
          <Perseverance state={state} dispatch={dispatch} />
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
        {/* The die is for a poisoned hero's roll to shake off the poison after the Hero Phase. */}
        <Button variant="gold" className="px-6 py-3 text-lg" onClick={() => dispatch({ type: 'NEXT_PHASE', roll: rollD20() })}>
          {isLastPhase ? `Pass to ${nextHero.player || nextHero.name} →` : `On to ${PHASES[phase + 1].title} →`}
        </Button>
      </div>
    </section>
  )
}
