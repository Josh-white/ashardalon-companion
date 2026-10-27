import { useState } from 'react'
import { HERO_COLORS, XP_TO_CANCEL_ENCOUNTER } from '../data/heroes.js'
import { heroAc, reactionsFor } from '../data/powerEffects.js'
import { ENCOUNTER_LABELS } from '../state/game.js'
import { randomNumbers, rollD20 } from '../state/random.js'
import { useCards } from '../state/useCards.js'
import { DrawMonsterButton, HeroPicker } from './MonsterTurns.jsx'
import { Button } from './ui.jsx'

// Enough random numbers to shuffle the whole encounter deck.
const SHUFFLE_NUMBERS = 128

const TYPE_STYLES = {
  event: 'border-sky-700 bg-sky-950/60 text-sky-300',
  curse: 'border-purple-700 bg-purple-950/60 text-purple-300',
  environment: 'border-emerald-700 bg-emerald-950/60 text-emerald-300',
  hazard: 'border-orange-700 bg-orange-950/60 text-orange-300',
  trap: 'border-red-700 bg-red-950/60 text-red-300',
}

// Who an attack goes after, asked as a question when the app can't tell.
function targetQuestion(targets, hero) {
  if (targets === 'activeTile') return `Tap every hero on ${hero.name}'s tile.`
  if (targets === 'within1') return `Tap every hero within 1 tile of ${hero.name} (${hero.name} too).`
  if (targets === 'trapTile') return 'Tap every hero on the trap’s tile.'
  return null
}

const describe = (attack) =>
  [attack.damage > 0 && `${attack.damage} damage`, ...attack.conditions].filter(Boolean).join(' and ') || 'no damage'

