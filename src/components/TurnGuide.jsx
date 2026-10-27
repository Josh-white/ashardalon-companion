import { HERO_COLORS, XP_TO_LEVEL_UP } from '../data/heroes.js'
import { PHASES } from '../data/phases.js'
import { CurseNotes, DisableTraps, EncounterStep, EnvironmentBanner, PassMonsters, TrapTurns } from './Encounters.jsx'
import HeroAttack from './HeroAttack.jsx'
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

      <CurseNotes hero={hero} dispatch={dispatch} />

      <HeroAttack state={state} hero={hero} dispatch={dispatch} />
      <DisableTraps state={state} hero={hero} dispatch={dispatch} />

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
        onNo={() => dispatch({ type: 'SET_EXPLORED', explored: false, rolls: [rollD20(), rollD20()] })}
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
  const { explored, triangle } = state.turn
  const highAlert = state.environment?.cardId === 'high-alert'
  const surrounded = state.environment?.cardId === 'surrounded' && !state.monsters.some((m) => m.ownerId === hero.id)

  return (
    <>
      {surrounded && (
        <Note tone="warn">
          <p>Surrounded! {hero.name} has no monster, so draw one and put it on the closest unexplored edge.</p>
          <DrawMonsterButton state={state} heroId={hero.id} dispatch={dispatch} className="mt-2 w-full" />
        </Note>
      )}
      {explored === true && triangle === undefined ? (
        <YesNo
          question="Does the new tile have a black triangle?"
          onYes={() => dispatch({ type: 'SET_TRIANGLE', triangle: true })}
          onNo={() => dispatch({ type: 'SET_TRIANGLE', triangle: false })}
        />
      ) : (
        <>
          {explored === true && triangle === false && !state.encounter && (state.turn.encountersDrawn ?? 0) === 0 && (
            <Note tone="good">No black triangle, so no encounter card this turn.</Note>
          )}
          <EncounterStep state={state} hero={hero} dispatch={dispatch} />
        </>
      )}
      {!state.encounter && (
        <>
          <MonsterTurns state={state} dispatch={dispatch} hero={hero} />
          <TrapTurns state={state} hero={hero} dispatch={dispatch} />
          {highAlert && state.monsters.some((m) => m.ownerId === hero.id) && (
            <Note>
              <p className="mb-2">High Alert: pass one of your monster cards to the player on your right.</p>
              <PassMonsters state={state} dispatch={dispatch} only={hero.id} />
            </Note>
          )}
        </>
      )}
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

      <EnvironmentBanner environment={state.environment} className="mt-4" />

      {current.key === 'hero' && <HeroPhase key={stepKey} state={state} hero={hero} dispatch={dispatch} />}
      {current.key === 'exploration' && <ExplorationPhase state={state} hero={hero} dispatch={dispatch} />}
      {current.key === 'villain' && <VillainPhase key={stepKey} state={state} hero={hero} dispatch={dispatch} />}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => dispatch({ type: 'PREVIOUS_PHASE' })}>
          ← Back
        </Button>
        {/* The dice are for shaking off poison after the Hero Phase and for curses that end on a roll. */}
        <Button
          variant="gold"
          className="px-6 py-3 text-lg"
          disabled={Boolean(state.encounter)}
          onClick={() => dispatch({ type: 'NEXT_PHASE', roll: rollD20(), rolls: [rollD20(), rollD20(), rollD20()] })}
        >
          {isLastPhase ? `Pass to ${nextHero.player || nextHero.name} →` : `On to ${PHASES[phase + 1].title} →`}
        </Button>
      </div>
    </section>
  )
}
