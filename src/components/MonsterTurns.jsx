import { useState } from 'react'
import { monsterArt } from '../data/art.js'
import { HERO_COLORS } from '../data/heroes.js'
import { itemsWithUse } from '../data/items.js'
import { heroAc, reactionsFor } from '../data/powerEffects.js'
import { activeVillains } from '../state/game.js'
import { attackEffect, chooseTargets, currentStepIndex, figureCount, inRefuge, monsterTargets, nobodyToAttack, stepAttack, tapsMany, toggleTarget, towardHero as towardHeroFor } from '../state/monsterTurn.js'
import { useCards } from '../state/useCards.js'
import { rollD20, shuffleNumbers } from '../state/random.js'
import Art from './Art.jsx'
import { MonsterControl, TileGuardQuestion } from './Treasure.jsx'
import { DrawTileButton } from './Tiles.jsx'
import { Button } from './ui.jsx'
import { figureToken } from '../board/play.js'
import { boardStep, boardTargetIds, closestTarget, foeDistance, squareAway, squareNextTo, squareToward } from '../board/monsters.js'
import { seesInvisible } from '../board/tactics.js'
import { hitMoveStep } from '../board/powerMoves.js'

// Keyleth's Bravery: when a monster within 1 tile of her activates, she can step next to it and heal 1.
function Bravery({ state, name, monsterId, token, dispatch }) {
  // On the virtual board only a hero within 1 tile of the monster is offered.
  const near = (h) => !state.board || ['adjacent', 'within1', null].includes(foeDistance(state, h.id, monsterId))
  return reactionsFor(state.heroes.filter((h) => !h.tokens?.refuge && h.hp > 0 && near(h)), 'bravery').map(({ hero, power }) => (
    <Button key={power.id} className="w-full text-left" onClick={() => dispatch({ type: 'USE_POWER', heroId: hero.id, powerId: power.id, heroIds: [], foeToken: token })}>
      🦁 {hero.name} uses Bravery (the {name} is within 1 tile of {hero.name}): put {hero.name} next to it and heal 1 HP
    </Button>
  ))
}