// Rolls an attack from an encounter card or a trap. `dispatchAttack` sends the targets.
function AttackStep({ state, hero, name, attack, onAttack }) {
  const question = targetQuestion(attack.targets, hero)
  const fixed = attack.targets === 'active' ? [hero.id] : attack.targets === 'all' ? state.heroes.map((h) => h.id) : null
  const [chosen, setChosen] = useState(attack.targets === 'trapTile' ? [] : [hero.id])
  const [results, setResults] = useState(null)
  const targets = fixed ?? chosen
  const toggle = (id) => setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const roll = () => {
    const rolled = targets.map((heroId) => ({ heroId, roll: rollD20() }))
    onAttack(rolled)
    setResults(
      rolled.map(({ heroId, roll: value }) => {
        const target = state.heroes.find((h) => h.id === heroId)
        const total = value + attack.bonus
        return { hero: target, value, total, ac: heroAc(target), hit: total >= heroAc(target) }
      }),
    )
  }

  if (results) {
    return (
      <ul className="space-y-2">
        {results.map(({ hero: target, value, total, ac, hit }) => {
          const damage = hit ? attack.damage : attack.miss
          const conditions = hit ? attack.conditions : attack.missConditions
          const effect = [damage > 0 && `${damage} damage`, ...conditions].filter(Boolean).join(' and ') || 'nothing'
          return (
            <li key={target.id} className={`rounded-xl p-3 text-lg ${hit ? 'bg-red-950' : 'bg-zinc-900'}`}>
              {name} rolled {value} + {attack.bonus} = {total} against{' '}
              <span className={`font-bold ${HERO_COLORS[target.color].text}`}>{target.name}</span>'s AC {ac}.{' '}
              <b className={hit ? 'text-red-300' : 'text-emerald-300'}>{hit ? 'Hit!' : 'Miss!'}</b> {target.name} takes {effect}.
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-lg text-zinc-200">
        It attacks with +{attack.bonus}: a hit is {describe(attack)}
        {attack.miss > 0 && `, a miss is still ${attack.miss} damage`}.
      </p>
      {question && (
        <>
          <p className="text-xl font-semibold text-zinc-100">{question}</p>
          <HeroPicker heroes={state.heroes} chosen={chosen} onToggle={toggle} />
        </>
      )}
      {attack.targets === 'all' && <p className="text-zinc-300">It attacks every hero.</p>}
      <Button variant="danger" className="w-full py-4 text-xl font-bold" disabled={targets.length === 0} onClick={roll}>
        🎲 Roll the attack
      </Button>
    </div>
  )
}

// Revel in Destruction: a damaged monster heals.
function HealMonster({ state, amount, dispatch }) {
  const [healed, setHealed] = useState(null)
  const damaged = state.monsters.filter((m) => m.hp < m.maxHp)
  if (healed) return <p className="text-zinc-300">✓ The {healed} healed {amount}.</p>
  if (damaged.length === 0) return <p className="text-zinc-400">No monster is damaged, so nothing happens.</p>
  return (
    <div className="space-y-2">
      <p className="text-lg text-zinc-100">Which damaged monster heals {amount}?</p>
      <div className="grid grid-cols-2 gap-2">
        {damaged.map((m) => (
          <Button
            key={m.id}
            onClick={() => {
              dispatch({ type: 'ADJUST_MONSTER_HP', monsterId: m.id, amount })
              setHealed(m.name)
            }}
          >
            {m.name} ({m.hp}/{m.maxHp})
          </Button>
        ))}
      </div>
    </div>
  )
}

// Ancient Spirit's Blessing: flip up a used daily power belonging to any hero.
function RefreshDaily({ state, dispatch }) {
  const [done, setDone] = useState(null)
  const used = state.heroes.flatMap((h) => h.powers.filter((p) => p.type === 'daily' && p.used).map((p) => ({ hero: h, power: p })))
  if (done) return <p className="text-zinc-300">✓ {done} is ready again.</p>
  if (used.length === 0) return <p className="text-zinc-400">Nobody has a used daily power, so nothing to flip.</p>
  return (
    <div className="space-y-2">
      <p className="text-lg text-zinc-100">Which used daily power flips back up?</p>
      {used.map(({ hero, power }) => (
        <Button
          key={power.id}
          className="w-full text-left"
          onClick={() => {
            dispatch({ type: 'TOGGLE_POWER', heroId: hero.id, powerId: power.id })
            setDone(`${hero.name}'s ${power.name}`)
          }}
        >
          <span className={HERO_COLORS[hero.color].text}>{hero.name}</span>: {power.name}
        </Button>
      ))}
    </div>
  )
}

// Warp in Time and High Alert: monster cards change hands.
export function PassMonsters({ state, dispatch, only }) {
  const monsters = only ? state.monsters.filter((m) => m.ownerId === only) : state.monsters
  if (monsters.length === 0) return <p className="text-zinc-400">No monster cards to pass.</p>
  return (
    <div className="space-y-2">
      <p className="text-lg text-zinc-100">Pass the monster cards on the table, then set who has each one now:</p>
      {monsters.map((m) => (
        <label key={m.id} className="flex items-center justify-between gap-2 rounded-xl bg-zinc-900 p-2">
          <span className="font-semibold text-red-300">{m.name}</span>
          <select
            className="rounded-lg bg-zinc-800 p-2 text-zinc-100"
            value={m.ownerId ?? ''}
            onChange={(e) => dispatch({ type: 'SET_MONSTER_OWNER', monsterId: m.id, ownerId: e.target.value })}
          >
            {state.heroes.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  )
}

// Perseverance: cancelling costs 1 XP less for each hero on the cleric's tile.
export function Perseverance({ state, dispatch }) {
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

const RESOLVE_LABELS = {
  curse: (hero) => `Put the curse on ${hero.name}`,
  environment: () => 'Put it in play',
  trap: () => 'Put the trap marker on the tile',
  hazard: () => 'Put the hazard marker on the tile',
  event: () => 'Done, discard it',
}

// The encounter card being read out, and what the app can do for it.
function EncounterCard({ state, hero, dispatch }) {
  const { monsters: monsterCards } = useCards()
  const { card, attacked } = state.encounter
  const [markerChecked, setMarkerChecked] = useState(false)
  const placesMarker = card.type === 'hazard' || card.type === 'trap'
  const needsAttack = card.attack && !attacked

  const autoNotes = [
    card.damageEach > 0 && `Every hero takes ${card.damageEach} damage when you tap the button.`,
    card.damagePoisoned > 0 && `Every Poisoned hero takes ${card.damagePoisoned} damage when you tap the button.`,
    card.filterMonsters && !state.encounter.filtered && `The app looks at the top 5 monster cards, keeps the ${card.filterMonsters}s on top and discards the rest.`,
    card.drawAnother && 'Then you draw another encounter card.',
  ].filter(Boolean)

  return (
    <div className={`mt-4 space-y-4 rounded-2xl border-2 p-4 ${TYPE_STYLES[card.type]}`}>
      <div>
        <p className="text-sm font-bold uppercase tracking-widest">{ENCOUNTER_LABELS[card.type]}</p>
        <h3 className="font-display text-3xl font-bold text-zinc-100">{card.name}</h3>
        {card.flavor && <p className="mt-1 italic text-zinc-400">{card.flavor}</p>}
      </div>
      <p className="whitespace-pre-line text-lg text-zinc-100">{card.text}</p>

      {!attacked && (
        <Button
          className="w-full"
          disabled={state.xp < XP_TO_CANCEL_ENCOUNTER}
          onClick={() => dispatch({ type: 'CANCEL_ENCOUNTER' })}
        >
          Spend {XP_TO_CANCEL_ENCOUNTER} XP to cancel it (party has {state.xp})
        </Button>
      )}
      {!attacked && <Perseverance state={state} dispatch={dispatch} />}

      {placesMarker && !markerChecked && !attacked ? (
        <div>
          <p className="text-xl font-semibold text-zinc-100">Does {hero.name}'s tile already have a trap or hazard marker?</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button className="py-3 text-xl" onClick={() => dispatch({ type: 'REDRAW_ENCOUNTER' })}>
              Yes
            </Button>
            <Button variant="gold" className="py-3 text-xl" onClick={() => setMarkerChecked(true)}>
              No
            </Button>
          </div>
        </div>
      ) : (
        <>
          {card.attack && (
            <AttackStep
              state={state}
              hero={hero}
              name={card.name}
              attack={card.attack}
              onAttack={(targets) => dispatch({ type: 'ENCOUNTER_ATTACK', targets })}
            />
          )}
          {!needsAttack && (
            <>
              {card.drawMonster && card.filterMonsters && !state.encounter.filtered ? (
                <Button
                  variant="danger"
                  className="w-full py-3 text-lg font-bold"
                  onClick={() =>
                    dispatch({ type: 'FILTER_ENCOUNTER_MONSTERS', monsterCards, random: randomNumbers(SHUFFLE_NUMBERS) })
                  }
                >
                  First, stack the monster deck with {card.filterMonsters}s
                </Button>
              ) : card.drawMonster &&
                (state.encounter.monsterDrawn ? (
                  <p className="text-emerald-300">✓ Monster drawn. Put its figure where the card says.</p>
                ) : (
                  <DrawMonsterButton state={state} heroId={hero.id} dispatch={dispatch} className="w-full" />
                ))}
              {card.healMonster > 0 && <HealMonster state={state} amount={card.healMonster} dispatch={dispatch} />}
              {card.refreshDaily && <RefreshDaily state={state} dispatch={dispatch} />}
              {card.passMonsters && <PassMonsters state={state} dispatch={dispatch} />}
              {autoNotes.length > 0 && <p className="text-zinc-300">{autoNotes.join(' ')}</p>}
              <Button
                variant="gold"
                className="w-full py-3 text-lg"
                onClick={() =>
                  dispatch({ type: 'RESOLVE_ENCOUNTER', monsterCards, random: randomNumbers(SHUFFLE_NUMBERS) })
                }
              >
                {RESOLVE_LABELS[card.type](hero)}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  )
}

// How many encounter cards this Villain Phase still has to draw.
export function encountersLeft(state, hero) {
  const { explored, triangle, encountersDrawn = 0, encountersOwed = 0 } = state.turn
  const base = explored !== true || triangle === true ? 1 : 0
  const badLuck = (hero.curses ?? []).reduce((sum, c) => sum + (c.card?.extraEncounter ?? 0), 0)
  return Math.max(0, base + badLuck + encountersOwed - encountersDrawn)
}

// The Villain Phase's encounter step: draw from the virtual deck, read it out, resolve it.
// Without encounter cards in the card file, the table draws from the real deck instead.
export function EncounterStep({ state, hero, dispatch }) {
  const { encounters } = useCards()
  const left = encountersLeft(state, hero)
  const drawn = state.turn.encountersDrawn ?? 0

  if (state.encounter) return <EncounterCard key={state.encounter.id} state={state} hero={hero} dispatch={dispatch} />

  if (!state.encounterDeck && encounters.length === 0) {
    if (left === 0) return null
    return (
      <div className="mt-4 rounded-xl bg-zinc-950/50 p-3 text-lg text-zinc-100">
        <p>Draw an encounter card and do what it says.</p>
        <Button className="mt-2" disabled={state.xp < XP_TO_CANCEL_ENCOUNTER} onClick={() => dispatch({ type: 'CANCEL_ENCOUNTER' })}>
          Spend {XP_TO_CANCEL_ENCOUNTER} XP to cancel the encounter
        </Button>
        <Perseverance state={state} dispatch={dispatch} />
      </div>
    )
  }

  if (left === 0) {
    return drawn > 0 ? <p className="mt-4 rounded-xl bg-emerald-950/60 p-3 text-lg text-emerald-200">✓ Encounters done.</p> : null
  }
  return (
    <Button
      variant="danger"
      className="mt-4 w-full px-5 py-4 text-xl font-bold"
      onClick={() => dispatch({ type: 'DRAW_ENCOUNTER', heroId: hero.id, cards: encounters, random: randomNumbers(SHUFFLE_NUMBERS) })}
    >
      🃏 Draw {drawn > 0 ? 'another' : 'an'} encounter card
      {left > 1 && <span className="ml-2 text-base font-normal opacity-80">({left} to draw)</span>}
    </Button>
  )
}

// Traps take a turn in their owner's Villain Phase, after the monsters.
function TrapActivation({ state, hero, trap, dispatch, onDone }) {
  const { attack, damage } = trap.card.trap ?? {}
  const [chosen, setChosen] = useState([])
  const [hit, setHit] = useState(false)
  const toggle = (id) => setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
  const trigger = trap.card.text.split('\n').find((line) => /^Trigger/i.test(line)) ?? ''

  return (
    <div className="space-y-3 rounded-2xl border-2 border-red-700 bg-zinc-950/80 p-4">
      <h4 className="font-display text-2xl font-bold text-red-300">{trap.name}</h4>
      <p className="text-lg text-zinc-100">{trigger.replace(/^Trigger the trap during your Villain Phase:\s*/i, '')}</p>
      {attack && (
        <AttackStep
          state={state}
          hero={hero}
          name={`The ${trap.name}`}
          attack={attack}
          onAttack={(targets) => {
            dispatch({ type: 'TRAP_ATTACK', trapId: trap.id, targets })
            setHit(true)
          }}
        />
      )}
      {!attack && damage > 0 && !hit && (
        <>
          <p className="text-xl font-semibold text-zinc-100">Tap every hero it reaches. Each takes {damage} damage.</p>
          <HeroPicker heroes={state.heroes} chosen={chosen} onToggle={toggle} />
          <Button
            variant="danger"
            className="w-full py-3 text-lg font-bold"
            onClick={() => {
              if (chosen.length > 0) dispatch({ type: 'TRAP_DAMAGE', trapId: trap.id, heroIds: chosen })
              setHit(true)
            }}
          >
            {chosen.length > 0 ? `Deal ${damage} damage` : 'Nobody is there'}
          </Button>
        </>
      )}
      {(hit || (!attack && !damage)) && (
        <Button variant="gold" className="w-full py-3 text-lg" onClick={onDone}>
          Done with the {trap.name}
        </Button>
      )}
    </div>
  )
}

export function TrapTurns({ state, hero, dispatch }) {
  const [done, setDone] = useState([])
  const [activeId, setActiveId] = useState(null)
  const traps = (state.traps ?? []).filter((t) => t.ownerId === hero.id && t.type === 'trap')
  if (traps.length === 0) return null
  const active = traps.find((t) => t.id === activeId)
  return (
    <div className="mt-5">
      <h3 className="font-display text-xl font-bold text-zinc-200">Trap turns</h3>
      {active ? (
        <div className="mt-2">
          <TrapActivation
            key={active.id}
            state={state}
            hero={hero}
            trap={active}
            dispatch={dispatch}
            onDone={() => {
              setDone((d) => [...d, active.id])
              setActiveId(null)
            }}
          />
        </div>
      ) : (
        <ul className="mt-2 space-y-2">
          {traps.map((trap) => (
            <li key={trap.id} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-950/50 p-3">
              <span className={`text-lg font-semibold ${done.includes(trap.id) ? 'text-zinc-500 line-through' : 'text-red-300'}`}>
                {trap.name}
              </span>
              {done.includes(trap.id) ? (
                <span className="text-zinc-500">✓ Done</span>
              ) : (
                <Button variant="danger" className="font-bold" onClick={() => setActiveId(trap.id)}>
                  Trigger it
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Hero Phase: instead of attacking, a hero on a trap's tile can try to disable it.
export function DisableTraps({ state, hero, dispatch }) {
  const traps = (state.traps ?? []).filter((t) => t.type === 'trap')
  if (traps.length === 0) return null
  const penalty = state.environment?.card?.trapPenalty ?? 0
  return (
    <div className="mt-4 rounded-xl bg-zinc-950/50 p-3">
      <p className="text-lg text-zinc-100">
        On a trap's tile? Instead of attacking, try to disable it.
        {penalty > 0 && <span className="text-red-300"> {state.environment.name}: −{penalty} to the roll.</span>}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {traps.map((trap) => (
          <Button key={trap.id} onClick={() => dispatch({ type: 'DISABLE_TRAP', trapId: trap.id, heroId: hero.id, roll: rollD20() })}>
            🎲 Disable the {trap.name} ({trap.card.trap?.disable ?? 10}+)
          </Button>
        ))}
      </div>
    </div>
  )
}

// Hero Phase: what the hero's curses do, and the Cage's roll to get out.
export function CurseNotes({ hero, dispatch }) {
  const curses = hero.curses ?? []
  if (curses.length === 0) return null
  return (
    <div className="mt-4 space-y-2">
      {curses.map((curse) => {
        const roll = curse.card?.removeRoll
        return (
          <div key={curse.id} className="rounded-xl bg-purple-950/70 p-3 text-purple-100">
            <p className="font-bold">🕯️ {hero.name} is cursed: {curse.name}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-purple-200">
              {curse.text.replace(/^You are cursed! Place this card on your Hero Card as a reminder\.\n?/, '')}
            </p>
            {roll?.phase && roll.phase !== 'action' && (
              <p className="mt-1 text-sm text-purple-300">
                The app rolls for you at the end of your {roll.phase === 'hero' ? 'Hero' : roll.phase === 'exploration' ? 'Exploration' : 'Villain'} Phase: {roll.target}+ ends it.
              </p>
            )}
            {roll?.phase === 'action' && (
              <Button
                className="mt-2"
                onClick={() => dispatch({ type: 'CURSE_ROLL', heroId: hero.id, curseId: curse.id, roll: rollD20() })}
              >
                🎲 {roll.label || 'Roll to end it'} ({roll.target}+)
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// The Environment card in play, shown at the top of every turn.
export function EnvironmentBanner({ environment, className = '' }) {
  if (!environment) return null
  const rule = environment.card.text.replace(
    /^If there is an Environment Card already in play, discard it\. This Environment remains in play until a new Environment Card is drawn\.\n?/,
    '',
  )
  return (
    <div className={`rounded-xl border border-emerald-800 bg-emerald-950/50 p-3 text-emerald-100 ${className}`}>
      <span className="font-bold">🌋 Environment: {environment.name}.</span> <span className="text-emerald-200">{rule}</span>
    </div>
  )
}
