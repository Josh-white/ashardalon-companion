import { useState } from 'react'
import { stayedOnBoard } from '../board/play.js'
import { foeDistance, foesInRange, powerRange } from '../board/monsters.js'
import { hypnotized } from '../board/powerMoves.js'
import { hasSecondChance } from '../data/difficulty.js'
import { asksIfStayed, attackItems, distanceChoices, heroItems, itemsWithUse } from '../data/items.js'
import { effectsOf, maxRolls, reactionsFor } from '../data/powerEffects.js'
import { rollD20 } from '../state/random.js'
import { attackGone, attackNumbers, foes, powerNumber } from '../state/game.js'
import { HeroChoice, InReach, MonsterChoice, monsterName } from './Pickers.jsx'
import { heroesInReach } from '../board/encounters.js'
import { Button } from './ui.jsx'

// The question a power asks after its attack (Sacred Flame's healing, Cleric's Shield,
// Righteous Smite, Wrathful Thunder). Answered once.
function FollowUp({ state, hero, power, last, dispatch }) {
  const effects = effectsOf(power)
  // On the virtual board Righteous Smite already knows who shares the tile.
  const onTile = heroesInReach(state, hero.id, 'sameTile')
  const [chosen, setChosen] = useState(effects.after === 'heal-tile' ? onTile ?? [hero.id] : [])
  const [skipped, setSkipped] = useState(false)
  const anyHit = last.rolls.some((r) => r.hit)
  const kind = effects.onHit?.heal && anyHit ? 'heal-one' : effects.after
  const asks = { 'heal-one': true, 'heal-tile': true, shield: true, 'pass-monster': state.monsters.length > 0 }
  if (last.followUpDone || skipped || !asks[kind]) return null

  const send = (extra) => dispatch({ type: 'ATTACK_FOLLOW_UP', heroId: hero.id, powerId: power.id, ...extra })
  const pickOne = (id) => setChosen([id])
  const toggle = (id) => setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
  const index = state.heroes.indexOf(hero)
  const right = state.heroes[(index - 1 + state.heroes.length) % state.heroes.length]

  const prompts = {
    'heal-one': [`Who gets ${effects.onHit?.heal} HP? ${hero.name}, or a hero on ${hero.name}'s tile.`, 'Heal'],
    'heal-tile': [`Tap every hero on ${hero.name}'s tile. Each gets 1 HP.`, 'Heal them'],
    shield: [`Which hero on ${hero.name}'s tile gets +2 AC? It lasts until ${hero.name} uses ${power.name} again.`, 'Shield them'],
    'pass-monster': [`Which monster on ${hero.name}'s tile goes to ${right.player || right.name}, the player on your right?`, 'Pass it'],
  }
  const [question, label] = prompts[kind]
  return (
    <div className="space-y-3 rounded-xl border border-emerald-700 bg-emerald-950/40 p-3">
      <p className="text-lg font-semibold text-emerald-200">✨ {power.name}: {question}</p>
      {kind === 'pass-monster' ? (
        <InReach items={state.monsters} near={state.board ? foesInRange(state, hero.id, 'sameTile', state.monsters).map((m) => m.id) : null} what="monsters">
          {(shown) => <MonsterChoice state={state} monsters={shown} chosen={chosen} onToggle={pickOne} />}
        </InReach>
      ) : (
        <InReach items={state.heroes} near={onTile}>
          {(shown) => <HeroChoice heroes={shown} chosen={chosen} onToggle={kind === 'heal-tile' ? toggle : pickOne} />}
        </InReach>
      )}
      <div className="flex gap-2">
        <Button
          variant="gold"
          className="flex-1"
          disabled={chosen.length === 0}
          onClick={() => send(kind === 'pass-monster' ? { monsterId: chosen[0] } : { heroIds: chosen })}
        >
          {label}
        </Button>
        <Button variant="ghost" onClick={() => setSkipped(true)}>
          Skip
        </Button>
      </div>
    </div>
  )
}