// Draws the top card of the virtual monster deck for a hero. Hidden when the card
// file has no monsters, so the "+ Monster" form is the way to add them instead.
// `drawKey` makes it draw once, then say what came.
export function DrawMonsterButton({ state, heroId, dispatch, drawKey, className = '', label = '🐉 Draw a monster' }) {
  const { monsters } = useCards()
  const deck = state.monsterDeck
  if (!deck && monsters.length === 0) return null
  const drawn = drawKey && state.turn.monsterDraws?.[drawKey]
  if (drawn === 'none') return <p className={`text-amber-300 ${className}`}>✓ Monster card drawn, but no monster comes this time.</p>
  if (drawn) return <p className={`text-emerald-300 ${className}`}>✓ {/^[AEIOU]/.test(drawn) ? 'An' : 'A'} {drawn} was drawn. Put its figure on the new tile.</p>
  const left = deck ? deck.draw.length : monsters.reduce((sum, card) => sum + card.copies, 0)
  return (
    <Button
      variant="danger"
      className={`px-5 py-3 text-lg font-bold ${className}`}
      onClick={() => dispatch({ type: 'DRAW_MONSTER', heroId, drawKey, cards: monsters, random: shuffleNumbers() })}
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
// time, then rolls its attack against the hero's AC and applies the result. The rules
// behind each step are in state/monsterTurn.js.
export function MonsterActivation({ monster, state, dispatch, activeHeroId, onDone }) {
  const { card, name } = monster
  const figures = figureCount(monster)
  // On the virtual board the board answers the card's questions and picks the target. It is
  // worked out once when the turn starts, so the monster's own move doesn't change the answer.
  const [byBoard, setByBoard] = useState(() => boardStep(state, monster, card.tactics) !== null)
  // Each figure of a several-figure card (the Legion Devil) has its own token and turn.
  const fromBoard = (n = 1) => {
    const token = figureToken(monster.id, n)
    const index = boardStep(state, monster, card.tactics, token) ?? 0
    return { index, yes: Boolean(card.tactics[index]?.when), targets: boardTargetIds(state, monster, card.tactics[index], token) }
  }
  const [start] = useState(() => (byBoard ? fromBoard() : { index: 0, yes: false, targets: [] }))
  const [figure, setFigure] = useState(1)
  const [stepIndex, setStepIndex] = useState(start.index)
  const [answered, setAnswered] = useState(start.yes) // "Yes" to this step's question
  const [chosen, setChosen] = useState(start.targets)
  const [guarded, setGuarded] = useState([])
  const [results, setResults] = useState(null)
  const [tiePick, setTiePick] = useState(null) // the players' pick when heroes tie for the most HP
  const [controlling, setControlling] = useState(false)
  // The answers given so far, so a wrong tap can be taken back. They stay on this
  // iPad until the dice roll, so the Undo button can't reach them.
  const [trail, setTrail] = useState([])
  // With nobody left on the board, only the steps that don't need a hero are asked.
  const away = inRefuge(state)
  const nobody = nobodyToAttack(state)
  const index = currentStepIndex(card.tactics, stepIndex, nobody)
  const step = card.tactics[index]
  // Scroll of Monster Control, read on the active hero's own turn.
  const activeHero = state.heroes.find((h) => h.id === activeHeroId)
  const [scroll] = itemsWithUse(activeHero ? [activeHero] : [], 'monsterControl')
  const { attack, table } = stepAttack(card, step)
  const asking = step?.when && !answered
  // Before anyone has answered or rolled for this figure. On the virtual board the board
  // has already answered its questions, so the turn starts part way down the card.
  const untouched = !results && trail.length === 0 && (byBoard || (stepIndex === 0 && !answered))

  const answer = (yes) => {
    setTrail((list) => [...list, { stepIndex, answered }])
    if (yes) setAnswered(true)
    else setStepIndex(index + 1)
  }
  const changeAnswer = () => {
    const previous = trail[trail.length - 1]
    setTrail((list) => list.slice(0, -1))
    setStepIndex(previous.stepIndex)
    setAnswered(previous.answered)
    setChosen([])
    setGuarded([])
    setTiePick(null)
  }

  const nextFigure = () => {
    const again = byBoard ? fromBoard(figure + 1) : { index: 0, yes: false, targets: [] }
    setFigure((f) => f + 1)
    setStepIndex(again.index)
    setAnswered(again.yes)
    setTrail([])
    setChosen(again.targets)
    setGuarded([])
    setResults(null)
  }
  const finish = figure < figures ? nextFigure : onDone
  const token = figureToken(monster.id, figure)
  // The board got something wrong: back to asking the questions.
  const askInstead = () => {
    setByBoard(false)
    setStepIndex(0)
    setAnswered(false)
    setTrail([])
    setChosen([])
    setGuarded([])
    setTiePick(null)
  }
  const moveTo = (to) => {
    const at = state.board?.tokens[token]
    if (to && at && (to[0] !== at[0] || to[1] !== at[1])) dispatch({ type: 'MOVE_TOKEN', id: token, to })
  }

  // An invisible hero isn't the closest hero, so only some steps can pick them.
  const unseen = seesInvisible(step) || step?.when === 'aloneByUnexploredEdge' || step?.explore ? [] : state.heroes.filter((h) => h.tokens?.invisible && !h.tokens?.refuge)
  const targetable = monsterTargets(state).filter((h) => !unseen.includes(h))
  const villagers = targetable.filter((h) => h.villager)
  const toggle = (heroId) => setChosen((list) => toggleTarget(list, heroId, tapsMany(step)))
  const { tapped, strongest, tied, top, targetIds } = chooseTargets(step, targetable, chosen, tiePick)

  const roll = (nobleShield) => {
    // On the board it steps next to the hero first, when the card says so.
    if (byBoard && step.move === 'adjacent') {
      const goal = targetable.find((h) => h.id === (step.targets === 'all' ? boardTargetIds(state, monster, { when: step.when }, token)[0] : targetIds[0]))
      moveTo(squareNextTo(state, token, state.board.tokens[goal?.id]))
    }
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
  const effect = (hit) => attackEffect(used, hit)
  // The hero it moves toward when nobody is in reach.
  const towardHero = towardHeroFor(state, step)
  const tiles = step?.tiles > 1 ? `${step.tiles} tiles` : '1 tile'
  // Where it goes on the board when it moves toward a hero, and after an attack.
  const towardFigure = byBoard && (!step || step.move === 'toward') && !nobody ? (step?.toward === 'mostHp' ? towardHero : closestTarget(state, token)) : null
  const towardName = towardFigure && targetable.find((h) => h.id === towardFigure.id)?.name
  const moveToward = () => {
    if (towardFigure) moveTo(squareToward(state, token, state.board.tokens[towardFigure.id], step?.tiles ?? 1))
    finish()
  }
  // A hit that moves the hero ("1 tile away from the duergar"): the board asks where they go.
  const pushes = byBoard && Boolean(hitMoveStep(used.effect)) && rows.some((r) => r.hit && !r.dodged && !r.villager)
  const finishAttack = () => {
    if (pushes) dispatch({ type: 'HIT_MOVES', tokenId: token })
    if (byBoard && step.then === 'adjacent' && movedTo) moveTo(squareNextTo(state, token, state.board.tokens[movedTo.id]))
    if (byBoard && step.then === 'away') moveTo(squareAway(state, token))
    if (byBoard && step.then === 'within1') dispatch({ type: 'FOE_STEP', tokenId: token, n: 1 })
    finish()
  }

  return (
    <div className="space-y-4 rounded-2xl border-2 border-red-700 bg-zinc-950/80 p-4">
      <div className="flex items-center gap-3">
        <Art name={monsterArt(monster)} className="w-16" />
        <h4 className="mr-auto font-display text-2xl font-bold text-red-300">
          {name}
          {figures > 1 && <span className="ml-2 text-base text-zinc-400">figure {figure} of {figures}</span>}
        </h4>
        <span className="text-sm text-zinc-500">AC {monster.ac}</span>
      </div>
      {away.length > 0 && !results && (
        <p className="rounded-lg bg-sky-950/60 p-3 text-sky-200">
          ✨ {away.map((h) => h.name).join(' and ')} {away.length > 1 ? 'are' : 'is'} in the Astral Refuge, off the board.{' '}
          {nobody ? `No hero is on the board for the ${name} to go after.` : `Leave ${away.length > 1 ? 'them' : away[0].name} out when you answer.`}
        </p>
      )}
      {unseen.length > 0 && !results && !nobody && (
        <p className="rounded-lg bg-sky-950/60 p-3 text-sky-200">
          👻 {unseen.map((h) => h.name).join(' and ')} {unseen.length > 1 ? 'are' : 'is'} invisible, so the {name} can't pick{' '}
          {unseen.length > 1 ? 'them' : unseen[0].name} as the closest hero.{byBoard ? '' : ` Answer as if ${unseen.length > 1 ? 'they weren’t' : `${unseen[0].name} wasn’t`} there.`}
        </p>
      )}
      {byBoard && !results && step?.when && answered && (
        <p className="rounded-lg bg-emerald-950/60 p-3 text-emerald-200">📍 The board says yes: {QUESTIONS[step.when](name)}</p>
      )}
      {untouched && <Bravery state={state} name={name} monsterId={monster.id} token={token} dispatch={dispatch} />}
      {card.special && figure === 1 && untouched && (
        <p className="rounded-lg bg-zinc-900 p-2 text-sm text-zinc-400">{card.special}</p>
      )}

      {scroll && untouched &&
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
            <Button variant="gold" className="py-4 text-2xl" onClick={() => answer(true)}>
              Yes
            </Button>
            <Button className="py-4 text-2xl" onClick={() => answer(false)}>
              No
            </Button>
          </div>
        </>
      )}

      {!controlling && !asking && step?.explore && (
        <>
          <p className="text-xl text-zinc-100">A new tile goes next to the {name}'s tile, from the <b>bottom</b> of the stack.</p>
          <DrawTileButton state={state} dispatch={dispatch} drawKey={`monster-${monster.id}`} from="bottom" />
          <DrawMonsterButton
            state={state}
            heroId={activeHeroId}
            dispatch={dispatch}
            drawKey={`monster-${monster.id}`}
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
            <p className="rounded-lg bg-amber-950/60 p-3 text-lg text-amber-200">
              {byBoard ? `The ${name} moves next to the closest hero, then attacks.` : `First, move the ${name} next to the closest hero.`}
            </p>
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
              {byBoard ? `The ${name} moves next to ${movedTo.name}, then attacks.` : `First, move the ${name} next to ${movedTo.name}.`}
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
                  {hit && pushes && <span className="mt-1 block text-emerald-200">📍 The board lights the squares to move {hero.name} to when you tap Done.</span>}
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
            <p className="rounded-lg bg-amber-950/60 p-3 text-lg text-amber-200">
              {!byBoard
                ? THEN[step.then](name, movedTo?.name ?? 'that hero')
                : step.then === 'within1'
                  ? `When you tap Done, the board lights the squares within 1 tile: tap the ${name}, then where it goes.`
                  : `The ${name} moves away when you tap Done.`}
            </p>
          )}
          <Button variant="gold" className="w-full py-3 text-lg" onClick={finishAttack}>
            {figure < figures ? `Next ${name} →` : `Done with the ${name}`}
          </Button>
        </>
      )}

      {!controlling && !asking && !step?.explore && !attack && (
        <>
          <p className="text-xl text-zinc-100">
            {nobody
              ? `The ${name} has nobody to go after, so it does nothing this turn.`
              : towardName
              ? `The ${name} moves ${tiles} toward ${towardName}.`
              : byBoard && unseen.length > 0 && step?.toward !== 'mostHp'
              ? `The ${name} can't see anyone to go after, so it stays put.`
              : step?.move === 'toward' || !step
              ? step?.toward === 'mostHp'
                ? `Move the ${name} ${tiles} toward ${towardHero ? `${towardHero.name}, the hero with the most HP` : 'the hero with the most HP (pick one if they’re tied)'}.`
                : `Move the ${name} ${tiles} toward the closest hero${villagers.length > 0 ? ' or villager (a villager, if it has the choice)' : ''}.`
              : 'Do what the card says.'}
          </p>
          <Button variant="gold" className="w-full py-3 text-lg" onClick={towardFigure ? moveToward : finish}>
            {towardFigure ? `Move the ${name}` : figure < figures ? `Next ${name} →` : `Done with the ${name}`}
          </Button>
        </>
      )}

      {byBoard && !controlling && !results && (
        <Button variant="ghost" className="w-full" onClick={askInstead}>
          ↶ The board got it wrong: ask me instead
        </Button>
      )}

      {!controlling && !results && trail.length > 0 && (
        <Button variant="ghost" className="w-full" onClick={changeAnswer}>
          ↶ Oops, change my last answer
        </Button>
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
  const [activeId, setActiveId] = useState(null)
  const monsters = state.monsters.filter((m) => m.ownerId === hero.id)
  // Kept in the game, so every iPad sees which monsters have gone.
  const isDone = (monster) => (state.turn.acted ?? []).includes(monster.id)
  const markDone = (monster) => {
    dispatch({ type: 'MARK_ACTED', id: monster.id, name: monster.name })
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
  const [activeId, setActiveId] = useState(null)
  const villains = activeVillains(state)
  if (villains.length === 0) return null
  const isDone = (villain) => (state.turn.acted ?? []).includes(villain.id)
  const markDone = (villain) => {
    dispatch({ type: 'MARK_ACTED', id: villain.id, name: villain.name })
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
