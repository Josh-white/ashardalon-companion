import { useState } from 'react'
import { HERO_COLORS, XP_TO_CANCEL_ENCOUNTER } from '../data/heroes.js'
import { heroItems, itemTrapBonus, tileAcBonus } from '../data/items.js'
import { heroAc, reactionsFor } from '../data/powerEffects.js'
import { ENCOUNTER_LABELS, canSpendAttack, encounterCount, isWrathCheck, phaseChecks, villainInPlay } from '../state/game.js'
import { rollD20, shuffleNumbers } from '../state/random.js'
import { useCards } from '../state/useCards.js'
import { boardAnswer } from '../board/checks.js'
import { encounterTargetIds, foeOnHeroTile } from '../board/encounters.js'
import { wrathPull } from '../board/monsters.js'
import { markerOnHeroTile, trapsToDisable } from '../board/markers.js'
import { DrawMonsterButton, HeroPicker } from './MonsterTurns.jsx'
import { TileGuardQuestion } from './Treasure.jsx'
import { DrawTileButton } from './Tiles.jsx'
import { Button } from './ui.jsx'

// Encounter cards that put the bottom dungeon tile into play.
const BOTTOM_TILE_CARDS = new Set(['occupied-lair', 'scream-of-the-sentry', 'spotted'])

// Thief in the Dark: the active hero picks one of their treasure cards to lose.
function ThiefStep({ hero, dispatch }) {
  const [stolen, setStolen] = useState(null)
  const items = heroItems(hero)
  if (stolen) return <p className="text-emerald-300">✓ The thief took {hero.name}'s {stolen}.</p>
  if (items.length === 0) {
    return <p className="text-zinc-200">{hero.name} has no treasure cards. Discard a Treasure token if you have one; if not, the thief gets nothing.</p>
  }
  return (
    <div className="space-y-2">
      <p className="text-zinc-200">Which treasure card does {hero.name} lose?</p>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <Button
            key={item.id}
            variant="danger"
            onClick={() => {
              dispatch({ type: 'DISCARD_ITEM', heroId: hero.id, itemId: item.id })
              setStolen(item.name)
            }}
          >
            💰 {item.name}
          </Button>
        ))}
      </div>
    </div>
  )
}

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
  if (targets === 'villainWithin1') return 'Tap every hero within 1 tile of the villain.'
  return null
}

// What the board worked out, said in plain words.
function boardFound(targets, hero) {
  if (targets === 'activeTile') return `on ${hero.name}'s tile`
  if (targets === 'within1') return `within 1 tile of ${hero.name}`
  if (targets === 'trapTile') return 'on the trap’s tile'
  if (targets === 'villainWithin1') return 'within 1 tile of the villain'
  return ''
}

const names = (heroes) => {
  const list = heroes.map((h) => h.name)
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] ?? ''
}

// The heroes a card hits, highlighted in their own colours.
export function AffectedHeroes({ heroes, label }) {
  if (heroes.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-bold uppercase tracking-widest text-zinc-400">{label}</span>
      {heroes.map((h) => (
        <span key={h.id} className={`rounded-full border-2 border-amber-400 px-3 py-1 text-lg font-bold ${HERO_COLORS[h.color].bg} ${HERO_COLORS[h.color].text}`}>
          {h.name}
        </span>
      ))}
    </div>
  )
}

const describe = (attack) =>
  [attack.damage > 0 && `${attack.damage} damage`, ...attack.conditions].filter(Boolean).join(' and ') || 'no damage'

