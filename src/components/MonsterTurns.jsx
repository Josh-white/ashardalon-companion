import { useState } from 'react'
import { HERO_COLORS } from '../data/heroes.js'
import { itemsWithUse } from '../data/items.js'
import { heroAc, reactionsFor } from '../data/powerEffects.js'
import { activeVillains } from '../state/game.js'
import { aliveVillagers } from '../state/adventure.js'
import { useCards } from '../state/useCards.js'
import { randomNumbers, rollD20 } from '../state/random.js'
import { MonsterControl, TileGuardQuestion } from './Treasure.jsx'
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
  adjacentMany: (name) => `Are two or more heroes right next to the ${name}?`,
  sameTile: (name) => `Is a hero on the same tile as the ${name}?`,
  tileWithMany: (name) => `Is there a tile with 2 or more heroes on it, on the ${name}'s tile or a tile touching it?`,
  within1: (name) => `Is a hero on the ${name}'s tile, or on a tile touching it?`,
  within2: (name) => `Is a hero within 2 tiles of the ${name}?`,
  within3: (name) => `Is a hero within 3 tiles of the ${name}?`,
  aloneByUnexploredEdge: (name) => `Is the ${name} on a tile with no heroes and an unexplored edge?`,
}

const HINTS = {
  adjacent: 'Next to means in a square touching it, even corner to corner.',
  within1: 'That is "within 1 tile".',
}

const RANGES = { adjacent: 'next to it', adjacentMany: 'next to it', within1: 'within 1 tile of it', within2: 'within 2 tiles of it', within3: 'within 3 tiles of it' }

function targetPrompt(step) {
  if (step.targets === 'all') {
    if (step.when === 'sameTile') return 'Tap every hero on its tile.'
    if (step.when === 'tileWithMany') return 'Tap every hero on that tile.'
    if (step.when === 'adjacentMany' || step.target === 'adjacent') return 'Tap every hero next to it.'
    return 'Tap every hero within 1 tile of it.'
  }
  if (step.target === 'mostHp') return `Tap every hero ${RANGES[step.when] ?? 'it can reach'}. The app picks the one with the most HP.`
  if (step.target === 'farthest') return `Which hero ${RANGES[step.when] ?? 'in range'} is farthest from it? If it’s a tie, pick one together.`
  if (step.when === 'adjacent') return 'Which hero is next to it? If there are more, pick one together.'
  return 'Which hero is closest? If it’s a tie, pick one together.'
}

// Where a villain goes after its attack.
const THEN = {
  within1: (name) => `Now move the ${name} to any square within 1 tile.`,
  adjacent: (name, hero) => `Now move the ${name} next to ${hero}.`,
  away: (name) => `Now move the ${name} to the closest square that isn't next to a hero.`,
}

// The hero with the most HP, or null when two or more are tied for it.
function mostHp(heroes) {
  const top = Math.max(...heroes.map((h) => h.hp))
  const tied = heroes.filter((h) => h.hp === top)
  return tied.length === 1 ? tied[0] : null
}

export function HeroPicker({ heroes, chosen, onToggle }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {heroes.map((hero) => {
        const on = chosen.includes(hero.id)
        if (hero.villager) {
          return (
            <button
              key={hero.id}
              type="button"
              onClick={() => onToggle(hero.id)}
              className={`rounded-xl border-2 px-3 py-3 text-left text-lg font-bold text-emerald-200 transition active:scale-95 ${on ? 'border-amber-400 bg-emerald-950' : 'border-emerald-800 bg-zinc-900'}`}
            >
              🧑‍🌾 {hero.name}
              <span className="block text-sm font-normal text-zinc-400">Villager · AC {hero.ac} · {hero.hp} HP</span>
            </button>
          )
        }
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
            <span className="block text-sm font-normal text-zinc-400">AC {heroAc(hero)} · {hero.hp} HP</span>
            {hero.tokens?.invisible && <span className="block text-sm font-normal text-sky-300">👻 Invisible: never the closest</span>}
            {hero.tokens?.refuge && <span className="block text-sm font-normal text-sky-300">✨ In the Astral Refuge</span>}
          </button>
        )
      })}
    </div>
  )
}

