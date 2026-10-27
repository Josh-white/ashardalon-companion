import { useState } from 'react'
import { HERO_COLORS } from '../data/heroes.js'
import { useCards } from '../state/useCards.js'
import { randomNumbers, rollD20 } from '../state/random.js'
import { Button } from './ui.jsx'

// Enough random numbers to shuffle the whole monster deck.
const SHUFFLE_NUMBERS = 128

// Draws the top card of the virtual monster deck for a hero. Hidden when the card
// file has no monsters, so the "+ Monster" form is the way to add them instead.
export function DrawMonsterButton({ state, heroId, dispatch, className = '', label = '🐉 Draw a monster' }) {
  const { monsters } = useCards()
  const deck = state.monsterDeck
  if (!deck && monsters.length === 0) return null
  const left = deck ? deck.draw.length : monsters.reduce((sum, card) => sum + card.copies, 0)
  return (
    <Button
      variant="danger"
      className={`px-5 py-3 text-lg font-bold ${className}`}
      onClick={() => dispatch({ type: 'DRAW_MONSTER', heroId, cards: monsters, random: randomNumbers(SHUFFLE_NUMBERS) })}
    >
      {label}
      <span className="ml-2 text-sm font-normal opacity-80">
        {left > 0 ? `${left} in the deck` : 'reshuffles the discards'}
      </span>
    </Button>
  )
}

// What each tactic asks about the board, in plain words.
const QUESTIONS = {
  adjacent: (name) => `Is a hero right next to the ${name}?`,
  sameTile: (name) => `Is a hero on the same tile as the ${name}?`,
  within1: (name) => `Is a hero on the ${name}'s tile, or on a tile touching it?`,
  within2: (name) => `Is a hero within 2 tiles of the ${name}?`,
  aloneByUnexploredEdge: (name) => `Is the ${name} on a tile with no heroes and an unexplored edge?`,
}

const HINTS = {
  adjacent: 'Next to means in a square touching it, even corner to corner.',
  within1: 'That is "within 1 tile".',
}

function targetPrompt(step) {
  if (step.targets === 'all') {
    return step.when === 'sameTile' ? 'Tap every hero on its tile.' : 'Tap every hero within 1 tile of it.'
  }
  if (step.when === 'adjacent') return 'Which hero is next to it? If there are more, pick one together.'
  return 'Which hero is closest? If it’s a tie, pick one together.'
}

function HeroPicker({ heroes, chosen, onToggle }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {heroes.map((hero) => {
        const on = chosen.includes(hero.id)
        return (
          <button
            key={hero.id}
            type="button"
            onClick={() => onToggle(hero.id)}
            className={`rounded-xl border-2 px-3 py-3 text-left text-lg font-bold transition active:scale-95 ${
              on ? `border-amber-400 ${HERO_COLORS[hero.color].bg}` : 'border-zinc-700 bg-zinc-900'
            } ${HERO_COLORS[hero.color].text}`}
          >
            {hero.name}
            <span className="block text-sm font-normal text-zinc-400">AC {hero.ac} · {hero.hp} HP</span>
          </button>
        )
      })}
    </div>
  )
}