// Rolls an attack from an encounter card or a trap. `dispatchAttack` sends the targets.
// On the virtual board the heroes it reaches are picked (and highlighted) from where they
// stand; the players can still change the picks. `trap` is the marker for a trap's attack.
function AttackStep({ state, hero, name, attack, onAttack, onNobody, dispatch, trap }) {
  const question = targetQuestion(attack.targets, hero)
  const fixed = attack.targets === 'active' ? [hero.id] : attack.targets === 'all' ? state.heroes.map((h) => h.id) : null
  const [fromBoard] = useState(() => (question ? encounterTargetIds(state, attack.targets, hero, { trap }) : null))
  const [chosen, setChosen] = useState(fromBoard ?? (attack.targets === 'trapTile' || attack.targets === 'villainWithin1' ? [] : [hero.id]))
  const [guarded, setGuarded] = useState([])
  const [results, setResults] = useState(null)
  const targets = fixed ?? chosen
  const toggle = (id) => setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const roll = () => {
    const rolled = targets.map((heroId) => ({ heroId, roll: rollD20() }))
    onAttack(rolled, guarded)
    setResults(
      rolled.map(({ heroId, roll: value }) => {
        const target = state.heroes.find((h) => h.id === heroId)
        const total = value + attack.bonus
        const ac = heroAc(target) + (guarded.includes(heroId) ? tileAcBonus(state.heroes, target) : 0)
        return { hero: target, value, total, ac, hit: total >= ac }
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
          // Practiced Evasion turns this hit into a miss.
          const evaded = state.turn.lastEventAttack?.results.some((r) => r.heroId === target.id && r.evaded)
          const now = state.heroes.find((h) => h.id === target.id) ?? target
          const evasion = hit && !evaded && reactionsFor([now], 'evade')[0]
          const missEffect = [attack.miss > 0 && `${attack.miss} damage`, ...(attack.missConditions ?? [])].filter(Boolean).join(' and ') || 'nothing'
          return (
            <li key={target.id} className={`rounded-xl p-3 text-lg ${hit && !evaded ? 'bg-red-950' : 'bg-zinc-900'}`}>
              {name} rolled {value} + {attack.bonus} = {total} against{' '}
              <span className={`font-bold ${HERO_COLORS[target.color].text}`}>{target.name}</span>'s AC {ac}.{' '}
              <b className={hit && !evaded ? 'text-red-300' : 'text-emerald-300'}>
                {evaded ? 'Practiced Evasion: a miss!' : hit ? 'Hit!' : 'Miss!'}
              </b>{' '}
              {target.name} takes {evaded ? missEffect : effect}.
              {evasion && dispatch && (
                <Button
                  className="mt-2 w-full"
                  onClick={() =>
                    dispatch({ type: 'EVADE_HIT', heroId: target.id, powerId: evasion.power.id, disableRoll: rollD20() })
                  }
                >
                  🤸 {target.name} uses Practiced Evasion: the attack misses
                </Button>
              )}
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
      {question && fromBoard && (
        <>
          <p className="rounded-lg bg-emerald-950/60 p-3 text-lg text-emerald-200">
            📍 The board says{' '}
            {fromBoard.length > 0
              ? `${names(state.heroes.filter((h) => fromBoard.includes(h.id)))} ${fromBoard.length > 1 ? 'are' : 'is'} ${boardFound(attack.targets, hero)}.`
              : `nobody is ${boardFound(attack.targets, hero)}.`}{' '}
            Tap a hero to change it.
          </p>
          <HeroPicker heroes={state.heroes} chosen={chosen} onToggle={toggle} />
        </>
      )}
      {question && !fromBoard && (
        <>
          <p className="text-xl font-semibold text-zinc-100">{question}</p>
          <HeroPicker heroes={state.heroes} chosen={chosen} onToggle={toggle} />
        </>
      )}
      {fixed && <AffectedHeroes heroes={state.heroes.filter((h) => fixed.includes(h.id))} label="It attacks" />}
      <TileGuardQuestion
        state={state}
        targets={targets}
        guarded={guarded}
        onToggle={(id) => setGuarded((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))}
      />
      {targets.length === 0 && onNobody ? (
        <Button className="w-full py-4 text-xl font-bold" onClick={onNobody}>
          Nobody is there
        </Button>
      ) : (
        <Button variant="danger" className="w-full py-4 text-xl font-bold" disabled={targets.length === 0} onClick={roll}>
          🎲 Roll the attack
        </Button>
      )}
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
  const { monsters: monsterCards, villains } = useCards()
  const { card, attacked } = state.encounter
  // A trap or hazard: the board knows whether the hero's tile already has a marker (null when it can't tell).
  const boardMarker = (card.type === 'hazard' || card.type === 'trap') && !attacked ? markerOnHeroTile(state, hero) : null
  const [markerChecked, setMarkerChecked] = useState(() => boardMarker === false)
  // Frenzied Leap: null until the table says whether a monster is on the active hero's tile.
  // On the virtual board the board answers it.
  const [monsterOnTile, setMonsterOnTile] = useState(() => (card.damageIfMonsterOnTile > 0 ? foeOnHeroTile(state, hero) : null))
  const [tileFromBoard, setTileFromBoard] = useState(() => card.damageIfMonsterOnTile > 0 && foeOnHeroTile(state, hero) !== null)
  const asksTile = card.damageIfMonsterOnTile > 0 && monsterOnTile === null
  const resolve = (extra = {}) =>
    dispatch({ type: 'RESOLVE_ENCOUNTER', monsterCards, villains, random: shuffleNumbers(), monsterOnTile: monsterOnTile === true, ...extra })
  const placesMarker = card.type === 'hazard' || card.type === 'trap'
  // Ashardalon Breathes! does nothing (and is discarded) when Ashardalon isn't in play.
  const villainHere = villainInPlay(state, card)
  const needsAttack = card.attack && !attacked && villainHere

  const autoNotes = [
    card.damageEach > 0 && `Every hero takes ${card.damageEach} damage when you tap the button.`,
    card.damagePoisoned > 0 && `Every Poisoned hero takes ${card.damagePoisoned} damage when you tap the button.`,
    card.filterMonsters && !state.encounter.filtered && `The app looks at the top 5 monster cards, keeps the ${card.filterMonsters}s on top and discards the rest.`,
    card.drawAnother && villainHere && 'Then you draw another encounter card.',
    !villainHere && (card.villain ? 'Its villain isn’t in play, so it’s just discarded.' : `The ${card.objective} isn’t in play, so it’s just discarded.`),
    villainHere && card.placeVillain && 'The app puts the villain on the board when you tap the button.',
    villainHere && card.drawMonsterType && `The app draws monster cards until ${/^[AEIOU]/.test(card.drawMonsterType) ? 'an' : 'a'} ${card.drawMonsterType} turns up, and discards the rest.`,
    villainHere && card.timeToken && `The app takes a Time token off the ${card.objective || 'Vast Gate'} (${state.adventure?.timeTokens ?? 0} left now).`,
    villainHere && card.returnToTop > 0 && 'Then the app shuffles it back into the top 3 encounter cards.',
    villainHere && card.afterDrawTop && 'It goes back on top of the encounter deck after the next card is drawn.',
  ].filter(Boolean)

  return (
    <div className={`mt-4 space-y-4 rounded-2xl border-2 p-4 ${TYPE_STYLES[card.type]}`}>
      <div>
        <p className="text-sm font-bold uppercase tracking-widest">{ENCOUNTER_LABELS[card.type]}</p>
        <h3 className="font-display text-3xl font-bold text-zinc-100">{card.name}</h3>
        {card.flavor && <p className="mt-1 italic text-zinc-400">{card.flavor}</p>}
      </div>
      <p className="whitespace-pre-line text-lg text-zinc-100">{card.text}</p>

      {card.noCancel && <p className="font-semibold text-amber-300">This card can’t be canceled.</p>}
      {!attacked && !card.noCancel && (
        <Button
          className="w-full"
          disabled={state.xp < XP_TO_CANCEL_ENCOUNTER}
          onClick={() => dispatch({ type: 'CANCEL_ENCOUNTER' })}
        >
          Spend {XP_TO_CANCEL_ENCOUNTER} XP to cancel it (party has {state.xp})
        </Button>
      )}
      {!attacked && !card.noCancel && <Perseverance state={state} dispatch={dispatch} />}

      {placesMarker && !markerChecked && !attacked ? (
        <div>
          <p className="text-xl font-semibold text-zinc-100">Does {hero.name}'s tile already have a trap or hazard marker?</p>
          {boardMarker && (
            <p className="mt-2 rounded-lg bg-emerald-950/60 p-3 text-lg text-emerald-200">
              📍 The board says yes: the {boardMarker.name} marker is on {hero.name}'s tile, so {card.name} is discarded and you draw a new card.
            </p>
          )}
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
          {placesMarker && markerChecked && !attacked && boardMarker === false && (
            <p className="rounded-lg bg-emerald-950/60 p-3 text-lg text-emerald-200">📍 The board says {hero.name}'s tile has no marker yet, so the {card.name} marker goes there.</p>
          )}
          {placesMarker && markerChecked && !attacked && (
            <Button variant="ghost" className="w-full" onClick={() => setMarkerChecked(false)}>
              ↶ {boardMarker === false ? 'The board got it wrong: ' : 'Oops, '}{hero.name}'s tile does have a marker
            </Button>
          )}
          {card.attack && villainHere && (
            <AttackStep
              state={state}
              hero={hero}
              name={card.name}
              attack={card.attack}
              onAttack={(targets, tileGuarded) => dispatch({ type: 'ENCOUNTER_ATTACK', targets, tileGuarded })}
              dispatch={dispatch}
            />
          )}
          {!needsAttack && asksTile && (
            <div>
              <p className="text-xl font-semibold text-zinc-100">Is a monster on {hero.name}'s tile?</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Button variant="danger" className="py-3 text-xl" onClick={() => resolve({ monsterOnTile: true })}>
                  Yes: {card.damageIfMonsterOnTile} damage
                </Button>
                <Button className="py-3 text-xl" onClick={() => setMonsterOnTile(false)}>
                  No
                </Button>
              </div>
            </div>
          )}
          {!needsAttack && !asksTile && (
            <>
              {tileFromBoard && monsterOnTile !== null && (
                <>
                  <p className="rounded-lg bg-emerald-950/60 p-3 text-lg text-emerald-200">
                    📍 The board says {monsterOnTile ? `a monster is on ${hero.name}'s tile: ${hero.name} takes ${card.damageIfMonsterOnTile} damage when you tap the button.` : `no monster is on ${hero.name}'s tile.`}
                  </p>
                  {monsterOnTile && <AffectedHeroes heroes={[hero]} label="Takes damage" />}
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => {
                      setTileFromBoard(false)
                      setMonsterOnTile(null)
                    }}
                  >
                    ↶ The board got it wrong: ask me instead
                  </Button>
                </>
              )}
              {!tileFromBoard && monsterOnTile === false && (
                <Button variant="ghost" className="w-full" onClick={() => setMonsterOnTile(null)}>
                  ↶ Oops, a monster is on {hero.name}'s tile
                </Button>
              )}
              {card.damageEach > 0 && villainHere && <AffectedHeroes heroes={state.heroes} label="Takes damage" />}
              {card.damagePoisoned > 0 && villainHere && (
                <AffectedHeroes heroes={state.heroes.filter((h) => h.conditions.includes('Poisoned'))} label="Poisoned now" />
              )}
              {card.id === 'thief-in-the-dark' && <ThiefStep hero={hero} dispatch={dispatch} />}
              {BOTTOM_TILE_CARDS.has(card.id) && (
                <DrawTileButton state={state} dispatch={dispatch} drawKey={`encounter-${state.encounter.id}`} from="bottom" />
              )}
              {card.drawMonster && card.filterMonsters && !state.encounter.filtered ? (
                <Button
                  variant="danger"
                  className="w-full py-3 text-lg font-bold"
                  onClick={() =>
                    dispatch({ type: 'FILTER_ENCOUNTER_MONSTERS', monsterCards, random: shuffleNumbers() })
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
                onClick={() => resolve()}
              >
                {!villainHere ? 'Discard it' : card.returnToTop > 0 ? 'Done, shuffle it back in' : card.afterDrawTop ? 'Done' : RESOLVE_LABELS[card.type](hero)}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  )
}

// How many encounter cards this Villain Phase still has to draw.
export const encountersLeft = (state, hero) => encounterCount(state, hero)

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
  // Why there's more than the usual card, so a second draw isn't a surprise.
  const reasons = [
    ...(hero.curses ?? []).filter((c) => c.card?.extraEncounter > 0).map((c) => `${c.name}: ${hero.name} draws an extra card every Villain Phase.`),
    state.adventure?.extraEncounters > 0 && 'The adventure adds an extra card every Villain Phase.',
    ...(state.turn.owedBecause ?? []),
  ].filter(Boolean)
  return (
    <>
      {reasons.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-xl bg-zinc-950/50 p-3 text-lg text-amber-200">
          {reasons.map((why) => (
            <li key={why}>{why}</li>
          ))}
        </ul>
      )}
      <Button
        variant="danger"
        className="mt-4 w-full px-5 py-4 text-xl font-bold"
        onClick={() => dispatch({ type: 'DRAW_ENCOUNTER', heroId: hero.id, cards: encounters, random: shuffleNumbers() })}
      >
        🃏 Draw {drawn > 0 ? 'another' : 'an'} encounter card
        {left > 1 && <span className="ml-2 text-base font-normal opacity-80">({left} to draw)</span>}
      </Button>
    </>
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
          trap={trap}
          onAttack={(targets, tileGuarded) => {
            dispatch({ type: 'TRAP_ATTACK', trapId: trap.id, targets, tileGuarded })
            setHit(true)
          }}
          onNobody={() => setHit(true)}
          dispatch={dispatch}
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
  const [activeId, setActiveId] = useState(null)
  const done = state.turn.acted ?? []
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
              dispatch({ type: 'MARK_ACTED', id: active.id, name: active.name })
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

// Hero Phase: instead of attacking, a hero on a trap's tile can try to disable it. On the
// virtual board, traps on other tiles aren't offered, with "Disable anyway" if the board's wrong.
export function DisableTraps({ state, hero, dispatch }) {
  // "Disable anyway" lasts for this hero's turn only.
  const turnKey = `${hero.id}-${state.turn.round}`
  const [anywayTurn, setAnywayTurn] = useState(null)
  const anyway = anywayTurn === turnKey
  const { here, away } = trapsToDisable(state, hero)
  if (here.length + away.length === 0) return null
  const traps = anyway ? [...here, ...away] : here
  const penalty = state.environment?.card?.trapPenalty ?? 0
  const tools = itemTrapBonus(hero)
  if (traps.length === 0) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-950/50 p-3 text-zinc-400">
        <p className="flex-1">📍 No trap on {hero.name}'s tile, so nothing to disable.</p>
        <Button variant="ghost" className="!py-1 text-sm" onClick={() => setAnywayTurn(turnKey)}>
          Disable anyway
        </Button>
      </div>
    )
  }
  const blocked = attackBlocked(state, hero, 'disabling a trap')
  if (blocked) return <p className="mt-4 rounded-xl bg-zinc-950/50 p-3 text-zinc-400">{blocked}</p>
  return (
    <div className="mt-4 rounded-xl bg-zinc-950/50 p-3">
      <p className="text-lg text-zinc-100">
        On a trap's tile? Instead of attacking, try to disable it.
        {penalty > 0 && <span className="text-red-300"> {state.environment.name}: −{penalty} to the roll.</span>}
        {tools > 0 && <span className="text-amber-300"> 💰 Your tools: +{tools} to the roll.</span>}
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
// What stops a hero from trying to open the Cage right now, or null when they can.
function attackBlocked(state, hero, what) {
  if (canSpendAttack(state, hero)) return null
  const spent = state.turn.attackSpent
  return spent?.heroId === hero.id ? `${hero.name} used this turn's attack on ${spent.on}.` : `${hero.name} attacked this turn, so ${what} has to wait.`
}

function CurseRollButton({ state, hero, cursed, curse, dispatch }) {
  const roll = curse.card.removeRoll
  const blocked = attackBlocked(state, hero, 'the cage')
  if (blocked) return <p className="mt-2 text-sm text-purple-300">{blocked}</p>
  const helping = cursed.id !== hero.id
  return (
    <>
      <Button className="mt-2" onClick={() => dispatch({ type: 'CURSE_ROLL', heroId: cursed.id, curseId: curse.id, roll: rollD20() })}>
        🎲 {helping ? `Help ${cursed.name}: ${(roll.label || 'roll to end it').toLowerCase()}` : roll.label || 'Roll to end it'} ({roll.target}+)
      </Button>
      <p className="mt-1 text-sm text-purple-300">
        {helping ? `${hero.name} has to be on ${cursed.name}'s tile. ` : ''}This takes the place of {hero.name}'s attack this turn.
      </p>
    </>
  )
}

export function CurseNotes({ state, hero, dispatch }) {
  const curses = hero.curses ?? []
  // Other heroes' curses that this hero can roll to end from the same tile (the Cage).
  const helpable = state.heroes.flatMap((h) =>
    h.id === hero.id ? [] : (h.curses ?? []).filter((c) => c.card?.removeRoll?.phase === 'action').map((curse) => ({ cursed: h, curse })),
  )
  if (curses.length === 0 && helpable.length === 0) return null
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
            {roll?.phase === 'action' && <CurseRollButton state={state} hero={hero} cursed={hero} curse={curse} dispatch={dispatch} />}
          </div>
        )
      })}
      {helpable.map(({ cursed, curse }) => (
        <div key={curse.id} className="rounded-xl bg-purple-950/50 p-3 text-purple-100">
          <p className="font-bold">🕯️ {cursed.name} is stuck in the {curse.name}</p>
          <CurseRollButton state={state} hero={hero} cursed={cursed} curse={curse} dispatch={dispatch} />
        </div>
      ))}
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
      <span className="font-bold">🌋 Environment: {environment.name}{/[.!?]$/.test(environment.name) ? '' : '.'}</span> <span className="text-emerald-200">{rule}</span>
    </div>
  )
}

const effectWords = (effect) =>
  !effect
    ? 'nothing happens'
    : [effect.damage && `${effect.damage} damage`, effect.condition, effect.remove && 'the curse ends', effect.drawMonster && 'draw a monster'].filter(Boolean).join(' and ')

// What the board's answer does, told before the player taps OK.
const boardEffect = (effect, name) =>
  !effect
    ? 'Nothing happens.'
    : `${[effect.damage && `${name} takes ${effect.damage} damage`, effect.condition && `${name} is ${effect.condition}`, effect.remove && 'the curse ends', effect.drawMonster && `${name} draws a monster`]
        .filter(Boolean)
        .join(' and ')
        .replace(/^./, (c) => c.toUpperCase())} when you tap OK.`

// The questions a phase ends with, one at a time, from curses, the environment and
// hazards ("Did you end next to a wall?"). The turn can't move on until they're answered.
export function PhaseChecks({ state, hero, phaseKey, dispatch }) {
  const { monsters: cards } = useCards()
  // The check the player chose to answer by hand instead of taking the board's answer.
  const [manualKey, setManualKey] = useState(null)
  const [check] = phaseChecks(state, phaseKey)
  if (!check) return null
  const fill = (text) => text.replaceAll('{hero}', hero.name)
  const answer = (yes) => dispatch({ type: 'ANSWER_CHECK', key: check.key, answer: yes, cards, random: shuffleNumbers() })
  const board = check.ask && manualKey !== check.key ? boardAnswer(state, fill(check.ask)) : null
  const wrath = isWrathCheck(state, check) ? wrathPull(state, hero.id) : null
  return (
    <div className="mt-4 rounded-2xl border-2 border-purple-700 bg-purple-950/60 p-4">
      <p className="text-sm font-bold uppercase tracking-widest text-purple-300">
        {phaseKey === 'hero' ? 'When you’re done with your Hero Phase' : 'When you’re done exploring'} · {check.source}
      </p>
      {board ? (
        <>
          <p className="mt-1 text-2xl font-semibold text-zinc-100">{fill(check.ask)}</p>
          <p className="mt-2 rounded-lg bg-emerald-950/60 p-3 text-lg text-emerald-200">
            📍 The board says {board.answer ? 'yes' : 'no'}: {board.why} {boardEffect(board.answer ? check.yes : check.no, hero.name)}
          </p>
          <Button variant="gold" className="mt-3 w-full py-3 text-lg" onClick={() => answer(board.answer)}>
            OK
          </Button>
          <Button variant="ghost" className="mt-2 w-full" onClick={() => setManualKey(check.key)}>
            The board's wrong, let me answer
          </Button>
        </>
      ) : check.ask ? (
        <>
          <p className="mt-1 text-2xl font-semibold text-zinc-100">{fill(check.ask)}</p>
          <p className="mt-1 text-purple-200">
            Yes: {effectWords(check.yes)}. No: {effectWords(check.no)}.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button variant="gold" className="py-4 text-2xl" onClick={() => answer(true)}>
              Yes
            </Button>
            <Button className="py-4 text-2xl" onClick={() => answer(false)}>
              No
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-1 text-xl text-zinc-100">{fill(check.note)}</p>
          {wrath && (
            <p className="mt-2 rounded-lg bg-emerald-950/60 p-3 text-lg text-emerald-200">
              📍 The board puts the {wrath.name} next to {hero.name} when you tap Done.
            </p>
          )}
          <Button variant="gold" className="mt-3 w-full py-3 text-lg" onClick={() => dispatch({ type: 'ANSWER_CHECK', key: check.key, answer: true })}>
            Done
          </Button>
        </>
      )}
    </div>
  )
}