// One piece of an attack's sum: " + 2 Vorpal Sword", blue when an item or another hero adds it.
function SumPart({ part, first = false, plain = first }) {
  const tone = part.value < 0 ? 'text-orange-300' : plain ? '' : 'text-sky-300'
  return (
    <>
      {first ? '' : part.value < 0 ? ' − ' : ' + '}
      <span className={tone}>
        {Math.abs(part.value)} {part.label}
      </span>
    </>
  )
}

// After a hit, where its damage came from, when more than the power's own number went in.
function DamageLine({ row }) {
  const parts = row.attack?.parts
  if (!row.hit || !parts) return null
  const extra = [
    ...(row.attack.evenBonus && row.value % 2 === 0 ? [{ label: 'even roll', value: row.attack.evenBonus }] : []),
    ...parts.crits.filter((c) => row.value >= c.from).map((c) => ({ label: `${c.label} (rolled ${c.from}+)`, value: 1 })),
  ]
  const all = [...parts.damage, ...extra]
  if (all.length < 2) return null
  return (
    <span className="mt-1 block text-base text-zinc-300">
      Damage:{' '}
      {all.map((p, i) => (
        <SumPart key={p.label} part={p} first={i === 0} />
      ))}{' '}
      = <b>{all.reduce((n, p) => n + p.value, 0)}</b>
    </span>
  )
}

// Before the roll: what the hero needs on the d20 and how much a hit deals, piece by piece,
// so the players can see what their items and powers are adding.
function AttackMath({ numbers, monster, name }) {
  const need = monster.ac - numbers.bonus
  const needText = need <= 1 ? 'any roll hits' : need > 20 ? "can't hit, even with a 20" : `roll ${need} or more`
  const chip = (part, i) => (
    <span
      key={`${part.label}-${i}`}
      className={`rounded-lg px-2 py-1 ${i === 0 ? 'bg-zinc-800' : part.value < 0 ? 'border border-orange-700 bg-orange-950/70' : 'border border-sky-700 bg-sky-950/70'}`}
    >
      <b className={i === 0 ? '' : part.value < 0 ? 'text-orange-300' : 'text-sky-300'}>{i === 0 ? part.value : Math.abs(part.value)}</b>{' '}
      <span className="text-sm text-zinc-300">{part.label}</span>
    </span>
  )
  const sign = (part, i) => (i === 0 ? null : <span className="text-zinc-500">{part.value < 0 ? '−' : '+'}</span>)
  const row = (parts) => parts.flatMap((p, i) => [sign(p, i), chip(p, i)]).filter(Boolean)
  return (
    <div className="space-y-2 rounded-xl bg-zinc-900 p-3">
      <p className="text-xs tracking-wide text-zinc-400 uppercase">
        To hit the {name} (AC {monster.ac})
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-lg bg-zinc-800 px-2 py-1 font-semibold">d20</span>
        <span className="text-zinc-500">+</span>
        {row(numbers.parts.bonus)}
        <span className="text-zinc-500">=</span>
        <span className="rounded-lg bg-amber-500 px-2 py-1 font-bold text-zinc-950">{needText}</span>
      </div>
      <p className="text-xs tracking-wide text-zinc-400 uppercase">Damage if you hit</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {row(numbers.parts.damage)}
        {numbers.parts.damage.length > 1 && (
          <>
            <span className="text-zinc-500">=</span>
            <span className="rounded-lg bg-amber-500 px-2 py-1 font-bold text-zinc-950">{numbers.damage} damage</span>
          </>
        )}
      </div>
      {numbers.parts.crits.map((c) => (
        <p key={c.label} className="text-sm text-sky-200">
          Roll {c.from === 20 ? 'a 20' : `${c.from} or more`}: +1 more damage from {c.label}.
        </p>
      ))}
      {numbers.evenBonus > 0 && <p className="text-sm text-sky-200">Roll an even number: +{numbers.evenBonus} more damage.</p>}
      {numbers.miss > 0 && <p className="text-sm text-zinc-400">Even on a miss: {numbers.miss} damage.</p>}
    </div>
  )
}

