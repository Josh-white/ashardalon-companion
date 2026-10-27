import { useState } from 'react'
import { asksIfStayed, attackItems, distanceChoices, heroItems, itemsWithUse } from '../data/items.js'
import { effectsOf, maxRolls, reactionsFor } from '../data/powerEffects.js'
import { rollD20 } from '../state/random.js'
import { foes, powerNumber } from '../state/game.js'
import { HeroChoice, MonsterChoice, monsterName } from './Pickers.jsx'
import { Button } from './ui.jsx'

// The question a power asks after its attack (Sacred Flame's healing, Cleric's Shield,
// Righteous Smite, Wrathful Thunder). Answered once.
function FollowUp({ state, hero, power, last, dispatch }) {
  const effects = effectsOf(power)
  const [chosen, setChosen] = useState(effects.after === 'heal-tile' ? [hero.id] : [])
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
        <MonsterChoice state={state} chosen={chosen} onToggle={pickOne} />
      ) : (
        <HeroChoice heroes={state.heroes} chosen={chosen} onToggle={kind === 'heal-tile' ? toggle : pickOne} />
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
            {hero.name} {r.rerolled ? 'rolled again:' : 'rolled'} {r.value} + {r.attack?.bonus ?? last.attack.bonus} = {r.total} against the {r.label}'s AC {r.ac}.{' '}
            <b className={r.hit ? 'text-emerald-300' : 'text-zinc-300'}>{r.outcome}</b>
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
      {effects.note && <p className="rounded-lg bg-amber-950/60 p-3 text-amber-200">{effects.note}</p>}
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

const DISTANCE_LABELS = { adjacent: 'Next to me', within1: 'Within 1 tile', far: 'Farther' }

// Magic weapons only help against monsters close enough, so the app asks how far each one is.
function DistanceQuestion({ state, hero, chosen, distances, setDistances, stayed, setStayed }) {
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
              <p className="text-zinc-200">💰 How far is the {monster ? monsterName(state, monster) : 'monster'} from {hero.name}?</p>
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
          {hero.name} didn't move this Hero Phase (Dwarven Hammer hits harder)
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
  const items = extra ? [] : attackItems(hero)
  const [powerId, setPowerId] = useState(null)
  const [chosen, setChosen] = useState([])
  const [answers, setAnswers] = useState({})
  const [distances, setDistances] = useState({})
  const [stayed, setStayed] = useState(false)
  const [rolled, setRolled] = useState(false)
  const item = items.find((i) => i.id === powerId)
  // An item's attack reads like a power's: a name, an attack number and damage.
  const power = powers.find((p) => p.id === powerId) ?? (item && { ...item, type: 'item', card: { attack: `+${item.card.attack.bonus}`, damage: String(item.card.attack.damage), text: item.card.text } })
  const effects = effectsOf(item ? null : power)
  const limit = item ? 1 : power ? maxRolls(power) : 1
  // Hypnotism attacks the monster the moved one ends up next to, never the moved one.
  const moving = effects.ask === 'moved-monster'
  const targets = foes(state).filter((m) => !moving || m.id !== answers.movedId)
  const unknownAc = targets.find((m) => chosen.includes(m.id) && !m.ac)
  const needsAnswer =
    (effects.ask && Object.keys(answers).length === 0) || (distanceChoices(hero) && chosen.some((id) => !distances[id]))
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
    dispatch({ type: 'HERO_ATTACK', heroId: hero.id, ...source, targets, bonusAttack: Boolean(extra), distances, stayed, ...answers })
    setRolled(true)
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
      <h3 className="font-display text-xl font-bold text-amber-300">
        {extra ? `⚔️ ${hero.name}'s extra attack from ${extra.source}${extra.bonus ? ` (+${extra.bonus})` : ''}` : '⚔️ Attack a monster'}
      </h3>

      {showResults ? (
        <>
          <AttackAftermath state={state} last={last} dispatch={dispatch} />
          {hero.conditions.includes('Dazed') ? (
            <p className="text-amber-300">{hero.name} is Dazed, so that was the one action this turn.</p>
          ) : (
            <Button className="w-full" onClick={reset}>
              Attack again
            </Button>
          )}
        </>
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
                    {p.card.attack} · {p.card.damage || '0'} damage{p.type === 'daily' ? ' · daily' : ''}
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
              {effects.before && <p className="rounded-lg bg-amber-950/60 p-3 text-amber-200">{effects.before}</p>}
              {moving && (
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
              {moving && !answers.movedId ? null : moving && targets.length === 0 ? (
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
              <MonsterChoice state={state} monsters={targets} chosen={chosen} onToggle={tap} />
              </>
              )}
              <BeforeQuestion hero={hero} effects={effects} answers={answers} setAnswers={setAnswers} />
              {chosen.length > 0 && (
                <DistanceQuestion
                  state={state}
                  hero={hero}
                  chosen={chosen}
                  distances={distances}
                  setDistances={setDistances}
                  stayed={stayed}
                  setStayed={setStayed}
                />
              )}
              {item?.card.note && <p className="rounded-lg bg-amber-950/60 p-3 text-amber-200">{item.card.note}</p>}
              {power.card.text && (
                <details className="text-sm text-zinc-500">
                  <summary>What {power.name} says</summary>
                  <p className="mt-1 whitespace-pre-line">{power.card.text}</p>
                </details>
              )}
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
        </>
      )}
    </div>
  )
}
