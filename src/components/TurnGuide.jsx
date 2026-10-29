import { HERO_COLORS, XP_TO_LEVEL_UP } from '../data/heroes.js'
import { PHASES } from '../data/phases.js'
import { CurseNotes, PhaseChecks, DisableTraps, EncounterStep, EnvironmentBanner, PassMonsters, encountersLeft, TrapTurns } from './Encounters.jsx'
import HeroAttack, { AttackAftermath } from './HeroAttack.jsx'
import { Doors, EscapeNote, RevealButtons } from './Adventure.jsx'
import MonsterTurns, { DrawMonsterButton, VillainTurns } from './MonsterTurns.jsx'
import { rollD20 } from '../state/random.js'
import { checksFor, phaseChecks, phaseTodo, poisonBonus, villagerRollDue } from '../state/game.js'
import { VillagerTurn } from './Villagers.jsx'
import { useCards } from '../state/useCards.js'
import { treasurePending } from './Treasure.jsx'
import { DrawnTile, HallwayDraws, useTileDraw } from './Tiles.jsx'
import { Button } from './ui.jsx'
import { heroEdges } from '../board/play.js'

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
  const caged = (hero.curses ?? []).some((c) => c.cardId === 'cage')
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
      {caged ? (
        <Note tone="warn">{hero.name} is in a cage and can't move. Attack, or try to open the cage instead.</Note>
      ) : hero.conditions.includes('Dazed') ? (
        <Note tone="warn">{hero.name} is Dazed: move <b>or</b> attack this turn, not both. Dazed wears off after this phase.</Note>
      ) : (
        <Note>Move and attack, attack and move, or move twice.</Note>
      )}
      {hero.conditions.includes('Poisoned') && (
        <Note tone="warn">{hero.name} is Poisoned. When you end the Hero Phase, the app rolls: 10 or more shakes it off{poisonBonus(hero) ? ` (+${poisonBonus(hero)} from Cast-Iron Stomach)` : ''}.</Note>
      )}
      {state.environment?.cardId === 'dragon-s-tribute' && (
        <Note>
          💰 Dragon's Tribute: picking up a Treasure token? Draw two and keep the lower value. If one is an item, discard
          the item. (Treasure cards for defeating monsters are drawn as usual.)
        </Note>
      )}

      <CurseNotes state={state} hero={hero} dispatch={dispatch} />

      {state.turn.attackSpent?.heroId === hero.id ? (
        <Note>{hero.name} used this turn's attack on {state.turn.attackSpent.on}.</Note>
      ) : (
        <HeroAttack state={state} hero={hero} dispatch={dispatch} />
      )}
      <DisableTraps state={state} hero={hero} dispatch={dispatch} />
      <Doors state={state} hero={hero} dispatch={dispatch} />
      <EscapeNote state={state} hero={hero} dispatch={dispatch} />
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
      <PhaseChecks state={state} hero={hero} phaseKey="hero" dispatch={dispatch} />
      <VillagerTurn state={state} hero={hero} dispatch={dispatch} />
    </>
  )
}

const SIDE_NAMES = { N: 'north', E: 'east', S: 'south', W: 'west' }

// The tiles this turn's exploring laid on the virtual board.
function BoardDraws({ state }) {
  const tiles = state.turn.tiles ?? {}
  const drawn = [tiles.explore]
  for (let n = 1; tiles[`hallway-${n}`] !== undefined; n++) drawn.push(tiles[`hallway-${n}`])
  const laid = state.turn.boardTiles ?? []
  if (drawn[0] === 'none') return <p className="text-amber-300">The dungeon tile stack is empty, so there's no tile to place.</p>
  return (
    <>
      {drawn.map((tile, i) => (
        <p key={i} className={tile ? 'text-xl font-bold text-amber-300' : 'text-emerald-300'}>
          {tile ? `✨ It's the ${tile}!` : i > 0 ? '✓ A long hallway! Another tile went on at its far end.' : '✓ A new tile is on the board.'}
        </p>
      ))}
      {laid.length < drawn.filter((t) => t !== 'none').length && (
        <p className="mt-1 text-amber-300">A tile couldn't go on the board there. Move its monster by hand.</p>
      )}
    </>
  )
}