// What just happened in an attack, plus whatever can still change it: Inspiring Advice on
// a miss, Furious Assault on a hit, and the power's own follow-up question.
export function AttackAftermath({ state, last, dispatch }) {
  const hero = state.heroes.find((h) => h.id === last.heroId)
  const power = hero?.powers.find((p) => p.id === last.powerId)
  const item = heroItems(hero).find((i) => i.id === last.itemId)
  if (!hero || !(power || item)) return null
  const effects = effectsOf(power)
  const alive = (row) => foes(state).some((m) => m.id === row.monsterId)
  const advice = reactionsFor(state.heroes, 'reroll')
  // A Lucky Charm rerolls its owner's own miss.
  const charms = itemsWithUse([hero], 'reroll')
  const furious = reactionsFor([hero], 'furious')[0]
  const rerollable = last.rolls.filter((r) => !r.hit && !r.rerolled && alive(r))
  const furiousRows = furious ? last.rolls.filter((r) => r.hit && alive(r)) : []
  // A monster attacked twice shows up twice; reactions only need it once.
  const once = (rows) => rows.filter((r, i) => rows.findIndex((x) => x.monsterId === r.monsterId) === i)

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {last.rolls.map((r, i) => (
          <li key={i} className={`rounded-xl p-3 text-lg ${r.hit ? 'bg-emerald-950' : 'bg-zinc-900'}`}>
            {hero.name} {r.rerolled ? 'rolled again:' : 'rolled'} {r.value}
            {r.attack?.parts ? r.attack.parts.bonus.map((p, i) => <SumPart key={p.label} part={p} plain={i === 0} />) : ` + ${r.attack?.bonus ?? last.attack.bonus}`} = {r.total} against the{' '}
            {r.label}'s AC {r.ac}. <b className={r.hit ? 'text-emerald-300' : 'text-zinc-300'}>{r.outcome}</b>
            <DamageLine row={r} />
          </li>
        ))}
      </ul>
      {once(rerollable).flatMap((row) =>
        advice.map(({ hero: helper, power: helperPower }) => (
          <Button
            key={`${row.monsterId}-${helperPower.id}`}
            className="w-full"
            onClick={() =>
              dispatch({ type: 'REROLL_ATTACK', helperId: helper.id, helperPowerId: helperPower.id, monsterId: row.monsterId, roll: rollD20() })
            }
          >
            💬 {helper.name}'s Inspiring Advice: roll again against the {row.label}
          </Button>
        )),
      )}
      {once(rerollable).flatMap((row) =>
        charms.map(({ item: charm }) => (
          <Button
            key={`${row.monsterId}-${charm.id}`}
            className="w-full"
            onClick={() => dispatch({ type: 'REROLL_ATTACK', helperId: hero.id, helperItemId: charm.id, monsterId: row.monsterId, roll: rollD20() })}
          >
            🍀 Lucky Charm: roll again against the {row.label} (then it's discarded)
          </Button>
        )),
      )}
      {hasSecondChance(state, hero) &&
        once(rerollable).map((row) => (
          <Button
            key={`second-${row.monsterId}`}
            className="w-full"
            onClick={() => dispatch({ type: 'REROLL_ATTACK', helperId: hero.id, secondChance: true, monsterId: row.monsterId, roll: rollD20() })}
          >
            😊 Second chance: roll again against the {row.label} (once this adventure)
          </Button>
        ))}
      {once(furiousRows).map((row) => (
        <Button
          key={row.monsterId}
          className="w-full"
          onClick={() => dispatch({ type: 'POWER_DAMAGE', source: 'furious', heroId: hero.id, powerId: furious.power.id, monsterIds: [row.monsterId] })}
        >
          😤 Furious Assault: +1 damage to the {row.label}
        </Button>
      ))}
      {power && <FollowUp key={`${last.powerId}-${last.rolls.length}`} state={state} hero={hero} power={power} last={last} dispatch={dispatch} />}
      {[effects.note, last.rolls.some((r) => r.hit) ? effects.hitNote : effects.missNote].filter(Boolean).map((note) => (
        <p key={note} className="rounded-lg bg-amber-950/60 p-3 text-amber-200">
          {note}
        </p>
      ))}
    </div>
  )
}