// Walks one monster through its card's tactics: asks about the board one question at a
// time, then rolls its attack against the hero's AC and applies the result.
export function MonsterActivation({ monster, state, dispatch, activeHeroId, onDone }) {
  const { card, name } = monster
  const figures = monster.villain ? 1 : Math.max(1, Math.ceil(monster.hp / card.hp))
  const [figure, setFigure] = useState(1)
  const [stepIndex, setStepIndex] = useState(0)
  const [answered, setAnswered] = useState(false) // "Yes" to this step's question
  const [chosen, setChosen] = useState([])
  const [guarded, setGuarded] = useState([])
  const [results, setResults] = useState(null)
  const [tiePick, setTiePick] = useState(null) // the players' pick when heroes tie for the most HP
  const [controlling, setControlling] = useState(false)
  const step = card.tactics[stepIndex]
  // Scroll of Monster Control, read on the active hero's own turn.
  const activeHero = state.heroes.find((h) => h.id === activeHeroId)
  const [scroll] = itemsWithUse(activeHero ? [activeHero] : [], 'monsterControl')
  // A table of attacks (the Gauth's eye ray) rolls to pick one; `table` is its rows.
  const table = card.attacks.filter((a) => a.group && a.group === step?.attack)
  const attack = card.attacks.find((a) => a.id === step?.attack) ?? (table.length > 0 ? { ...table[0], id: step.attack, name: step.attack.replace(/-/g, ' ') } : null)
  const asking = step?.when && !answered

  const nextFigure = () => {
    setFigure((f) => f + 1)
    setStepIndex(0)
    setAnswered(false)
    setChosen([])
    setGuarded([])
    setResults(null)
  }
  const finish = figure < figures ? nextFigure : onDone

  // Villagers count as heroes for monster tactics (Free the Captives), listed first because
  // a monster goes for a villager when it can.
  const villagers = aliveVillagers(state).map((v) => ({ ...v, villager: true }))
  const targetable = [...villagers, ...state.heroes]
  const many = step?.targets === 'all' || step?.target === 'mostHp'
  const toggle = (heroId) =>
    setChosen((list) => (many ? (list.includes(heroId) ? list.filter((id) => id !== heroId) : [...list, heroId]) : [heroId]))
  // "The hero with the most HP": the app picks from the heroes tapped, unless there's a tie.
  const tapped = targetable.filter((h) => chosen.includes(h.id))
  const strongest = step?.target === 'mostHp' && tapped.length > 0 ? mostHp(tapped) : null
  const top = Math.max(...tapped.map((h) => h.hp))
  const tied = step?.target === 'mostHp' && !strongest ? tapped.filter((h) => h.hp === top) : []
  const tieTarget = tied.find((h) => h.id === tiePick)
  const targetIds = step?.target === 'mostHp' ? (strongest ? [strongest.id] : tieTarget ? [tieTarget.id] : []) : chosen

  const roll = (nobleShield) => {
    const targets = targetIds.map((heroId) => ({ heroId, roll: rollD20() }))
    const tableRoll = table.length > 0 ? rollD20() : undefined
    dispatch({ type: 'MONSTER_ATTACK', monsterId: monster.id, attackId: attack.id, tableRoll, targets, nobleShield, tileGuarded: guarded })
    setResults(true)
  }
  // Noble Shield: an attack on several heroes, one of them a paladin with the power unused.
  const shield = targetIds.length > 1 && reactionsFor(state.heroes.filter((h) => targetIds.includes(h.id)), 'noble-shield')[0]
  // The server's sums, so Mirror Image and Cleric's Shield are counted, and Tumbling Escape can change them.
  const last = state.turn.lastMonsterAttack
  const rows = results && last?.monsterId === monster.id ? last.results : []

  const movedTo = targetable.find((h) => h.id === targetIds[0])
  // The attack that was rolled: for a table, the row the die picked.
  const used = (rows.length > 0 && card.attacks.find((a) => a.id === last.attackId)) || attack
  const effect = (hit) => {
    const damage = hit ? used.damage : used.miss
    const parts = [damage > 0 && `${damage} damage`, ...(hit ? used.conditions : [])].filter(Boolean)
    return parts.length > 0 ? parts.join(' and ') : 'no damage'
  }
  // The hero it moves toward when nobody is in reach.
  const living = state.heroes.filter((h) => h.hp > 0)
  const towardHero = step?.toward === 'mostHp' && living.length > 0 ? mostHp(living) : null
  const tiles = step?.tiles > 1 ? `${step.tiles} tiles` : '1 tile'

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

      {scroll && !results && stepIndex === 0 && !answered &&
        (controlling ? (
          <MonsterControl state={state} hero={scroll.hero} monster={monster} item={scroll.item} dispatch={dispatch} onDone={onDone} />
        ) : (
          <Button className="w-full" onClick={() => setControlling(true)}>
            📜 Use the {scroll.item.name} on the {name}
          </Button>
        ))}

      {!controlling && asking && (
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

      {!controlling && !asking && step?.explore && (
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

      {!controlling && !asking && attack && !results && (
        <>
          <p className="text-xl text-zinc-100">
            It attacks with its <b>{attack.name}</b>. {targetPrompt(step)}
          </p>
          {step.move === 'adjacent' && step.targets === 'all' && (
            <p className="rounded-lg bg-amber-950/60 p-3 text-lg text-amber-200">First, move the {name} next to the closest hero.</p>
          )}
          {villagers.length > 0 && <p className="text-emerald-200">Villagers count as heroes here, and the {name} picks a villager over a hero when it can.</p>}
          <HeroPicker heroes={targetable} chosen={chosen} onToggle={toggle} />
          {step.target === 'mostHp' && tapped.length > 1 && strongest && (
            <p className="rounded-lg bg-zinc-900 p-3 text-lg text-zinc-200">{`${strongest.name} has the most HP, so it attacks ${strongest.name}.`}</p>
          )}
          {tied.length > 1 && (
            <div className="space-y-2 rounded-lg bg-zinc-900 p-3">
              <p className="text-lg text-zinc-200">They're tied with {top} HP. Pick together: which one does it attack?</p>
              <div className="flex flex-wrap gap-2">
                {tied.map((h) => (
                  <Button key={h.id} variant={tiePick === h.id ? 'gold' : 'default'} onClick={() => setTiePick(h.id)}>
                    {h.name}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <TileGuardQuestion
            state={state}
            targets={targetIds}
            guarded={guarded}
            onToggle={(id) => setGuarded((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))}
          />
          {step.move === 'adjacent' && step.targets !== 'all' && movedTo && (
            <p className="rounded-lg bg-amber-950/60 p-3 text-lg text-amber-200">
              First, move the {name} next to {movedTo.name}.
            </p>
          )}
          <Button variant="danger" className="w-full py-4 text-xl font-bold" disabled={targetIds.length === 0} onClick={() => roll()}>
            {table.length > 0 ? `🎲 Roll for the ${attack.name}` : `🎲 Roll the ${attack.name} attack (+${attack.bonus})`}
          </Button>
          {table.length > 0 && (
            <p className="text-sm text-zinc-400">The first die picks the ray: {table.map((a) => `${a.roll[0]}–${a.roll[1]} ${a.name}`).join(', ')}.</p>
          )}
          {shield && (
            <Button className="w-full" onClick={() => roll({ heroId: shield.hero.id, powerId: shield.power.id })}>
              🛡️ {shield.hero.name} uses Noble Shield: only {shield.hero.name} is attacked, and it counts as a 20
            </Button>
          )}
        </>
      )}

      {results && (
        <>
          {last?.tableRoll && rows.length > 0 && (
            <p className="text-xl text-zinc-100">
              The die says {last.tableRoll}: <b>{used.name}</b>!
            </p>
          )}
          <ul className="space-y-2">
            {rows.map((row) => {
              if (row.villager) {
                const villager = state.villagers.find((v) => v.id === row.heroId)
                return (
                  <li key={row.heroId} className={`rounded-xl p-3 text-lg ${row.hit ? 'bg-red-950' : 'bg-zinc-900'}`}>
                    The {name} rolled {row.value} + {used.bonus} = {row.total} against the villager{' '}
                    <span className="font-bold text-emerald-200">{villager?.name}</span>'s AC {row.ac}.{' '}
                    <b className={row.hit ? 'text-red-300' : 'text-emerald-300'}>{row.hit ? 'Hit!' : 'Miss!'}</b> {villager?.name} takes {row.dealt} damage.
                    {villager?.removed && <span className="mt-1 block font-semibold text-amber-200">{villager.name} is gone. Take the token off the board.</span>}
                  </li>
                )
              }
              const hero = state.heroes.find((h) => h.id === row.heroId)
              const hit = row.hit && !row.dodged
              const escape = row.hit && !row.dodged && reactionsFor([hero], 'dodge')[0]
              const [bracers] = row.hit && !row.dodged && row.dealt > 0 ? itemsWithUse([hero], 'reduceDamage') : []
              return (
                <li key={row.heroId} className={`rounded-xl p-3 text-lg ${hit ? 'bg-red-950' : 'bg-zinc-900'}`}>
                  The {name} rolled {row.value} + {used.bonus} = {row.total} against{' '}
                  <span className={`font-bold ${HERO_COLORS[hero.color].text}`}>{hero.name}</span>'s AC {row.ac}.{' '}
                  <b className={hit ? 'text-red-300' : 'text-emerald-300'}>{row.dodged ? 'Tumbling Escape: a miss!' : hit ? 'Hit!' : 'Miss!'}</b>{' '}
                  {hero.name} takes {effect(hit)}.
                  {hit && used.effect && <span className="mt-1 block font-semibold text-amber-200">{used.effect}</span>}
                  {escape && (
                    <Button className="mt-2 w-full" onClick={() => dispatch({ type: 'DODGE_HIT', heroId: hero.id, powerId: escape.power.id })}>
                      🤸 {hero.name} uses Tumbling Escape: the attack misses
                    </Button>
                  )}
                  {bracers && (
                    <Button className="mt-2 w-full" onClick={() => dispatch({ type: 'USE_ITEM', heroId: hero.id, itemId: bracers.item.id })}>
                      💰 {hero.name} uses the {bracers.item.name}: 1 less damage
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
          {step.then && rows.length > 0 && (
            <p className="rounded-lg bg-amber-950/60 p-3 text-lg text-amber-200">{THEN[step.then](name, movedTo?.name ?? 'that hero')}</p>
          )}
          <Button variant="gold" className="w-full py-3 text-lg" onClick={finish}>
            {figure < figures ? `Next ${name} →` : `Done with the ${name}`}
          </Button>
        </>
      )}

      {!controlling && !asking && !step?.explore && !attack && (
        <>
          <p className="text-xl text-zinc-100">
            {step?.move === 'toward' || !step
              ? step?.toward === 'mostHp'
                ? `Move the ${name} ${tiles} toward ${towardHero ? `${towardHero.name}, the hero with the most HP` : 'the hero with the most HP (pick one if they’re tied)'}.`
                : `Move the ${name} ${tiles} toward the closest hero${villagers.length > 0 ? ' or villager (a villager, if it has the choice)' : ''}.`
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
                // The app has no card for it, so it's played from the physical card.
                <span className="flex items-center gap-2 text-right text-sm text-zinc-400">
                  Play it from its card
                  <Button onClick={() => markDone(monster)}>Done</Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Villains go first in every Villain Phase, whoever's turn it is: each takes its turn
// from its card's tactics, the same way a monster does.
export function VillainTurns({ state, dispatch, hero }) {
  const [done, setDone] = useState({})
  const [activeId, setActiveId] = useState(null)
  const turnKey = `${state.turn.round}-${state.turn.heroIndex}`
  const villains = activeVillains(state)
  if (villains.length === 0) return null
  const isDone = (villain) => done[turnKey]?.includes(villain.id)
  const markDone = (villain) => {
    setDone((d) => ({ ...d, [turnKey]: [...(d[turnKey] ?? []), villain.id] }))
    setActiveId(null)
  }
  const active = villains.find((v) => v.id === activeId)

  return (
    <div className="mt-5">
      <h3 className="font-display text-xl font-bold text-fuchsia-300">👑 Villain turn</h3>
      <p className="text-zinc-400">Villains act at the start of every Villain Phase, before anything else.</p>
      {active ? (
        <div className="mt-2">
          <MonsterActivation key={active.id} monster={active} state={state} dispatch={dispatch} activeHeroId={hero.id} onDone={() => markDone(active)} />
        </div>
      ) : (
        <ul className="mt-2 space-y-2">
          {villains.map((villain) => (
            <li key={villain.id} className="flex items-center justify-between gap-3 rounded-xl border border-fuchsia-800 bg-zinc-950/50 p-3">
              <span className={`text-lg font-semibold ${isDone(villain) ? 'text-zinc-500 line-through' : 'text-fuchsia-300'}`}>
                {villain.enraged ? `Enraged ${villain.name}` : villain.name}
              </span>
              {isDone(villain) ? (
                <span className="text-zinc-500">✓ Done</span>
              ) : (
                <Button variant="danger" className="font-bold" onClick={() => setActiveId(villain.id)}>
                  Take its turn
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