// Walks one monster through its card's tactics: asks about the board one question at a
// time, then rolls its attack against the hero's AC and applies the result.
function MonsterActivation({ monster, state, dispatch, activeHeroId, onDone }) {
  const { card, name } = monster
  const figures = Math.max(1, Math.ceil(monster.hp / card.hp))
  const [figure, setFigure] = useState(1)
  const [stepIndex, setStepIndex] = useState(0)
  const [answered, setAnswered] = useState(false) // "Yes" to this step's question
  const [chosen, setChosen] = useState([])
  const [results, setResults] = useState(null)
  const step = card.tactics[stepIndex]
  const attack = card.attacks.find((a) => a.id === step?.attack)
  const asking = step?.when && !answered

  const nextFigure = () => {
    setFigure((f) => f + 1)
    setStepIndex(0)
    setAnswered(false)
    setChosen([])
    setResults(null)
  }
  const finish = figure < figures ? nextFigure : onDone

  const toggle = (heroId) =>
    setChosen((list) =>
      step.targets === 'all' ? (list.includes(heroId) ? list.filter((id) => id !== heroId) : [...list, heroId]) : [heroId],
    )

  const roll = () => {
    const targets = chosen.map((heroId) => ({ heroId, roll: rollD20() }))
    dispatch({ type: 'MONSTER_ATTACK', monsterId: monster.id, attackId: attack.id, targets })
    // The server does the same sums; these are shown here so the player can read them.
    setResults(
      targets.map(({ heroId, roll: value }) => {
        const hero = state.heroes.find((h) => h.id === heroId)
        const total = value + attack.bonus
        return { hero, value, total, hit: total >= hero.ac }
      }),
    )
  }

  const movedTo = state.heroes.find((h) => h.id === chosen[0])
  const effect = (hit) => {
    const damage = hit ? attack.damage : attack.miss
    const parts = [damage > 0 && `${damage} damage`, ...(hit ? attack.conditions : [])].filter(Boolean)
    return parts.length > 0 ? parts.join(' and ') : 'no damage'
  }

  return (
    <div className="space-y-4 rounded-2xl border-2 border-red-700 bg-zinc-950/80 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="font-display text-2xl font-bold text-red-300">
          {name}
          {figures > 1 && <span className="ml-2 text-base text-zinc-400">figure {figure} of {figures}</span>}
        </h4>
        <span className="text-sm text-zinc-500">AC {monster.ac}</span>
      </div>
      {card.special && figure === 1 && stepIndex === 0 && !answered && (
        <p className="rounded-lg bg-zinc-900 p-2 text-sm text-zinc-400">{card.special}</p>
      )}

      {asking && (
        <>
          <p className="text-2xl font-semibold text-zinc-100">{QUESTIONS[step.when](name)}</p>
          {HINTS[step.when] && <p className="text-zinc-400">{HINTS[step.when]}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Button variant="gold" className="py-4 text-2xl" onClick={() => setAnswered(true)}>
              Yes
            </Button>
            <Button className="py-4 text-2xl" onClick={() => setStepIndex((i) => i + 1)}>
              No
            </Button>
          </div>
        </>
      )}

      {!asking && step?.explore && (
        <>
          <p className="text-xl text-zinc-100">
            Draw a dungeon tile from the <b>bottom</b> of the stack and put it next to the {name}'s tile.
          </p>
          <DrawMonsterButton
            state={state}
            heroId={activeHeroId}
            dispatch={dispatch}
            className="w-full"
            label="🐉 Draw a monster for that tile"
          />
          <Button variant="gold" className="w-full py-3 text-lg" onClick={finish}>
            Done with the {name}
          </Button>
        </>
      )}

      {!asking && attack && !results && (
        <>
          <p className="text-xl text-zinc-100">
            It attacks with its <b>{attack.name}</b>. {targetPrompt(step)}
          </p>
          <HeroPicker heroes={state.heroes} chosen={chosen} onToggle={toggle} />
          {step.move === 'adjacent' && movedTo && (
            <p className="rounded-lg bg-amber-950/60 p-3 text-lg text-amber-200">
              First, move the {name} next to {movedTo.name}.
            </p>
          )}
          <Button variant="danger" className="w-full py-4 text-xl font-bold" disabled={chosen.length === 0} onClick={roll}>
            🎲 Roll the {attack.name} attack (+{attack.bonus})
          </Button>
        </>
      )}

      {results && (
        <>
          <ul className="space-y-2">
            {results.map(({ hero, value, total, hit }) => (
              <li key={hero.id} className={`rounded-xl p-3 text-lg ${hit ? 'bg-red-950' : 'bg-zinc-900'}`}>
                <span className={`font-bold ${HERO_COLORS[hero.color].text}`}>{hero.name}</span>: rolled {value} + {attack.bonus} ={' '}
                {total} vs AC {hero.ac}.{' '}
                <b className={hit ? 'text-red-300' : 'text-emerald-300'}>{hit ? 'Hit!' : 'Miss!'}</b> {hero.name} takes {effect(hit)}.
              </li>
            ))}
          </ul>
          <Button variant="gold" className="w-full py-3 text-lg" onClick={finish}>
            {figure < figures ? `Next ${name} →` : `Done with the ${name}`}
          </Button>
        </>
      )}

      {!asking && !step?.explore && !attack && (
        <>
          <p className="text-xl text-zinc-100">
            {step?.move === 'toward' || !step
              ? `Move the ${name} 1 tile toward the closest hero.`
              : 'Do what the card says.'}
          </p>
          <Button variant="gold" className="w-full py-3 text-lg" onClick={finish}>
            {figure < figures ? `Next ${name} →` : `Done with the ${name}`}
          </Button>
        </>
      )}

      {step?.text && (
        <details className="text-sm text-zinc-500">
          <summary>What the card says</summary>
          <p className="mt-1">{step.text}</p>
        </details>
      )}
    </div>
  )
}

// The Villain Phase's monster activations for the active hero: each of their monster
// cards takes a turn, one at a time.
export default function MonsterTurns({ state, dispatch, hero }) {
  const [done, setDone] = useState({})
  const [activeId, setActiveId] = useState(null)
  const turnKey = `${state.turn.round}-${state.turn.heroIndex}`
  const monsters = state.monsters.filter((m) => m.ownerId === hero.id)
  const isDone = (monster) => done[turnKey]?.includes(monster.id)
  const markDone = (monster) => {
    setDone((d) => ({ ...d, [turnKey]: [...(d[turnKey] ?? []), monster.id] }))
    setActiveId(null)
  }
  const active = monsters.find((m) => m.id === activeId)

  if (monsters.length === 0) {
    return <p className="mt-4 rounded-xl bg-zinc-950/50 p-3 text-zinc-400">You have no monster cards, so no monster turns.</p>
  }

  return (
    <div className="mt-5">
      <h3 className="font-display text-xl font-bold text-zinc-200">Monster turns</h3>
      {active?.card ? (
        <div className="mt-2">
          <MonsterActivation
            key={active.id}
            monster={active}
            state={state}
            dispatch={dispatch}
            activeHeroId={hero.id}
            onDone={() => markDone(active)}
          />
        </div>
      ) : (
        <ul className="mt-2 space-y-2">
          {monsters.map((monster) => (
            <li key={monster.id} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-950/50 p-3">
              <span className={`text-lg font-semibold ${isDone(monster) ? 'text-zinc-500 line-through' : 'text-red-300'}`}>
                {monster.name}
              </span>
              {isDone(monster) ? (
                <span className="text-zinc-500">✓ Done</span>
              ) : monster.card ? (
                <Button variant="danger" className="font-bold" onClick={() => setActiveId(monster.id)}>
                  Take its turn
                </Button>
              ) : (
                // Added by hand, so the app doesn't know its tactics.
                <Button onClick={() => markDone(monster)}>Done (use its card)</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