// The question some powers ask before the roll.
function BeforeQuestion({ hero, effects, answers, setAnswers }) {
  if (effects.ask === 'started-adjacent') {
    return (
      <div>
        <p className="text-zinc-200">Did {hero.name} start this Hero Phase next to that monster? (+1 damage if you hit)</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[true, false].map((yes) => (
            <Button key={String(yes)} variant={answers.startedAdjacent === yes ? 'gold' : 'default'} onClick={() => setAnswers({ startedAdjacent: yes })}>
              {yes ? 'Yes' : 'No'}
            </Button>
          ))}
        </div>
      </div>
    )
  }
  if (effects.ask === 'adjacent-count') {
    return (
      <div>
        <p className="text-zinc-200">How many monsters are next to {hero.name}? (+1 to the attack for each)</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((n) => (
            <Button key={n} variant={answers.adjacentCount === n ? 'gold' : 'default'} onClick={() => setAnswers({ adjacentCount: n })}>
              {n}
            </Button>
          ))}
        </div>
      </div>
    )
  }
  return null
}

// The hero's attack is used up: says why, with a way past it for when a card allows
// another attack.
function AttackUsed({ reason, onAnyway }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-zinc-900 p-3">
      <p className="text-zinc-400">{reason}</p>
      <Button className="text-sm" onClick={onAnyway}>
        ⚔️ Attack anyway
      </Button>
    </div>
  )
}

// "3 Miss: 1 Damage" → "3 damage, 1 on a miss".
function damageLabel(text) {
  const damage = powerNumber(text) ?? 0
  const miss = powerNumber(/miss\D*(\d+)/i.exec(text ?? '')?.[1])
  return `${damage} damage${miss ? `, ${miss} on a miss` : ''}`
}

const RANGE_WORDS = { adjacent: 'next to', sameTile: 'on the same tile as', within1: 'within 1 tile of', within2: 'within 2 tiles of', within3: 'within 3 tiles of' }

const DISTANCE_LABELS = { adjacent: 'Next to me', within1: 'Within 1 tile', far: 'Farther' }

// Magic weapons only help against monsters close enough, so the app asks how far each one is.
// On the virtual board both are pre-answered from the board, and a tap still changes them.
function DistanceQuestion({ state, hero, chosen, distances, setDistances, fromBoard, stayed, setStayed, stayedFromBoard }) {
  const choices = distanceChoices(hero)
  const ids = chosen.filter((id, i) => chosen.indexOf(id) === i)
  if (!choices && !asksIfStayed(hero)) return null
  return (
    <div className="space-y-2 rounded-xl bg-yellow-950/40 p-3">
      {choices &&
        ids.map((id) => {
          const monster = state.monsters.find((m) => m.id === id)
          return (
            <div key={id}>
              <p className="text-zinc-200">
                💰 How far is the {monster ? monsterName(state, monster) : 'monster'} from {hero.name}?
                {fromBoard[id] && <span className="text-sm text-zinc-400"> (from the board, tap to change)</span>}
              </p>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {choices.map((d) => (
                  <Button key={d} variant={distances[id] === d ? 'gold' : 'default'} onClick={() => setDistances({ ...distances, [id]: d })}>
                    {DISTANCE_LABELS[d]}
                  </Button>
                ))}
              </div>
            </div>
          )
        })}
      {asksIfStayed(hero) && (
        <label className="flex items-center gap-3 text-zinc-200">
          <input type="checkbox" className="h-6 w-6" checked={stayed} onChange={() => setStayed(!stayed)} />
          <span>
            {hero.name} didn't move this Hero Phase (Dwarven Hammer hits harder)
            {stayedFromBoard && <span className="block text-sm text-zinc-400">From the board: {stayed ? `${hero.name} hasn't moved yet.` : `${hero.name} has moved.`} Tap to change.</span>}
          </span>
        </label>
      )}
    </div>
  )
}