function ExplorationPhase({ state, hero, dispatch }) {
  const { explored, monsterDrawn, noTiles } = state.turn
  const tileDraw = useTileDraw()
  const checks = <PhaseChecks state={state} hero={hero} phaseKey="exploration" dispatch={dispatch} />
  // On the virtual board the board knows which edges the hero stands on.
  const edges = state.board ? heroEdges(state) : null
  if (explored === false) {
    // No new tile, but a card still has something to do before the phase ends.
    return (
      <>
        <Note>
          <p>{noTiles ? 'The dungeon tile stack is empty, so no new tile this turn.' : `${hero.name} isn't on an unexplored edge, so no new tile this turn.`}</p>
          {!noTiles && (!edges || edges.length > 0) && (
            <Button variant="ghost" className="mt-2" onClick={() => dispatch({ type: 'SET_EXPLORED', explored: true, ...tileDraw })}>
              Oops, {hero.name} is on an edge
            </Button>
          )}
        </Note>
        {checks}
      </>
    )
  }
  if (explored !== true && edges) {
    const noTile = () => dispatch({ type: 'SET_EXPLORED', explored: false, rolls: [rollD20(), rollD20()] })
    if (edges.length === 0) {
      return (
        <Note>
          <p>{hero.name} isn't on an unexplored edge, so no new tile this turn.</p>
          <Button className="mt-2 w-full" onClick={noTile}>
            On to the Villain Phase
          </Button>
        </Note>
      )
    }
    return (
      <Note>
        <p>{hero.name} is on an unexplored edge. Draw a tile to see what's there!</p>
        {edges.map((edge) => (
          <Button key={edge.id} variant="gold" className="mt-2 w-full" onClick={() => dispatch({ type: 'SET_EXPLORED', explored: true, edge: edge.id, ...tileDraw })}>
            🗺️ Explore{edges.length > 1 ? ` ${SIDE_NAMES[edge.side]}` : ''}: draw a tile
          </Button>
        ))}
      </Note>
    )
  }
  if (explored !== true) {
    return (
      <YesNo
        question={`Is ${hero.name} standing on an unexplored edge?`}
        onYes={() => dispatch({ type: 'SET_EXPLORED', explored: true, ...tileDraw })}
        onNo={() => dispatch({ type: 'SET_EXPLORED', explored: false, rolls: [rollD20(), rollD20()] })}
      />
    )
  }
  const newest = monsterDrawn && [...state.monsters].reverse().find((m) => m.ownerId === hero.id)
  return (
    <>
      {state.board ? (
        <Note>
          <BoardDraws state={state} />
        </Note>
      ) : state.tileStack ? (
        <Note>
          <DrawnTile tile={state.turn.tiles?.explore} />
          <HallwayDraws state={state} dispatch={dispatch} />
        </Note>
      ) : (
        <Note>Draw a dungeon tile and put it on that edge.</Note>
      )}
      <RevealButtons state={state} dispatch={dispatch} />
      {monsterDrawn ? (
        <Note tone="good">
          ✓ {newest ? `${/^[AEIOU]/.test(newest.name) ? 'An' : 'A'} ${newest.name} was drawn.` : 'Monster drawn.'}{' '}
          {state.board ? "It's on the new tile's scorch mark." : 'Put its figure on the new tile.'}
        </Note>
      ) : (
        <DrawMonsterButton state={state} heroId={hero.id} dispatch={dispatch} className="mt-4 w-full" />
      )}
      {checks}
    </>
  )
}

function VillainPhase({ state, hero, dispatch }) {
  const { explored, triangle } = state.turn
  const highAlert = state.environment?.cardId === 'high-alert'
  const surrounded = state.environment?.cardId === 'surrounded' && !state.monsters.some((m) => m.ownerId === hero.id)

  return (
    <>
      <VillainTurns state={state} dispatch={dispatch} hero={hero} />
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
          {explored === true && triangle === false && !state.encounter && (state.turn.encountersDrawn ?? 0) === 0 && encountersLeft(state, hero) === 0 && (
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

  const { treasures, encounters, monsters } = useCards()
  const isLastPhase = phase === PHASES.length - 1
  // What this phase still needs (questions, the monster draw, every monster's turn, the
  // encounter card), so a quick tap doesn't skip something. Decks the table plays from
  // the real cards aren't checked.
  const todo = phaseTodo(state, { monsters: Boolean(state.monsterDeck) || monsters.length > 0, encounters: Boolean(state.encounterDeck) || encounters.length > 0 })
  if (isLastPhase && treasurePending(state, treasures)) todo.push('the treasure card')
  if (villagerRollDue(state)) todo.push('the villager roll')
  // These can't be skipped at all: an open encounter card, a card's own questions, the villager roll.
  const blocked =
    Boolean(state.encounter) || Boolean(state.turn.startDamageDue) || phaseChecks(state, checksFor(current.key)).length > 0 || villagerRollDue(state)
  const waiting = blocked || todo.length > 0
  const next = () => dispatch({ type: 'NEXT_PHASE', roll: rollD20(), rolls: [rollD20(), rollD20(), rollD20()] })
  const skip = () => {
    if (window.confirm(`Still to do: ${todo.join(', ')}. Move on anyway?`)) next()
  }
  const nextHero = state.heroes[(heroIndex + 1) % state.heroes.length]

  return (
    <section className={`rounded-3xl border border-zinc-800 p-5 sm:p-6 ${color.bg}`}>
      <p className="text-sm uppercase tracking-widest text-zinc-400">Round {round}</p>
      <h2 className={`font-display text-4xl font-bold sm:text-5xl ${color.text}`}>
        {state.board ? `${hero.name}'s turn!` : `Your turn, ${hero.player || hero.name}!`}
      </h2>
      {hero.player && !state.board && <p className="text-zinc-400">playing {hero.name}</p>}

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

      {waiting && todo.length > 0 && (
        <p className="mt-4 text-right text-amber-300">
          Still to do: {todo.join(', ')}.
          {!blocked && (
            <button type="button" className="ml-2 text-sm text-zinc-500 underline" onClick={skip}>
              Skip
            </button>
          )}
        </p>
      )}
      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => dispatch({ type: 'PREVIOUS_PHASE' })}>
          ← Back
        </Button>
        {/* The dice are for shaking off poison after the Hero Phase and for curses that end on a roll. */}
        <Button
          variant="gold"
          className="px-6 py-3 text-lg"
          disabled={waiting}
          onClick={next}
        >
          {isLastPhase ? (state.board ? `On to ${nextHero.name}'s turn →` : `Pass to ${nextHero.player || nextHero.name} →`) : `On to ${PHASES[phase + 1].title} →`}
        </Button>
      </div>
    </section>
  )
}