// The Hero Phase's attack: pick a power and the monster (or monsters) it hits, then the
// app rolls against each monster's AC, takes off the damage and hands out XP.
// `extra` is a free at-will attack from Cause Fear or Acrobatic Onslaught.
export default function HeroAttack({ state, hero, dispatch, extra = null }) {
  const powers = hero.powers.filter(
    (p) => !p.used && powerNumber(p.card?.attack) !== null && (!extra || p.type === 'at-will'),
  )
  // Items with their own attack (Crossbow of Speed) are picked like a power.
  const items = extra ? [] : attackItems(hero, state.turn)
  const [powerId, setPowerId] = useState(null)
  const [chosen, setChosen] = useState([])
  const [answers, setAnswers] = useState({})
  const [distances, setDistances] = useState({})
  // null until a player taps it: then the board's answer is used.
  const [stayedTap, setStayed] = useState(null)
  const [rolled, setRolled] = useState(false)
  // Tapped "Attack anyway" past a used-up attack. Each extra attack needs its own tap.
  const [anyway, setAnyway] = useState(false)
  const gone = extra ? null : attackGone(state, hero)
  const item = items.find((i) => i.id === powerId)
  // An item's attack reads like a power's: a name, an attack number and damage.
  const power = powers.find((p) => p.id === powerId) ?? (item && { ...item, type: 'item', card: { attack: `+${item.card.attack.bonus}`, damage: String(item.card.attack.damage), text: item.card.text } })
  const effects = effectsOf(item ? null : power)
  const limit = item ? 1 : power ? maxRolls(power) : 1
  // Hypnotism attacks the monster the moved one ends up next to, never the moved one.
  const moving = effects.ask === 'moved-monster'
  // On the virtual board only the monsters the power can reach are offered.
  const [showAll, setShowAll] = useState(false)
  const range = state.board && !moving ? powerRange(item ? item.card.text : power?.card?.text) : null
  // On the virtual board Hypnotism's move is done there, and the board knows who it's next to.
  const trance = moving && power ? hypnotized(state, power.name) : null
  const asked = trance ? { movedId: trance.id } : answers
  const everyTarget = foes(state).filter((m) => !moving || (m.id !== asked.movedId && (!trance || trance.nextTo.includes(m.id))))
  const reachable = foesInRange(state, hero.id, range, everyTarget)
  const targets = showAll ? everyTarget : reachable
  // The board says how far each monster is, for magic weapons that care.
  // An item that only cares about "next to you" offers no "within 1 tile" answer, so the
  // board's within1 counts as farther. A player's tap beats the board.
  const choices = distanceChoices(hero)
  const boardDistances = Object.fromEntries(
    chosen
      .map((id) => [id, foeDistance(state, hero.id, id)])
      .filter(([, d]) => d)
      .map(([id, d]) => [id, choices && !choices.includes(d) ? 'far' : d]),
  )
  const allDistances = { ...boardDistances, ...distances }
  const fromBoard = Object.fromEntries(Object.keys(boardDistances).filter((id) => !distances[id]).map((id) => [id, true]))
  // The board knows whether the active hero has moved this Hero Phase (Dwarven Hammer).
  const boardStayed = stayedOnBoard(state, hero)
  const stayed = stayedTap ?? boardStayed ?? false
  const unknownAc = targets.find((m) => chosen.includes(m.id) && !m.ac)
  const needsAnswer =
    (effects.ask && Object.keys(asked).length === 0) || (choices && chosen.some((id) => !allDistances[id]))
  const last = state.turn.lastAttack
  const showResults = rolled && last && !last.bonus && last.heroId === hero.id

  if (foes(state).length === 0 && !showResults) {
    return extra ? null : <p className="mt-4 rounded-xl bg-zinc-950/50 p-3 text-zinc-400">No monsters to attack right now.</p>
  }

  const pickPower = (id) => {
    setPowerId(id)
    setChosen([])
    setAnswers({})
    setDistances({})
    setShowAll(false)
  }
  const tap = (id) =>
    setChosen((list) => {
      if (effects.sameTarget) return Array(limit).fill(id)
      if (limit === 1) return [id]
      // Tornado Strike: each tap is one more of its attacks. With only one monster to hit,
      // one tap takes all of them.
      if (effects.attacks) {
        if (targets.length === 1) return Array(limit).fill(id)
        return list.length < limit ? [...list, id] : list
      }
      if (list.includes(id)) return list.filter((x) => x !== id)
      return list.length < limit ? [...list, id] : list
    })
  const reset = () => {
    pickPower(null)
    setRolled(false)
  }

  const roll = () => {
    const targets = chosen.map((monsterId) => ({ monsterId, roll: rollD20() }))
    const source = item ? { itemId: item.id } : { powerId: power.id }
    dispatch({ type: 'HERO_ATTACK', heroId: hero.id, ...source, targets, bonusAttack: Boolean(extra), distances: allDistances, stayed, ...asked })
    setRolled(true)
    setAnyway(false)
  }

  const pickHint = effects.sameTarget
    ? `Which monster? ${power?.name} attacks it ${limit} times.`
    : effects.attacks
      ? `Tap a monster for each of the ${limit} attacks (${chosen.length} picked).`
      : limit === 1
        ? 'Which monster?'
        : limit === Infinity
          ? 'Tap every monster it hits.'
          : `Tap up to ${limit} monsters.`

  return (
    <div className="mt-5 space-y-3 rounded-2xl border-2 border-amber-600/60 bg-zinc-950/60 p-4">
      <h3 className={`font-display text-xl font-bold ${gone && !anyway && !showResults ? 'text-zinc-500' : 'text-amber-300'}`}>
        {extra ? `⚔️ ${hero.name}'s extra attack from ${extra.source}${extra.bonus ? ` (+${extra.bonus})` : ''}` : '⚔️ Attack a monster'}
      </h3>

      {showResults ? (
        <>
          <AttackAftermath state={state} last={last} dispatch={dispatch} />
          {gone ? (
            <AttackUsed
              reason={gone}
              onAnyway={() => {
                reset()
                setAnyway(true)
              }}
            />
          ) : (
            <Button className="w-full" onClick={reset}>
              Attack again
            </Button>
          )}
        </>
      ) : gone && !anyway ? (
        <AttackUsed reason={gone} onAnyway={() => setAnyway(true)} />
      ) : (
        <>
          {powers.length + items.length === 0 ? (
            <p className="text-zinc-400">None of {hero.name}'s unused {extra ? 'at-will ' : ''}powers has an attack number.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {powers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickPower(p.id)}
                  className={`rounded-xl border-2 px-3 py-2 text-left transition active:scale-95 ${
                    p.id === powerId ? 'border-amber-400 bg-amber-950/60' : 'border-zinc-700 bg-zinc-900'
                  }`}
                >
                  <span className="block font-semibold text-zinc-100">{p.name}</span>
                  <span className="text-sm text-zinc-400">
                    {p.card.attack} · {damageLabel(p.card.damage)}{p.type === 'daily' ? ' · daily' : ''}
                  </span>
                </button>
              ))}
              {items.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => pickPower(i.id)}
                  className={`rounded-xl border-2 px-3 py-2 text-left transition active:scale-95 ${
                    i.id === powerId ? 'border-amber-400 bg-amber-950/60' : 'border-yellow-700 bg-zinc-900'
                  }`}
                >
                  <span className="block font-semibold text-zinc-100">💰 {i.name}</span>
                  <span className="text-sm text-zinc-400">
                    +{i.card.attack.bonus} · {i.card.attack.damage} damage · item
                  </span>
                </button>
              ))}
            </div>
          )}

          {power && (
            <>
              {/* Always open, right under the powers, so nobody has to dig for what it does. */}
              {power.card.text && (
                <p className="whitespace-pre-line rounded-lg border-l-4 border-amber-500 bg-zinc-900 px-3 py-2 text-sm leading-snug text-zinc-200">
                  <b className="text-amber-300">{power.name}:</b> {power.card.text}
                </p>
              )}
              {effects.before && (
                <div className="rounded-lg bg-amber-950/60 p-3 text-amber-200">
                  <p>{effects.before}</p>
                  {/* On the virtual board the move is done there, before the roll. */}
                  {state.board && effects.board?.before && !item && (
                    state.turn.boardMove?.source === power.name ? (
                      <p className="mt-2 font-semibold">📍 Do it on the board, then pick the monster.</p>
                    ) : (
                      <Button className="mt-2 w-full" onClick={() => dispatch({ type: 'START_BOARD_MOVE', heroId: hero.id, powerId: power.id })}>
                        📍 Move on the board
                      </Button>
                    )
                  )}
                </div>
              )}
              {moving && trance && (
                <p className="text-zinc-200">
                  The {foes(state).find((m) => m.id === trance.id)?.name ?? 'monster'} moved. {trance.nextTo.length > 0 ? 'It attacks a monster it ended up next to.' : ''}
                </p>
              )}
              {moving && !trance && !(state.board && state.turn.boardMove?.source === power.name) && (
                <>
                  <p className="text-zinc-200">
                    Which monster within 1 tile did {hero.name} hypnotize? Move it 1 tile. It doesn't get hurt.
                  </p>
                  <MonsterChoice
                    state={state}
                    monsters={foes(state)}
                    chosen={answers.movedId ? [answers.movedId] : []}
                    onToggle={(id) => {
                      setAnswers({ movedId: id })
                      setChosen([])
                    }}
                  />
                </>
              )}
              {moving && !asked.movedId ? null : moving && targets.length === 0 ? (
                <p className="text-zinc-400">There's no other monster for it to attack, so nothing happens.</p>
              ) : (
              <>
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-zinc-300">{moving ? 'Which monster is it next to now? That one gets attacked.' : pickHint}</p>
                {chosen.length > 0 && limit > 1 && (
                  <Button variant="ghost" className="text-sm" onClick={() => setChosen([])}>
                    Clear
                  </Button>
                )}
              </div>
              {range && !moving && reachable.length < everyTarget.length && (
                <p className="text-sm text-zinc-400">
                  {showAll ? 'Showing every monster.' : `Only monsters ${RANGE_WORDS[range]} ${hero.name} on the board.`}{' '}
                  <button type="button" className="underline" onClick={() => setShowAll(!showAll)}>
                    {showAll ? 'Only the ones in reach' : 'Show all'}
                  </button>
                </p>
              )}
              {targets.length === 0 ? (
                <p className="text-amber-300">No monster is {RANGE_WORDS[range]} {hero.name}. Move closer first, or pick another power.</p>
              ) : (
                <MonsterChoice state={state} monsters={targets} chosen={chosen} onToggle={tap} />
              )}
              </>
              )}
              <BeforeQuestion hero={hero} effects={effects} answers={answers} setAnswers={setAnswers} />
              {chosen.length > 0 && (
                <DistanceQuestion
                  state={state}
                  hero={hero}
                  chosen={chosen}
                  distances={allDistances}
                  setDistances={setDistances}
                  fromBoard={fromBoard}
                  stayed={stayed}
                  setStayed={setStayed}
                  stayedFromBoard={stayedTap === null && boardStayed !== null}
                />
              )}
              {item?.card.note && <p className="rounded-lg bg-amber-950/60 p-3 text-amber-200">{item.card.note}</p>}
              {!needsAnswer &&
                chosen
                  .filter((id, i) => chosen.indexOf(id) === i)
                  .map((id) => foes(state).find((m) => m.id === id))
                  .filter((m) => m?.ac)
                  .map((monster) => (
                    <AttackMath
                      key={monster.id}
                      monster={monster}
                      name={monsterName(state, monster)}
                      numbers={attackNumbers(hero, {
                        item,
                        power: item ? null : power,
                        extraAttack: extra,
                        adjacentCount: answers.adjacentCount,
                        startedAdjacent: answers.startedAdjacent,
                        distance: allDistances[monster.id],
                        stayed,
                      })}
                    />
                  ))}
              {unknownAc && (
                <p className="text-amber-300">
                  The app doesn't know the {monsterName(state, unknownAc)}'s AC. Roll the die yourself and use its card.
                </p>
              )}
              <Button
                variant="gold"
                className="w-full py-4 text-xl"
                disabled={chosen.length === 0 || (effects.attacks && chosen.length < limit) || Boolean(unknownAc) || needsAnswer}
                onClick={roll}
              >
                🎲 Roll {power.name} ({power.card.attack}){chosen.length > 1 ? ` × ${chosen.length}` : ''}
              </Button>
            </>
          )}
          {extra && (
            <Button variant="ghost" className="w-full" onClick={() => dispatch({ type: 'SKIP_BONUS_ATTACK', heroId: hero.id })}>
              {hero.name} skips this attack
            </Button>
          )}
        </>
      )}
    </div>
  )
}
