import {
  HERO_TEMPLATES,
  LEVEL_UP_AC_BONUS,
  LEVEL_UP_HP_BONUS,
  LEVEL_UP_SURGE_BONUS,
  STARTING_SURGES,
  XP_TO_CANCEL_ENCOUNTER,
  XP_TO_LEVEL_UP,
} from '../data/heroes.js'
import { PHASES } from '../data/phases.js'
import { heroItems, itemAttackBonus, itemTrapBonus, tileAcBonus } from '../data/items.js'
import { effectsOf, heroAc, heroAttackPenalty, maxRolls } from '../data/powerEffects.js'

export const SAVE_VERSION = 1

let idCounter = 0
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`

export const initialState = {
  version: SAVE_VERSION,
  status: 'setup', // setup | playing | won | lost
  heroes: [],
  surges: STARTING_SURGES,
  xp: 0,
  monsters: [],
  turn: { heroIndex: 0, phase: 0, round: 1 },
  log: [],
  moment: null, // the latest big moment, shown on every screen for a few seconds
  // Before the game starts, each iPad claims one hero and picks its powers here.
  lobby: [], // { deviceId, heroKey, player, picks: [card | null] per power slot, ready }
  // The virtual monster deck, built from the monster cards on the first draw.
  monsterDeck: null, // { cards: { [cardId]: card }, draw: [cardId], discard: [cardId] }
  // The virtual encounter deck, built the same way on the first encounter draw.
  encounterDeck: null,
  encounter: null, // the encounter card being read out: { id, cardId, heroId, card, attacked }
  environment: null, // the Environment card in play: { cardId, name, card }
  traps: [], // trap and hazard markers on the board: { id, cardId, name, type, ownerId, card }
  // The virtual treasure deck, built on the first treasure draw.
  treasureDeck: null,
  treasure: null, // the treasure card just drawn, waiting for a hero to take it: { id, cardId, heroId, card }
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const withLog = (state, text) => ({
  ...state,
  log: [{ id: newId('log'), round: state.turn.round, text }, ...state.log].slice(0, 50),
})

const withMoment = (state, moment) => ({
  ...state,
  moment: { id: newId('moment'), at: Date.now(), ...moment },
})

const heroLabel = (hero) => hero.player || hero.name

const updateHero = (state, heroId, change) => ({
  ...state,
  heroes: state.heroes.map((hero) => (hero.id === heroId ? { ...hero, ...change(hero) } : hero)),
})

const updateMonster = (state, monsterId, change) => ({
  ...state,
  monsters: state.monsters.map((monster) =>
    monster.id === monsterId ? { ...monster, ...change(monster) } : monster,
  ),
})

const toggle = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

// Shuffles with random numbers the device sent along (0 ≤ n < 1), so every
// device and the server agree on the result and Undo puts the deck back.
export function shuffle(list, random = []) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const r = Number(random[i])
    const j = Number.isFinite(r) && r >= 0 && r < 1 ? Math.floor(r * (i + 1)) : i
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function buildDeck(cards = [], random) {
  const byId = Object.fromEntries(cards.map((card) => [card.id, card]))
  const ids = cards.flatMap((card) => Array.from({ length: card.copies ?? 1 }, () => card.id))
  return { cards: byId, draw: shuffle(ids, random), discard: [] }
}

// A monster in play, with the card copied in so its tactics and attacks travel with it.
function monsterFromCard(card, ownerId) {
  const figures = card.figures ?? 1
  return {
    id: newId('monster'),
    cardId: card.id,
    name: card.name,
    maxHp: card.hp * figures,
    hp: card.hp * figures,
    ac: card.ac,
    xp: card.xp,
    ownerId,
    conditions: [],
    card: { hp: card.hp, figures, special: card.special ?? '', types: card.types ?? [], attacks: card.attacks, tactics: card.tactics },
  }
}

const article = (name) => (/^[AEIOU]/.test(name) ? 'an' : 'a')

// Draws a monster card for a hero. A hero never has two cards of the same monster, so
// cards they already have are discarded until a new one turns up. The discards are
// shuffled into a new deck when the deck runs out.
function drawMonster(state, heroId, random) {
  const hero = state.heroes.find((h) => h.id === heroId)
  const deck = state.monsterDeck
  if (!hero || !deck) return state
  const owned = new Set(state.monsters.filter((m) => m.ownerId === hero.id).map((m) => m.cardId))
  let { draw, discard } = deck
  let next = state
  let reshuffled = false
  const skipped = []
  let cardId = null
  while (cardId === null) {
    if (draw.length === 0) {
      if (discard.length === 0 || reshuffled) {
        return withLog(state, `There's no monster card left that ${hero.name} doesn't already have.`)
      }
      draw = shuffle(discard, random)
      discard = []
      reshuffled = true
      next = withLog(next, 'The monster discards were shuffled into a new deck.')
    }
    const [top, ...rest] = draw
    draw = rest
    if (owned.has(top)) skipped.push(top)
    else cardId = top
  }
  discard = [...discard, ...skipped]
  for (const id of skipped) {
    const name = deck.cards[id]?.name ?? 'monster'
    next = withLog(next, `Discarded ${article(name)} ${name}: ${hero.name} already has one.`)
  }
  const card = deck.cards[cardId]
  if (!card) return state
  const monster = monsterFromCard(card, hero.id)
  const figures = monster.card.figures
  // One monster per new tile: the Exploration Phase's draw button locks after this.
  const exploring = PHASES[next.turn.phase]?.key === 'exploration' && next.heroes[next.turn.heroIndex]?.id === hero.id
  next = {
    ...next,
    monsterDeck: { ...deck, draw, discard },
    monsters: [...next.monsters, monster],
    turn: exploring ? { ...next.turn, monsterDrawn: true } : next.turn,
    // An encounter card's monster: one per card, so its draw button locks too.
    encounter: next.encounter ? { ...next.encounter, monsterDrawn: true } : next.encounter,
  }
  return withMoment(withLog(next, `${heroLabel(hero)} drew ${article(card.name)} ${card.name}!`), {
    kind: 'spawn',
    heroId: hero.id,
    title: figures > 1 ? `${figures} ${card.name}s appear!` : `${article(card.name) === 'an' ? 'An' : 'A'} ${card.name} appears!`,
    detail: figures > 1 ? `Place ${figures} ${card.name} figures on the new tile.` : 'Place its figure on the new tile.',
  })
}

// A defeated monster's card goes to the party's XP pile (the xp count), never back into
// the deck. Only a monster removed by mistake goes to the discards.
const discardMonsterCard = (state, monster) =>
  monster.cardId && state.monsterDeck
    ? { ...state, monsterDeck: { ...state.monsterDeck, discard: [...state.monsterDeck.discard, monster.cardId] } }
    : state

// A hero's AC against an attack. Heroes standing on a Blessed Shield owner's tile
// (tileGuarded, asked on the iPad) get its bonus too.
const targetAc = (state, hero, tileGuarded) =>
  heroAc(hero) + (Array.isArray(tileGuarded) && tileGuarded.includes(hero.id) ? tileAcBonus(state.heroes, hero) : 0)

// One monster attack against one or more heroes. Each target comes with the d20 the
// device rolled for it. A hit deals the damage and conditions; a miss deals the miss damage.
function monsterAttack(state, action) {
  const monster = state.monsters.find((m) => m.id === action.monsterId)
  const attack = monster?.card?.attacks.find((a) => a.id === action.attackId)
  let targets = (Array.isArray(action.targets) ? action.targets : []).filter(
    (t) => state.heroes.some((h) => h.id === t.heroId) && validRoll(t.roll),
  )
  if (!attack || targets.length === 0) return state

  let next = state
  // Noble Shield: Keyleth takes an attack aimed at several heroes alone, and it rolls a 20.
  const shield = action.nobleShield
  if (shield) {
    const keeper = state.heroes.find((h) => h.id === shield.heroId)
    const power = keeper?.powers.find((p) => p.id === shield.powerId)
    if (!power || power.used || effectsOf(power).reaction !== 'noble-shield' || targets.length < 2) return state
    if (!targets.some((t) => t.heroId === keeper.id)) return state
    targets = [{ heroId: keeper.id, roll: 20 }]
    next = withLog(markUsed(next, keeper.id, power.id), `${keeper.name} used Noble Shield to take the ${monster.name}'s attack alone.`)
  }

  const rolls = []
  const results = []
  const downed = []
  for (const { heroId, roll } of targets) {
    const hero = next.heroes.find((h) => h.id === heroId)
    const ac = targetAc(next, hero, action.tileGuarded)
    const total = roll + attack.bonus
    const hit = total >= ac
    const damage = hit ? attack.damage : attack.miss
    const conditions = hit ? attack.conditions.filter((c) => !hero.conditions.includes(c)) : []
    const hp = clamp(hero.hp - damage, 0, hero.maxHp)
    next = updateHero(next, hero.id, (h) => ({ hp, conditions: [...h.conditions, ...conditions] }))
    if (hero.hp > 0 && hp === 0) downed.push(hero.name)
    const result = [damage > 0 && `${damage} damage`, ...conditions].filter(Boolean).join(' and ')
    const outcome = hit ? `Hit! ${result || 'No damage'}` : damage > 0 ? `Miss, but ${result}` : 'Miss!'
    rolls.push({ heroId: hero.id, value: roll, total, ac, hit, outcome })
    results.push({ heroId: hero.id, value: roll, total, ac, hit, dealt: hero.hp - hp, miss: attack.miss, conditions })
    next = withLog(
      next,
      `The ${monster.name} attacked ${hero.name} with its ${attack.name}: rolled ${roll} + ${attack.bonus} = ${total} against AC ${ac}. ${outcome}`,
    )
    // Each miss against Mirror Image pops one of the images.
    if (!hit && hero.tokens?.mirrorImage > 0) {
      next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, mirrorImage: h.tokens.mirrorImage - 1 } }))
      next = withLog(next, `One of ${hero.name}'s mirror images vanished.`)
    }
  }
  // Remembered so Tumbling Escape can turn a hit into a miss.
  next = { ...next, turn: { ...next.turn, lastMonsterAttack: { monsterId: monster.id, attackId: attack.id, results } } }
  for (const name of downed) next = withLog(next, `${name} is down!`)
  return withMoment(next, {
    kind: downed.length > 0 ? 'monster-down' : 'monster',
    monsterId: monster.id,
    title: `${monster.name}: ${attack.name}!`,
    detail: downed.length > 0 ? `${downed.join(' and ')} ${downed.length > 1 ? 'are' : 'is'} down!` : '',
    rolls,
  })
}

// An attack on one or more heroes, from a monster, an encounter card or a trap. Each
// target comes with the d20 the device rolled for it. A hit deals the damage and
// conditions; a miss deals the miss damage (and any miss conditions).
function attackHeroes(state, { who, attack, targets: list, moment, tileGuarded }) {
  const targets = (Array.isArray(list) ? list : []).filter(
    (t) => state.heroes.some((h) => h.id === t.heroId) && validRoll(t.roll),
  )
  if (!attack || targets.length === 0) return state

  let next = state
  const rolls = []
  const downed = []
  for (const { heroId, roll } of targets) {
    const hero = next.heroes.find((h) => h.id === heroId)
    const ac = targetAc(next, hero, tileGuarded)
    const total = roll + attack.bonus
    const hit = total >= ac
    const damage = hit ? attack.damage : attack.miss
    const conditions = (hit ? attack.conditions : attack.missConditions ?? []).filter((c) => !hero.conditions.includes(c))
    const hp = clamp(hero.hp - damage, 0, hero.maxHp)
    next = updateHero(next, hero.id, (h) => ({ hp, conditions: [...h.conditions, ...conditions] }))
    if (hero.hp > 0 && hp === 0) downed.push(hero.name)
    const result = [damage > 0 && `${damage} damage`, ...conditions].filter(Boolean).join(' and ')
    const outcome = hit ? `Hit! ${result || 'No damage'}` : result ? `Miss, but ${result}` : 'Miss!'
    rolls.push({ heroId: hero.id, value: roll, total, ac, hit, outcome })
    next = withLog(next, `${who} attacked ${hero.name}: rolled ${roll} + ${attack.bonus} = ${total} against AC ${ac}. ${outcome}`)
    // Each miss against Mirror Image pops one of the images.
    if (!hit && hero.tokens?.mirrorImage > 0) {
      next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, mirrorImage: h.tokens.mirrorImage - 1 } }))
      next = withLog(next, `One of ${hero.name}'s mirror images vanished.`)
    }
  }
  for (const name of downed) next = withLog(next, `${name} is down!`)
  return withMoment(next, {
    kind: downed.length > 0 ? 'monster-down' : 'monster',
    ...moment,
    detail: downed.length > 0 ? `${downed.join(' and ')} ${downed.length > 1 ? 'are' : 'is'} down!` : moment.detail ?? '',
    rolls,
  })
}

// Damage that needs no roll, such as "Each Hero takes 1 damage."
function damageHeroes(state, heroIds, damage, why) {
  let next = state
  const downed = []
  for (const hero of state.heroes.filter((h) => heroIds.includes(h.id) && h.hp > 0)) {
    const hp = clamp(hero.hp - damage, 0, hero.maxHp)
    next = withLog(updateHero(next, hero.id, () => ({ hp })), `${hero.name} took ${damage} damage from ${why}.`)
    if (hp === 0) downed.push(hero.name)
  }
  for (const name of downed) next = withLog(next, `${name} is down!`)
  return { next, downed }
}

// Draws the top card of a deck, shuffling the discards into a new deck when it runs out.
function drawTop(deck, random) {
  let { draw, discard } = deck
  let reshuffled = false
  if (draw.length === 0) {
    if (discard.length === 0) return null
    draw = shuffle(discard, random)
    discard = []
    reshuffled = true
  }
  const [cardId, ...rest] = draw
  return { cardId, deck: { ...deck, draw: rest, discard }, reshuffled }
}

const discardEncounterCard = (state, cardId) =>
  state.encounterDeck && cardId
    ? { ...state, encounterDeck: { ...state.encounterDeck, discard: [...state.encounterDeck.discard, cardId] } }
    : state

export const ENCOUNTER_LABELS = { event: 'Event', curse: 'Curse', environment: 'Environment', hazard: 'Hazard', trap: 'Trap' }

function drawEncounter(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  if (!hero || state.encounter) return state
  const withDeck = state.encounterDeck ? state : { ...state, encounterDeck: buildDeck(action.cards, action.random) }
  const drawn = drawTop(withDeck.encounterDeck, action.random)
  if (!drawn) return withLog(state, 'There are no encounter cards left to draw.')
  const card = drawn.deck.cards[drawn.cardId]
  if (!card) return state
  let next = {
    ...withDeck,
    encounterDeck: drawn.deck,
    encounter: { id: newId('encounter'), cardId: card.id, heroId: hero.id, card, attacked: false },
    turn: { ...withDeck.turn, encountersDrawn: (withDeck.turn.encountersDrawn ?? 0) + 1 },
  }
  if (drawn.reshuffled) next = withLog(next, 'The encounter discards were shuffled into a new deck.')
  return withMoment(withLog(next, `${heroLabel(hero)} drew the encounter ${card.name}.`), {
    kind: 'encounter',
    heroId: hero.id,
    title: card.name,
    detail: `${ENCOUNTER_LABELS[card.type] ?? 'Encounter'}! ${card.flavor ?? ''}`.trim(),
  })
}

// "Draw 5 Monster Cards. Discard any Monster that is not an Orc. Shuffle the remaining
// cards and put them on top of the Monster Card deck."
function filterMonsterDeck(state, type, random, cards = []) {
  const deck = state.monsterDeck ?? (cards.length > 0 ? buildDeck(cards, random) : null)
  if (!deck) return state
  const typesOf = (id) => deck.cards[id]?.types ?? cards.find((c) => c.id === id)?.types ?? []
  const top = deck.draw.slice(0, 5)
  const keep = top.filter((id) => typesOf(id).includes(type))
  const toss = top.filter((id) => !typesOf(id).includes(type))
  return withLog(
    { ...state, monsterDeck: { ...deck, draw: [...shuffle(keep, random), ...deck.draw.slice(5)], discard: [...deck.discard, ...toss] } },
    `Looked at the top ${top.length} monster cards: ${keep.length} ${type}${keep.length === 1 ? '' : 's'} went back on top.`,
  )
}

// After the encounter card is read out (and any attack rolled), the app does what it
// can and puts the card where it goes: on the hero (curse), in play (environment), on
// the board (trap, hazard), or in the discards (event).
function resolveEncounter(state, action) {
  const encounter = state.encounter
  if (!encounter) return state
  const { card } = encounter
  const hero = state.heroes.find((h) => h.id === encounter.heroId)
  let next = { ...state, encounter: null }
  let downed = []

  if (card.damageEach > 0) {
    ;({ next, downed } = damageHeroes(next, next.heroes.map((h) => h.id), card.damageEach, card.name))
  }
  if (card.damagePoisoned > 0) {
    const poisoned = next.heroes.filter((h) => h.conditions.includes('Poisoned')).map((h) => h.id)
    ;({ next, downed } = damageHeroes(next, poisoned, card.damagePoisoned, card.name))
  }
  if (card.filterMonsters && !encounter.filtered) next = filterMonsterDeck(next, card.filterMonsters, action.random, action.monsterCards)

  if (card.type === 'curse' && hero) {
    const curse = { id: newId('curse'), cardId: card.id, name: card.name, text: card.text, card: card.curse ?? {} }
    next = withLog(updateHero(next, hero.id, (h) => ({ curses: [...(h.curses ?? []), curse] })), `${hero.name} is cursed: ${card.name}.`)
  } else if (card.type === 'environment') {
    if (next.environment) next = discardEncounterCard(next, next.environment.cardId)
    next = withLog({ ...next, environment: { cardId: card.id, name: card.name, card } }, `${card.name} is the new environment.`)
  } else if (card.type === 'trap' || card.type === 'hazard') {
    const marker = { id: newId('trap'), cardId: card.id, name: card.name, type: card.type, ownerId: encounter.heroId, card }
    next = withLog({ ...next, traps: [...(next.traps ?? []), marker] }, `A ${card.name} marker goes on ${hero?.name ?? 'the hero'}'s tile.`)
  } else {
    next = discardEncounterCard(next, card.id)
  }
  if (card.drawAnother) next = { ...next, turn: { ...next.turn, encountersOwed: (next.turn.encountersOwed ?? 0) + 1 } }
  if (downed.length > 0) {
    next = withMoment(next, { kind: 'down', title: `${downed.join(' and ')} ${downed.length > 1 ? 'are' : 'is'} down!`, detail: card.name })
  }
  return next
}

// "+6" → 6, "2" → 2. A power without a number has no attack roll.
export const powerNumber = (text) => {
  const match = /[+-]?\d+/.exec(String(text ?? ''))
  return match ? Number(match[0]) : null
}

// Damage to a monster. A group card (three Legion Devils) loses one figure at a
// time, so extra damage doesn't spill onto the next figure.
function damageMonster(monster, damage) {
  const perFigure = monster.card?.figures > 1 ? monster.card.hp : monster.maxHp
  const current = monster.hp - perFigure * (Math.ceil(monster.hp / perFigure) - 1)
  return monster.hp - Math.min(damage, current)
}

// Takes `dealt` HP off a monster. At 0 HP it is defeated: off the board, and its XP to the party.
function hurtMonster(state, monster, dealt) {
  const hp = dealt > 0 ? damageMonster(monster, dealt) : monster.hp
  if (hp > 0) return { state: updateMonster(state, monster.id, () => ({ hp })), defeated: false }
  const next = { ...state, xp: state.xp + monster.xp, monsters: state.monsters.filter((m) => m.id !== monster.id) }
  return { state: withLog(next, `The ${monster.name} was defeated! +${monster.xp} XP`), defeated: true }
}

// The first monster defeated in a turn earns a treasure card for the hero who defeated
// it. Returns the moment's words.
function defeatDetails(state, defeated, heroId) {
  if (defeated.length === 0) return { state, details: [] }
  const treasure = !state.turn.treasureDrawn
  const next = treasure ? { ...state, turn: { ...state.turn, treasureDrawn: true, treasureOwed: heroId ?? null } } : state
  const xp = defeated.reduce((sum, m) => sum + m.xp, 0)
  return {
    state: next,
    details: [`${defeated.map((m) => m.name).join(' and ')} defeated! +${xp} XP`, treasure && 'Draw a treasure card!'].filter(Boolean),
  }
}

const markUsed = (state, heroId, powerId) =>
  updateHero(state, heroId, (h) => ({ powers: h.powers.map((p) => (p.id === powerId ? { ...p, used: true } : p)) }))

// Heals a hero (never past max HP) and logs it.
function healHero(state, heroId, amount, source) {
  const hero = state.heroes.find((h) => h.id === heroId)
  if (!hero || amount <= 0) return state
  const hp = Math.min(hero.maxHp, hero.hp + amount)
  if (hp === hero.hp) return withLog(state, `${hero.name} is already at full HP.`)
  return withLog(updateHero(state, hero.id, () => ({ hp })), `${hero.name} regained ${hp - hero.hp} HP from ${source}.`)
}

const validRoll = (roll) => Number.isInteger(roll) && roll >= 1 && roll <= 20

// One attack roll's sums. The parts that don't depend on the die are worked out once per attack.
function rollAgainst(monster, roll, attack) {
  const total = roll + attack.bonus
  const hit = total >= monster.ac
  const even = hit && attack.evenBonus && roll % 2 === 0 ? attack.evenBonus : 0
  // Dragontooth Pick and Vorpal Sword: +1 damage on a high natural roll.
  const crit = hit ? (attack.crits ?? []).filter((from) => roll >= from).length : 0
  const damage = attack.damage + even + crit
  const dealt = hit ? damage : attack.miss
  const outcome = hit ? (damage > 0 ? `Hit! ${damage} damage` : 'Hit!') : attack.miss > 0 ? `Miss, but ${attack.miss} damage` : 'Miss!'
  return { total, hit, dealt, outcome }
}

// A hero attacks one or more monsters with a power or an item (Crossbow of Speed). Each
// target comes with the d20 the device rolled. Monsters brought to 0 HP are defeated, and
// a daily power is used up. The power's own effects (powerEffects.js) and the hero's
// items (items.js) are applied here too.
function heroAttack(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const item = action.itemId ? heroItems(hero).find((i) => i.id === action.itemId && !i.used && i.card?.attack) : null
  const power = item ? null : hero?.powers.find((p) => p.id === action.powerId)
  const source = item ?? power
  const effects = effectsOf(power)
  // Cause Fear and Acrobatic Onslaught hand out an extra at-will attack.
  const bonusAttacks = state.turn.bonusAttacks ?? []
  const extraAttack = action.bonusAttack ? bonusAttacks.find((b) => b.heroId === hero?.id) : null
  if (action.bonusAttack && (!extraAttack || power?.type !== 'at-will')) return state
  const baseBonus = item ? item.card.attack.bonus : powerNumber(power?.card?.attack)
  const targets = (Array.isArray(action.targets) ? action.targets : [])
    .filter((t) => state.monsters.some((m) => m.id === t.monsterId && m.ac) && validRoll(t.roll))
    .slice(0, item ? 1 : maxRolls(power))
  if (!source || baseBonus === null || power?.used || targets.length === 0) return state

  const adjacent = effects.ask === 'adjacent-count' ? clamp(Number(action.adjacentCount) || 0, 0, 8) : 0
  const attack = {
    bonus: baseBonus + (extraAttack?.bonus ?? 0) + adjacent - heroAttackPenalty(hero),
    damage: item
      ? item.card.attack.damage
      : (powerNumber(power.card.damage) ?? 0) + (effects.ask === 'started-adjacent' && action.startedAdjacent ? 1 : 0),
    // "3 (Miss: 1)": some powers still hurt on a miss.
    miss: item ? 0 : powerNumber(/miss\D*(\d+)/i.exec(power.card.damage ?? '')?.[1]) ?? 0,
    evenBonus: effects.evenBonus ?? 0,
  }
  // Magic weapons add to rolls against monsters close enough, so each target can differ.
  const distances = action.distances && typeof action.distances === 'object' ? action.distances : {}
  const attackOn = (monsterId) => {
    const extra = itemAttackBonus(hero, distances[monsterId], action.stayed === true)
    return { ...attack, bonus: attack.bonus + extra.bonus, damage: attack.damage + extra.damage, crits: extra.crits }
  }

  let next = state
  const rolls = []
  const defeated = []
  for (const { monsterId, roll } of targets) {
    const monster = next.monsters.find((m) => m.id === monsterId)
    if (!monster) {
      // Tornado Strike can aim a second roll at a monster the first one already beat.
      next = withLog(next, `${hero.name}'s ${source.name}: that monster was already defeated.`)
      continue
    }
    const rowAttack = attackOn(monsterId)
    const result = rollAgainst(monster, roll, rowAttack)
    rolls.push({ monsterId, label: monster.name, value: roll, total: result.total, ac: monster.ac, hit: result.hit, outcome: result.outcome, dealt: result.dealt, attack: rowAttack })
    next = withLog(
      next,
      `${hero.name}'s ${source.name} vs the ${monster.name}: rolled ${roll} + ${rowAttack.bonus} = ${result.total} against AC ${monster.ac}. ${result.outcome}`,
    )
    const hurt = hurtMonster(next, monster, result.dealt)
    next = hurt.state
    if (hurt.defeated) defeated.push(monster)
  }
  const anyHit = rolls.some((r) => r.hit)

  // A daily is used up, except Comeback Strike when it misses. Ring of Shooting Stars flips over.
  if (power?.type === 'daily' && (anyHit || !effects.keepOnMiss)) next = markUsed(next, hero.id, power.id)
  if (item?.card.after) next = spendItem(next, hero.id, item.id)
  if (effects.onHit?.healSelf && anyHit) next = healHero(next, hero.id, effects.onHit.healSelf, power.name)

  let extras = extraAttack ? bonusAttacks.filter((b) => b !== extraAttack) : bonusAttacks
  if (effects.after === 'at-will') extras = [...extras, { heroId: hero.id, bonus: 0, source: power.name }]
  next = {
    ...next,
    turn: {
      ...next.turn,
      bonusAttacks: extras,
      // Remembered for Inspiring Advice, Furious Assault and the power's own follow-up question.
      lastAttack: { heroId: hero.id, powerId: power?.id ?? null, itemId: item?.id ?? null, attack, rolls, followUpDone: false, bonus: Boolean(extraAttack) },
    },
  }

  // Bloodlust ends when the hero defeats a monster.
  const ending = defeated.length > 0 ? (hero.curses ?? []).filter((c) => c.card?.removeOnDefeat) : []
  for (const curse of ending) next = removeCurse(next, hero.id, curse.id, `${hero.name}'s ${curse.name} curse is over.`)
  const natural20 = rolls.some((r) => r.value === 20)
  const canLevel = natural20 && hero.level === 1 && next.xp >= XP_TO_LEVEL_UP
  // A natural 20 on an attack is what lets a hero level up this turn.
  if (natural20) next = { ...next, turn: { ...next.turn, natural20: hero.id } }
  const won = defeatDetails(next, defeated, hero.id)
  next = won.state
  return withMoment(next, {
    kind: natural20 ? 'crit' : defeated.length > 0 ? 'defeat' : 'roll',
    heroId: hero.id,
    title: `${hero.name}: ${source.name}!`,
    detail: [...won.details, canLevel && 'Natural 20! You can level up.'].filter(Boolean).join(' '),
    rolls,
  })
}

// Inspiring Advice or a Lucky Charm: a hero who missed rolls again. The miss damage
// comes back off, and the advice card is only used up if the new roll hits. The charm
// is discarded either way.
function rerollAttack(state, action) {
  const last = state.turn.lastAttack
  const helper = state.heroes.find((h) => h.id === action.helperId)
  const advice = action.helperItemId ? null : helper?.powers.find((p) => p.id === action.helperPowerId)
  const charm = action.helperItemId ? heroItems(helper).find((i) => i.id === action.helperItemId && !i.used && i.card?.use === 'reroll') : null
  const row = last?.rolls.find((r) => r.monsterId === action.monsterId && !r.hit && !r.rerolled)
  const monster = state.monsters.find((m) => m.id === action.monsterId)
  const hero = state.heroes.find((h) => h.id === last?.heroId)
  const power = hero?.powers.find((p) => p.id === last.powerId)
  const helps = charm || (advice && !advice.used && effectsOf(advice).reaction === 'reroll')
  if (!row || !monster || !helps || !validRoll(action.roll)) return state

  const helpName = charm ? `${helper.name}'s Lucky Charm` : `${helper.name}'s Inspiring Advice`
  const attack = row.attack ?? last.attack
  const before = { ...monster, hp: Math.min(monster.maxHp, monster.hp + row.dealt) }
  let next = updateMonster(state, monster.id, () => ({ hp: before.hp }))
  if (charm) next = spendItem(next, helper.id, charm.id)
  const result = rollAgainst(before, action.roll, attack)
  next = withLog(
    next,
    `${helpName}: ${hero.name} rolled again, ${action.roll} + ${attack.bonus} = ${result.total} against AC ${monster.ac}. ${result.outcome}`,
  )
  const hurt = hurtMonster(next, before, result.dealt)
  next = hurt.state
  const rolls = last.rolls.map((r) => (r === row ? { ...r, value: action.roll, total: result.total, hit: result.hit, outcome: result.outcome, dealt: result.dealt, rerolled: true } : r))
  next = { ...next, turn: { ...next.turn, lastAttack: { ...last, rolls } } }
  if (result.hit) {
    if (advice) next = markUsed(next, helper.id, advice.id)
    const effects = effectsOf(power)
    if (power?.type === 'daily') next = markUsed(next, hero.id, power.id)
    if (effects.onHit?.healSelf && !last.rolls.some((r) => r.hit)) next = healHero(next, hero.id, effects.onHit.healSelf, power.name)
  }
  if (action.roll === 20) next = { ...next, turn: { ...next.turn, natural20: hero.id } }
  const won = defeatDetails(next, hurt.defeated ? [monster] : [], hero.id)
  return withMoment(won.state, {
    kind: action.roll === 20 ? 'crit' : hurt.defeated ? 'defeat' : 'roll',
    heroId: hero.id,
    title: `${charm ? 'Lucky Charm' : 'Inspiring Advice'}: ${result.hit ? 'Hit!' : 'Missed again'}`,
    detail: won.details.join(' '),
    rolls: [{ monsterId: monster.id, label: monster.name, value: action.roll, total: result.total, ac: monster.ac, hit: result.hit, outcome: result.outcome }],
  })
}

// The question a power asks after its attack: who gets healed or shielded, or which
// monster goes to the next player. Answered once per attack.
function attackFollowUp(state, action) {
  const last = state.turn.lastAttack
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const power = hero?.powers.find((p) => p.id === action.powerId)
  if (!last || last.followUpDone || last.heroId !== hero?.id || last.powerId !== power?.id) return state
  const effects = effectsOf(power)
  const heroIds = (Array.isArray(action.heroIds) ? action.heroIds : []).filter((id) => state.heroes.some((h) => h.id === id))
  let next = { ...state, turn: { ...state.turn, lastAttack: { ...last, followUpDone: true } } }

  if (effects.onHit?.heal && last.rolls.some((r) => r.hit) && heroIds.length === 1) {
    return healHero(next, heroIds[0], effects.onHit.heal, power.name)
  }
  if (effects.after === 'heal-tile' && heroIds.length > 0) {
    for (const id of heroIds) next = healHero(next, id, 1, power.name)
    return next
  }
  if (effects.after === 'shield' && heroIds.length === 1) {
    // Only one hero has Quinn's shield at a time: using the power again moves it.
    next = { ...next, heroes: next.heroes.map((h) => (h.shieldedBy === hero.id ? { ...h, shieldedBy: null } : h)) }
    next = updateHero(next, heroIds[0], () => ({ shieldedBy: hero.id }))
    const target = next.heroes.find((h) => h.id === heroIds[0])
    return withLog(next, `${target.name} has +2 AC from ${hero.name}'s Cleric's Shield.`)
  }
  if (effects.after === 'pass-monster') {
    const monster = state.monsters.find((m) => m.id === action.monsterId)
    if (!monster) return state
    // Turns go to the left, so the player on your right is the one who went before you.
    const index = state.heroes.indexOf(hero)
    const right = state.heroes[(index - 1 + state.heroes.length) % state.heroes.length]
    next = updateMonster(next, monster.id, () => ({ ownerId: right.id }))
    return withLog(next, `${hero.name}'s Wrathful Thunder sent the ${monster.name} to ${heroLabel(right)}.`)
  }
  return state
}

// Damage that isn't an attack roll: Furious Assault's +1, a Blade Barrier or Caltrop
// token, or the Flaming Sphere burning every monster on its tile.
function powerDamage(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const monsters = (Array.isArray(action.monsterIds) ? action.monsterIds : [])
    .map((id) => state.monsters.find((m) => m.id === id))
    .filter(Boolean)
  if (!hero || monsters.length === 0) return state
  const tokens = hero.tokens ?? {}
  let next = state
  let source
  if (action.source === 'furious') {
    const power = hero.powers.find((p) => p.id === action.powerId)
    const last = state.turn.lastAttack
    const hit = last?.heroId === hero.id && last.rolls.some((r) => r.hit && r.monsterId === monsters[0].id)
    if (!power || power.used || effectsOf(power).reaction !== 'furious' || !hit || monsters.length !== 1) return state
    next = markUsed(next, hero.id, power.id)
    source = 'Furious Assault'
  } else if (action.source === 'bladeBarrier' && tokens.bladeBarrier > 0 && monsters.length === 1) {
    next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, bladeBarrier: h.tokens.bladeBarrier - 1 } }))
    source = 'a Blade Barrier'
  } else if (action.source === 'caltrops' && tokens.caltrops > 0 && monsters.length === 1) {
    next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, caltrops: h.tokens.caltrops - 1 } }))
    source = 'a Caltrop'
  } else if (action.source === 'flamingSphere' && tokens.flamingSphere > 0 && !state.turn.sphereBurned) {
    next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, flamingSphere: h.tokens.flamingSphere - 1 } }))
    next = { ...next, turn: { ...next.turn, sphereBurned: true } }
    source = 'the Flaming Sphere'
  } else {
    return state
  }
  const defeated = []
  for (const monster of monsters) {
    next = withLog(next, `The ${monster.name} took 1 damage from ${source}.`)
    const hurt = hurtMonster(next, monster, 1)
    next = hurt.state
    if (hurt.defeated) defeated.push(monster)
  }
  const won = defeatDetails(next, defeated, hero.id)
  return withMoment(won.state, {
    kind: defeated.length > 0 ? 'defeat' : 'roll',
    heroId: hero.id,
    title: `${source[0].toUpperCase()}${source.slice(1)}: 1 damage!`,
    detail: won.details.join(' '),
  })
}

// A power used from its tile: healing, tokens, ending a condition, and so on.
function usePower(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const power = hero?.powers.find((p) => p.id === action.powerId)
  const use = effectsOf(power).use
  if (!power || power.used || !use) return state
  const heroIds = (Array.isArray(action.heroIds) ? action.heroIds : []).filter((id) => state.heroes.some((h) => h.id === id))
  const picked = heroIds[0] && state.heroes.find((h) => h.id === heroIds[0])
  if (use.pick && !picked && !use.optional) return state
  if (use.pick === 'other' && picked?.id === hero.id) return state

  let next = power.type === 'at-will' ? state : markUsed(state, hero.id, power.id)
  next = withLog(next, `${heroLabel(hero)} used ${power.name}.`)
  if (use.healSelf) next = healHero(next, hero.id, use.healSelf, power.name)
  if (use.heal && picked) next = healHero(next, picked.id, use.heal, power.name)
  if (use.tokens) next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, ...use.tokens } }))
  if (use.invisible) next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, invisible: true } }))
  if (use.refuge) {
    next = updateHero(next, picked.id, (h) => ({ tokens: { ...h.tokens, refuge: true } }))
    next = withLog(next, `${picked.name} is safe in the Astral Refuge until their next turn.`)
  }
  if (use.endCondition) {
    if (!picked.conditions.includes(action.condition)) return state
    next = updateHero(next, picked.id, (h) => ({ conditions: h.conditions.filter((c) => c !== action.condition) }))
    next = withLog(next, `${picked.name} is no longer ${action.condition}.`)
  }
  if (use.causeFear) {
    const extras = heroIds.filter((id) => id !== hero.id).map((heroId) => ({ heroId, bonus: 2, source: power.name }))
    next = { ...next, turn: { ...next.turn, bonusAttacks: [...(next.turn.bonusAttacks ?? []), ...extras] } }
  }
  return next
}

// Tumbling Escape: the monster's hit becomes a miss. The damage and conditions come back
// off, and the attack's miss damage (if any) is dealt instead.
function dodgeHit(state, action) {
  const last = state.turn.lastMonsterAttack
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const power = hero?.powers.find((p) => p.id === action.powerId)
  const row = last?.results.find((r) => r.heroId === hero?.id && r.hit && !r.dodged)
  if (!row || !power || power.used || effectsOf(power).reaction !== 'dodge') return state
  let next = markUsed(state, hero.id, power.id)
  next = updateHero(next, hero.id, (h) => ({
    hp: clamp(h.hp + row.dealt - row.miss, 0, h.maxHp),
    conditions: h.conditions.filter((c) => !row.conditions.includes(c)),
  }))
  const results = last.results.map((r) => (r === row ? { ...r, dodged: true } : r))
  next = { ...next, turn: { ...next.turn, lastMonsterAttack: { ...last, results } } }
  return withLog(next, `${hero.name} used Tumbling Escape: the attack misses!${row.miss > 0 ? ` (${row.miss} miss damage)` : ''} Put ${hero.name} on a tile within 1 tile.`)
}

// Invisibility lasts until the wizard's next turn, and a hero in the Astral Refuge comes
// back onto the board then.
function returnFromPowers(state, hero) {
  const tokens = hero?.tokens ?? {}
  if (!tokens.invisible && !tokens.refuge) return state
  let next = updateHero(state, hero.id, (h) => ({ tokens: { ...h.tokens, invisible: false, refuge: false } }))
  if (tokens.invisible) next = withLog(next, `${hero.name} is visible again.`)
  if (!tokens.refuge) return next
  return withMoment(withLog(next, `${hero.name} is back from the Astral Refuge.`), {
    kind: 'roll',
    heroId: hero.id,
    title: `${hero.name} returns!`,
    detail: `Put ${hero.name} on any tile.`,
  })
}

const curseTotal = (hero, field) => (hero.curses ?? []).reduce((sum, curse) => sum + (curse.card?.[field] ?? 0), 0)

const removeCurse = (state, heroId, curseId, text) => {
  const hero = state.heroes.find((h) => h.id === heroId)
  const curse = hero?.curses?.find((c) => c.id === curseId)
  if (!curse) return state
  const next = updateHero(state, heroId, (h) => ({ curses: h.curses.filter((c) => c.id !== curseId) }))
  return withLog(discardEncounterCard(next, curse.cardId), text)
}

// Poison (and Bloodlust) hurt at the start of the hero's turn.
function startTurn(state) {
  const hero = state.heroes[state.turn.heroIndex]
  state = returnFromPowers(state, hero)
  if (!hero || hero.hp === 0) return state
  const poison = hero.conditions.includes('Poisoned') ? 1 : 0
  const curse = curseTotal(hero, 'startDamage')
  if (poison + curse === 0) return state
  const hp = Math.max(0, hero.hp - poison - curse)
  let next = updateHero(state, hero.id, () => ({ hp }))
  if (poison) next = withLog(next, `${hero.name} took 1 poison damage.`)
  if (curse) next = withLog(next, `${hero.name} took ${curse} damage from a curse.`)
  return withMoment(next, {
    kind: hp === 0 ? 'down' : 'poison',
    heroId: hero.id,
    title: hp === 0 ? `${hero.name} is down!` : `${hero.name} takes ${poison + curse} damage`,
    detail:
      hp === 0
        ? 'Spend a healing surge to get back up.'
        : poison
          ? 'Roll 10 or more after your Hero Phase to shake off the poison.'
          : 'A curse hurts at the start of your turn.',
  })
}

// Some curses end on a roll at the end of a phase ("Roll a die at the end of your Hero
// Phase: 10+ discard this card"). The device sends the dice with NEXT_PHASE.
function endPhaseCurses(state, hero, phaseKey, rolls = []) {
  let next = state
  let i = 0
  for (const curse of (hero?.curses ?? []).filter((c) => c.card?.removeRoll?.phase === phaseKey)) {
    const roll = rolls[i++]
    if (!validRoll(roll)) continue
    const { target } = curse.card.removeRoll
    next =
      roll >= target
        ? removeCurse(next, hero.id, curse.id, `${hero.name} rolled ${roll} and broke the ${curse.name} curse!`)
        : withLog(next, `${hero.name} rolled ${roll} against the ${curse.name} curse (needed ${target}). Still cursed.`)
  }
  return next
}

// After the Hero Phase, Dazed wears off and a poisoned hero rolls (the device sends
// the d20 with the action) to shake off the poison on a 10 or more.
function endHeroPhase(state, hero, roll) {
  if (!hero) return state
  let next = state
  if (hero.conditions.includes('Dazed')) {
    next = withLog(
      updateHero(next, hero.id, (h) => ({ conditions: h.conditions.filter((c) => c !== 'Dazed') })),
      `${hero.name} is no longer Dazed.`,
    )
  }
  if (!hero.conditions.includes('Poisoned') || !Number.isInteger(roll) || roll < 1 || roll > 20) return next
  const cured = roll >= 10
  if (cured) next = updateHero(next, hero.id, (h) => ({ conditions: h.conditions.filter((c) => c !== 'Poisoned') }))
  next = withLog(next, `${hero.name} rolled ${roll} against the poison${cured ? ' and shook it off!' : '. Still poisoned.'}`)
  return withMoment(next, {
    kind: 'poison',
    heroId: hero.id,
    value: roll,
    title: cured ? 'Poison gone!' : 'Still poisoned',
    detail: `${hero.name} needed 10 or more.`,
  })
}

// Level 2: the 2nd-level side of the hero card, and one more daily power to choose.
function levelUp(state, hero) {
  const leveled = updateHero(state, hero.id, (h) => ({
    level: 2,
    maxHp: h.maxHp + LEVEL_UP_HP_BONUS,
    hp: h.hp + LEVEL_UP_HP_BONUS,
    ac: h.ac + LEVEL_UP_AC_BONUS,
    surgeValue: h.surgeValue + LEVEL_UP_SURGE_BONUS,
    powers: [...h.powers, newPower('daily')],
  }))
  return withMoment(withLog(leveled, `${hero.name} reached level 2!`), {
    kind: 'level',
    heroId: hero.id,
    title: `${hero.name} reached level 2!`,
    detail: 'Flip your hero card and choose another daily power!',
  })
}

const discardTreasureCard = (state, cardId) =>
  state.treasureDeck && cardId
    ? { ...state, treasureDeck: { ...state.treasureDeck, discard: [...state.treasureDeck.discard, cardId] } }
    : state

// An item that's been used flips over (like a used daily) or goes to the treasure discards.
function spendItem(state, heroId, itemId, how) {
  const hero = state.heroes.find((h) => h.id === heroId)
  const item = heroItems(hero).find((i) => i.id === itemId)
  const after = how ?? item?.card?.after
  if (!item || !after) return state
  if (after === 'flip') return updateHero(state, hero.id, (h) => ({ items: h.items.map((i) => (i.id === item.id ? { ...i, used: true } : i)) }))
  const next = updateHero(state, hero.id, (h) => ({ items: h.items.filter((i) => i.id !== item.id) }))
  return discardTreasureCard(next, item.cardId)
}

// Defeating a monster earns a treasure card; the device sends the cards and shuffle numbers.
function drawTreasure(state, action) {
  const heroId = state.turn.treasureOwed
  const hero = state.heroes.find((h) => h.id === heroId)
  if (!hero || state.treasure) return state
  const withDeck = state.treasureDeck ? state : { ...state, treasureDeck: buildDeck(action.cards, action.random) }
  const drawn = drawTop(withDeck.treasureDeck, action.random)
  if (!drawn) return withLog(state, 'There are no treasure cards left to draw.')
  const card = drawn.deck.cards[drawn.cardId]
  if (!card) return state
  let next = {
    ...withDeck,
    treasureDeck: drawn.deck,
    treasure: { id: newId('treasure'), cardId: card.id, heroId: hero.id, card },
    turn: { ...withDeck.turn, treasureOwed: null },
  }
  if (drawn.reshuffled) next = withLog(next, 'The treasure discards were shuffled into a new deck.')
  return withMoment(withLog(next, `${heroLabel(hero)} found ${article(card.name)} ${card.name}!`), {
    kind: 'treasure',
    heroId: hero.id,
    title: card.name,
    detail: card.flavor || 'Treasure!',
  })
}

// Before the adventure, each hero draws one treasure card to start with.
function dealStartingTreasure(state, cards, random) {
  if (!Array.isArray(cards) || cards.length === 0) return state
  let next = { ...state, treasureDeck: buildDeck(cards, random) }
  const found = []
  for (const hero of next.heroes) {
    const drawn = drawTop(next.treasureDeck, random)
    const card = drawn && drawn.deck.cards[drawn.cardId]
    if (!card) break
    const item = { id: newId('item'), cardId: card.id, name: card.name, used: false, card }
    next = updateHero({ ...next, treasureDeck: drawn.deck }, hero.id, (h) => ({ items: [...(h.items ?? []), item] }))
    next = withLog(next, `${heroLabel(hero)} starts with ${article(card.name)} ${card.name}.`)
    found.push(`${hero.name}: ${card.name}`)
  }
  return withMoment(next, { kind: 'treasure', title: 'Starting treasure!', detail: found.join(' · ') })
}

// The treasure card goes in front of a hero: the one who found it, or one they hand it to.
function keepTreasure(state, action) {
  const treasure = state.treasure
  const hero = state.heroes.find((h) => h.id === (action.heroId ?? treasure?.heroId))
  if (!treasure || !hero) return state
  const { card } = treasure
  const item = { id: newId('item'), cardId: card.id, name: card.name, used: false, card }
  const next = updateHero({ ...state, treasure: null }, hero.id, (h) => ({ items: [...(h.items ?? []), item] }))
  return withLog(next, card.inPlay ? `${hero.name} put the ${card.name} into play.` : `${hero.name} took the ${card.name}.`)
}

// Using an item from its card: healing, ending a condition, flipping a power back up, and
// so on. Then it flips over or is discarded, if the card says so.
function useItem(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const item = heroItems(hero).find((i) => i.id === action.itemId && !i.used)
  const card = item?.card
  if (!card?.use || card.use === 'monsterControl') return state
  const picked = state.heroes.find((h) => h.id === (Array.isArray(action.heroIds) && action.heroIds[0])) ?? hero
  let next = withLog(state, `${heroLabel(hero)} used the ${card.name}.`)

  switch (card.use) {
    case 'heal':
      next = healHero(next, picked.id, card.heal, `the ${card.name}`)
      break
    case 'reduceDamage':
      // "Reduce the damage by 1": the app already took it off, so it comes back.
      next = healHero(next, hero.id, 1, `the ${card.name}`)
      break
    case 'endCondition': {
      if (!picked.conditions.includes(action.condition)) return state
      next = updateHero(next, picked.id, (h) => ({ conditions: h.conditions.filter((c) => c !== action.condition) }))
      next = withLog(next, `${picked.name} is no longer ${action.condition}.`)
      break
    }
    case 'refreshPower':
    case 'refreshAny': {
      // A used power, or (Pearl of Power) a used item, flips back up.
      const power = hero.powers.find((p) => p.id === action.targetId && p.used)
      const other = card.use === 'refreshAny' && heroItems(hero).find((i) => i.id === action.targetId && i.used && i.id !== item.id)
      if (power) next = updateHero(next, hero.id, (h) => ({ powers: h.powers.map((p) => (p.id === power.id ? { ...p, used: false } : p)) }))
      else if (other) next = updateHero(next, hero.id, (h) => ({ items: h.items.map((i) => (i.id === other.id ? { ...i, used: false } : i)) }))
      else return state
      next = withLog(next, `${hero.name}'s ${(power ?? other).name} is ready again.`)
      break
    }
    case 'levelUp':
      if (hero.level !== 1) return state
      next = levelUp(next, hero)
      break
    case 'polymorph': {
      // The monster is swapped for the next card off the monster deck, with the same owner.
      const monster = state.monsters.find((m) => m.id === action.monsterId)
      if (!monster) return state
      const owner = state.heroes.find((h) => h.id === monster.ownerId) ?? hero
      next = discardMonsterCard({ ...next, monsters: next.monsters.filter((m) => m.id !== monster.id) }, monster)
      next = withLog(next, `The ${monster.name} was turned into something else!`)
      const withDeck = next.monsterDeck || !(action.cards?.length > 0) ? next : { ...next, monsterDeck: buildDeck(action.cards, action.random) }
      next = withDeck.monsterDeck ? drawMonster(withDeck, owner.id, action.random) : withDeck
      break
    }
    case 'caltrops':
      next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, caltrops: (h.tokens?.caltrops ?? 0) + card.tokens } }))
      break
    default:
      // A Lucky Charm used on another roll, Potion of Speed, Wand of Fear: the table does the rest.
      break
  }
  return spendItem(next, hero.id, item.id)
}

// Scroll of Monster Control: during the Villain Phase a monster attacks another monster
// instead of acting. The scroll's owner gets the XP (and a treasure, if it's the first).
function monsterControl(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const item = heroItems(hero).find((i) => i.id === action.itemId && !i.used && i.card?.use === 'monsterControl')
  const monster = state.monsters.find((m) => m.id === action.monsterId)
  const target = state.monsters.find((m) => m.id === action.targetId && m.id !== action.monsterId)
  if (!item || !monster || !target?.ac || !validRoll(action.roll)) return state
  const attack = item.card.monsterAttack ?? { bonus: 9, damage: 1 }
  const result = rollAgainst(target, action.roll, { ...attack, miss: 0 })
  let next = spendItem(state, hero.id, item.id, 'discard')
  next = withLog(
    next,
    `${hero.name}'s ${item.name}: the ${monster.name} attacked the ${target.name}, rolled ${action.roll} + ${attack.bonus} = ${result.total} against AC ${target.ac}. ${result.outcome}`,
  )
  const hurt = hurtMonster(next, target, result.dealt)
  const won = defeatDetails(hurt.state, hurt.defeated ? [target] : [], hero.id)
  return withMoment(won.state, {
    kind: hurt.defeated ? 'defeat' : 'roll',
    heroId: hero.id,
    title: `The ${monster.name} attacks the ${target.name}!`,
    detail: won.details.join(' '),
    rolls: [{ monsterId: target.id, label: target.name, value: action.roll, total: result.total, ac: target.ac, hit: result.hit, outcome: result.outcome }],
  })
}

// Each hero card names one power the hero always has (Keyleth's Lay on Hands, Tarak's
// Furious Assault), plus 1 utility, 2 at-wills, and 1 daily to choose. Most fixed powers
// are utilities. A template sets its own `powerSlots` when its fixed power is another
// type (Heskan's Hurled Breath and Vistra's Dwarven Resilience are dailies).
export const STARTING_POWER_SLOTS = ['at-will', 'at-will', 'utility', 'utility', 'daily']

export const powerSlotsFor = (template) => template.powerSlots ?? STARTING_POWER_SLOTS

// The card is copied into the game, so later edits to the card file don't change a game in progress.
const copyCard = (card) =>
  card
    ? {
        id: String(card.id),
        name: String(card.name),
        text: String(card.text ?? ''),
        attack: card.attack ? String(card.attack) : '',
        damage: card.damage ? String(card.damage) : '',
      }
    : null

const updateClaim = (state, deviceId, change) => ({
  ...state,
  lobby: (state.lobby ?? []).map((claim) => (claim.deviceId === deviceId ? { ...claim, ...change(claim) } : claim)),
})

// Turns the lobby into heroes, in the order they were claimed.
// Fills a new hero's power slots with picked cards, in slot order.
const withPicks = (hero, picks = []) => ({
  ...hero,
  powers: hero.powers.map((power, i) => {
    const card = copyCard(picks[i])
    return card ? { ...power, name: card.name, card } : power
  }),
})

// True when another slot already holds this card, so no hero gets the same power twice.
const pickedElsewhere = (cards, slot, card) => Boolean(card) && cards.some((c, i) => i !== slot && c?.id === card.id)

function heroesFromLobby(lobby) {
  return lobby.flatMap((claim) => {
    const template = HERO_TEMPLATES.find((t) => t.key === claim.heroKey)
    if (!template) return []
    return [{ ...withPicks(createHero(template), claim.picks), player: claim.player }]
  })
}

const POWER_LABELS = { 'at-will': 'At-will power', utility: 'Utility power', daily: 'Daily power' }

const newPower = (type, name = POWER_LABELS[type] ?? 'Power') => ({ id: newId('power'), type, name, used: false, card: null })

export function createHero(template, overrides = {}) {
  const hero = { ...template, ...overrides }
  return {
    id: newId('hero'),
    key: hero.key,
    name: hero.name,
    className: hero.className,
    color: hero.color,
    maxHp: hero.maxHp,
    hp: hero.maxHp,
    ac: hero.ac,
    surgeValue: hero.surgeValue,
    speed: hero.speed,
    level: 1,
    conditions: [],
    // Power tokens (Mirror Image, Blade Barrier, Flaming Sphere) and markers (invisible, refuge).
    tokens: {},
    shieldedBy: null, // the cleric whose Cleric's Shield gives this hero +2 AC
    powers: powerSlotsFor(hero).map((type) => newPower(type)),
  }
}

export function gameReducer(state, action) {
  switch (action.type) {
    case 'NEW_GAME':
      return initialState

    case 'START_GAME': {
      // Without a hero list, the heroes come from the lobby.
      // Everyone in the lobby has to be ready first.
      if (!action.heroes && !(state.lobby ?? []).every((c) => c.ready)) return state
      const heroes = action.heroes ?? heroesFromLobby(state.lobby ?? [])
      if (state.status !== 'setup' || heroes.length === 0) return state
      const started = { ...initialState, status: 'playing', heroes }
      return dealStartingTreasure(
        withLog(started, `The adventure begins with ${heroes.map((h) => h.name).join(', ')}.`),
        action.treasureCards,
        action.random,
      )
    }

    case 'CLAIM_HERO': {
      const template = HERO_TEMPLATES.find((t) => t.key === action.heroKey)
      const lobby = state.lobby ?? []
      if (state.status !== 'setup' || !template || !action.deviceId) return state
      // One hero per iPad, and nobody can take a hero another iPad already has.
      if (lobby.some((c) => c.heroKey === template.key && c.deviceId !== action.deviceId)) return state
      const previous = lobby.find((c) => c.deviceId === action.deviceId)
      const slots = powerSlotsFor(template)
      const picks = slots.map((_, i) => copyCard(action.picks?.[i]))
      const claim = { deviceId: action.deviceId, heroKey: template.key, player: previous?.player ?? '', picks, ready: false }
      return { ...state, lobby: [...lobby.filter((c) => c.deviceId !== action.deviceId), claim] }
    }

    case 'RELEASE_HERO':
      return { ...state, lobby: (state.lobby ?? []).filter((c) => c.deviceId !== action.deviceId) }

    case 'SET_LOBBY_PLAYER':
      return updateClaim(state, action.deviceId, (claim) => {
        const player = String(action.player ?? '').slice(0, 40)
        // A player can't stay ready without a name; the turn screens greet them by it.
        return { player, ready: claim.ready && player.trim() !== '' }
      })

    case 'SET_LOBBY_PICK': {
      const claim = (state.lobby ?? []).find((c) => c.deviceId === action.deviceId)
      if (claim && pickedElsewhere(claim.picks, action.slot, action.card)) return state
      return updateClaim(state, action.deviceId, (claim) => ({
        picks: claim.picks.map((card, i) => (i === action.slot ? copyCard(action.card) : card)),
        ready: false,
      }))
    }

    case 'SET_LOBBY_READY':
      return updateClaim(state, action.deviceId, (claim) => ({ ready: Boolean(action.ready) && claim.player.trim() !== '' }))

    case 'START_DEMO': {
      // A game already in progress, for trying features without setting one up:
      // every hero, a few monsters, some XP, and a hero with a condition.
      // `picks` gives each hero's starting cards by hero key (the rulebook's suggestions).
      const heroes = HERO_TEMPLATES.map((t) => ({ ...withPicks(createHero(t), action.picks?.[t.key]), player: '' }))
      heroes[1] = { ...heroes[1], hp: heroes[1].maxHp - 3 }
      heroes[3] = { ...heroes[3], conditions: ['Poisoned'] }
      const monster = (name, hp, xp, owner) => ({
        id: newId('monster'), name, maxHp: hp, hp, xp, ownerId: heroes[owner].id, conditions: [],
      })
      let demo = {
        ...initialState,
        status: 'playing',
        heroes,
        monsters: [monster('Kobold Dragonshield', 2, 1, 0), monster('Orc Smasher', 2, 2, 2), monster('Grell', 2, 2, 4)],
        xp: 3,
        turn: { ...initialState.turn, round: 2 },
      }
      // With monster cards, the demo's monsters come off the virtual deck instead.
      if (action.monsterCards?.length > 0) {
        demo = { ...demo, monsters: [], monsterDeck: buildDeck(action.monsterCards, action.random) }
        for (const owner of [0, 2, 4]) demo = drawMonster(demo, heroes[owner].id, action.random)
        demo = { ...demo, log: [], moment: null }
      }
      return dealStartingTreasure(withLog(demo, 'A demo game begins. Nothing here is your real game.'), action.treasureCards, action.random)
    }

    case 'ADJUST_HP': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      if (!hero) return state
      const next = updateHero(state, hero.id, (h) => ({ hp: clamp(h.hp + action.amount, 0, h.maxHp) }))
      if (hero.hp === 0 || next.heroes.find((h) => h.id === hero.id).hp !== 0) return next
      return withMoment(withLog(next, `${hero.name} is down!`), {
        kind: 'down',
        heroId: hero.id,
        title: `${hero.name} is down!`,
        detail: state.surges > 0 ? 'Spend a healing surge at the start of your turn.' : 'No healing surges left!',
      })
    }

    case 'ROLL_DIE': {
      const value = Number(action.value)
      if (!Number.isInteger(value) || value < 1 || value > 20) return state
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const who = hero ? heroLabel(hero) : 'Someone'
      const kind = value === 20 ? 'crit' : value === 1 ? 'fumble' : 'roll'
      const title = kind === 'crit' ? 'NATURAL 20!' : kind === 'fumble' ? 'Oops… a 1' : `${who} rolled ${value}`
      return withMoment(withLog(state, `${who} rolled a ${value}.`), {
        kind,
        heroId: hero?.id ?? null,
        value,
        title,
        detail: kind === 'crit' ? `${who} rolled a critical hit!` : kind === 'fumble' ? `${who} rolled a 1.` : '',
      })
    }

    case 'USE_SURGE': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      if (!hero) return state
      if (state.surges <= 0) {
        return withLog({ ...state, status: 'lost' }, `${hero.name} fell with no healing surges left.`)
      }
      const healed = updateHero({ ...state, surges: state.surges - 1 }, hero.id, (h) => ({
        hp: Math.min(h.maxHp, h.surgeValue),
      }))
      return withLog(healed, `${hero.name} used a healing surge.`)
    }

    case 'TOGGLE_POWER':
      return updateHero(state, action.heroId, (hero) => ({
        powers: hero.powers.map((p) =>
          p.id === action.powerId && p.type !== 'at-will' ? { ...p, used: !p.used } : p,
        ),
      }))

    case 'SET_POWER_CARD': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const slot = hero?.powers.findIndex((p) => p.id === action.powerId)
      if (hero && pickedElsewhere(hero.powers.map((p) => p.card), slot, action.card)) return state
      const card = copyCard(action.card)
      return updateHero(state, action.heroId, (hero) => ({
        powers: hero.powers.map((p) =>
          p.id === action.powerId ? { ...p, card, name: card ? card.name : POWER_LABELS[p.type] ?? 'Power' } : p,
        ),
      }))
    }

    case 'RENAME_POWER':
      return updateHero(state, action.heroId, (hero) => ({
        powers: hero.powers.map((p) => (p.id === action.powerId ? { ...p, name: action.name } : p)),
      }))

    case 'ADD_POWER':
      return updateHero(state, action.heroId, (hero) => ({
        powers: [...hero.powers, newPower(action.powerType, action.name)],
      }))

    case 'TOGGLE_HERO_CONDITION':
      return updateHero(state, action.heroId, (hero) => ({ conditions: toggle(hero.conditions, action.condition) }))

    case 'LEVEL_UP': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      if (!hero || hero.level >= 2 || state.xp < XP_TO_LEVEL_UP || state.turn.natural20 !== hero.id) return state
      return levelUp({ ...state, xp: state.xp - XP_TO_LEVEL_UP }, hero)
    }

    case 'ADD_MONSTER': {
      const monster = {
        id: newId('monster'),
        name: action.name,
        maxHp: action.hp,
        hp: action.hp,
        xp: action.xp,
        ownerId: action.ownerId,
        conditions: [],
      }
      return withLog({ ...state, monsters: [...state.monsters, monster] }, `${monster.name} appeared!`)
    }

    case 'DRAW_MONSTER': {
      // The deck is built from the card file the first time anyone draws.
      const withDeck = state.monsterDeck ? state : { ...state, monsterDeck: buildDeck(action.cards, action.random) }
      return drawMonster(withDeck, action.heroId, action.random)
    }

    case 'MONSTER_ATTACK':
      return monsterAttack(state, action)

    case 'HERO_ATTACK':
      return heroAttack(state, action)

    case 'REROLL_ATTACK':
      return rerollAttack(state, action)

    case 'ATTACK_FOLLOW_UP':
      return attackFollowUp(state, action)

    case 'POWER_DAMAGE':
      return powerDamage(state, action)

    case 'USE_POWER':
      return usePower(state, action)

    case 'DODGE_HIT':
      return dodgeHit(state, action)

    case 'ATTACH_MONSTER_CARDS': {
      // Monsters added before the deck existed get their card, so they can take guided
      // turns and be attacked against their AC. Matched by name.
      const cards = Array.isArray(action.cards) ? action.cards : []
      let changed = false
      const monsters = state.monsters.map((monster) => {
        const card = !monster.card && cards.find((c) => c.name.toLowerCase() === monster.name.toLowerCase())
        if (!card) return monster
        changed = true
        const { id, hp, maxHp, ownerId, conditions } = monster
        return { ...monsterFromCard(card, ownerId), id, hp: Math.min(hp, card.hp * (card.figures ?? 1)), maxHp: Math.max(maxHp, card.hp), conditions }
      })
      return changed ? { ...state, monsters } : state
    }

    case 'SET_EXPLORED': {
      // The Exploration Phase's question: is the hero on an unexplored edge? With no
      // new tile the phase is over, and the Villain Phase knows to draw an encounter.
      if (PHASES[state.turn.phase]?.key !== 'exploration') return state
      const explored = Boolean(action.explored)
      // Skipping ahead ends the Exploration Phase, so its curse rolls happen now.
      const ended = explored ? state : endPhaseCurses(state, state.heroes[state.turn.heroIndex], 'exploration', action.rolls)
      return { ...ended, turn: { ...ended.turn, explored, phase: explored ? ended.turn.phase : ended.turn.phase + 1 } }
    }

    case 'ADJUST_MONSTER_HP':
      return updateMonster(state, action.monsterId, (m) => ({ hp: clamp(m.hp + action.amount, 0, m.maxHp) }))

    case 'TOGGLE_MONSTER_CONDITION':
      return updateMonster(state, action.monsterId, (m) => ({ conditions: toggle(m.conditions, action.condition) }))

    case 'DEFEAT_MONSTER': {
      const monster = state.monsters.find((m) => m.id === action.monsterId)
      if (!monster) return state
      // One treasure card per turn, for the first monster defeated.
      const treasure = !state.turn.treasureDrawn
      const winner = action.heroId ?? state.heroes[state.turn.heroIndex]?.id ?? null
      const next = {
        ...state,
        xp: state.xp + monster.xp,
        monsters: state.monsters.filter((m) => m.id !== monster.id),
        turn: { ...state.turn, treasureDrawn: true, treasureOwed: treasure ? winner : state.turn.treasureOwed ?? null },
      }
      return withMoment(withLog(next, `The ${monster.name} was defeated! +${monster.xp} XP`), {
        kind: 'defeat',
        title: `${monster.name} defeated!`,
        detail: `+${monster.xp} XP for the party${treasure ? '. Draw a treasure card!' : ''}`,
      })
    }

    case 'REMOVE_MONSTER': {
      const monster = state.monsters.find((m) => m.id === action.monsterId)
      if (!monster) return state
      return discardMonsterCard({ ...state, monsters: state.monsters.filter((m) => m.id !== monster.id) }, monster)
    }

    case 'ADJUST_XP':
      return { ...state, xp: Math.max(0, state.xp + action.amount) }

    case 'CANCEL_ENCOUNTER': {
      // Perseverance takes 1 XP off the cost for each hero on Quinn's tile.
      const p = action.perseverance
      const hero = p && state.heroes.find((h) => h.id === p.heroId)
      const power = hero?.powers.find((x) => x.id === p.powerId)
      const helps = power && !power.used && effectsOf(power).reaction === 'perseverance'
      const cost = helps ? Math.max(0, XP_TO_CANCEL_ENCOUNTER - clamp(Number(p.heroesOnTile) || 0, 1, state.heroes.length)) : XP_TO_CANCEL_ENCOUNTER
      if (state.xp < cost || (p && !helps) || state.encounter?.attacked) return state
      let next = helps ? markUsed(state, hero.id, power.id) : state
      next = { ...next, xp: next.xp - cost }
      const how = helps ? ' with Perseverance' : ''
      if (!state.encounter) return withLog(next, `Spent ${cost} XP to cancel an encounter${how}.`)
      next = discardEncounterCard({ ...next, encounter: null }, state.encounter.cardId)
      return withLog(next, `Spent ${cost} XP to cancel ${state.encounter.card.name}${how}.`)
    }

    case 'DRAW_ENCOUNTER':
      return drawEncounter(state, action)

    case 'ENCOUNTER_ATTACK': {
      const encounter = state.encounter
      if (!encounter?.card.attack || encounter.attacked) return state
      const next = attackHeroes(state, {
        who: encounter.card.name,
        attack: encounter.card.attack,
        targets: action.targets,
        tileGuarded: action.tileGuarded,
        moment: { title: `${encounter.card.name}!` },
      })
      return next === state ? state : { ...next, encounter: { ...encounter, attacked: true } }
    }

    case 'RESOLVE_ENCOUNTER':
      return resolveEncounter(state, action)

    case 'FILTER_ENCOUNTER_MONSTERS': {
      // Spotted! stacks the monster deck before its monster is drawn, so that draw comes
      // off the stacked deck. After this the card can't be cancelled.
      const encounter = state.encounter
      if (!encounter?.card.filterMonsters || encounter.filtered) return state
      const next = filterMonsterDeck(state, encounter.card.filterMonsters, action.random, action.monsterCards)
      return { ...next, encounter: { ...encounter, filtered: true, attacked: true } }
    }

    case 'REDRAW_ENCOUNTER': {
      // A trap or hazard on a tile that already has a marker: discard it and draw a new one.
      const encounter = state.encounter
      if (!encounter || encounter.attacked) return state
      const next = discardEncounterCard({ ...state, encounter: null }, encounter.cardId)
      return withLog(
        { ...next, turn: { ...next.turn, encountersOwed: (next.turn.encountersOwed ?? 0) + 1 } },
        `That tile already has a marker, so ${encounter.card.name} was discarded.`,
      )
    }

    case 'TRAP_ATTACK': {
      const trap = (state.traps ?? []).find((t) => t.id === action.trapId)
      if (!trap?.card.trap?.attack) return state
      return attackHeroes(state, {
        who: `The ${trap.name}`,
        attack: trap.card.trap.attack,
        targets: action.targets,
        tileGuarded: action.tileGuarded,
        moment: { title: `${trap.name}!` },
      })
    }

    case 'TRAP_DAMAGE': {
      const trap = (state.traps ?? []).find((t) => t.id === action.trapId)
      const damage = trap?.card.trap?.damage ?? 0
      const heroIds = Array.isArray(action.heroIds) ? action.heroIds : []
      if (!damage || heroIds.length === 0) return state
      const { next, downed } = damageHeroes(state, heroIds, damage, `the ${trap.name}`)
      return withMoment(next, {
        kind: downed.length > 0 ? 'monster-down' : 'monster',
        title: `${trap.name}!`,
        detail: downed.length > 0 ? `${downed.join(' and ')} ${downed.length > 1 ? 'are' : 'is'} down!` : `${damage} damage`,
      })
    }

    case 'DISABLE_TRAP': {
      // Instead of attacking, a hero on the trap's tile rolls to disable it (Kobold Trappers makes it harder).
      const trap = (state.traps ?? []).find((t) => t.id === action.trapId && t.type === 'trap')
      const hero = state.heroes.find((h) => h.id === action.heroId)
      if (!trap || !hero || !validRoll(action.roll)) return state
      const penalty = state.environment?.card?.trapPenalty ?? 0
      const tools = itemTrapBonus(hero)
      const total = action.roll - penalty + tools
      const target = trap.card.trap?.disable ?? 10
      const disabled = total >= target
      const sum = penalty || tools ? `${action.roll}${tools ? ` + ${tools}` : ''}${penalty ? ` − ${penalty}` : ''} = ${total}` : `${action.roll}`
      let next = withLog(state, `${hero.name} rolled ${sum} to disable the ${trap.name} (needed ${target}).${disabled ? ' Disabled!' : ''}`)
      if (disabled) next = discardEncounterCard({ ...next, traps: next.traps.filter((t) => t.id !== trap.id) }, trap.cardId)
      return withMoment(next, {
        kind: disabled ? 'defeat' : 'roll',
        heroId: hero.id,
        value: action.roll,
        title: disabled ? `${trap.name} disabled!` : `The ${trap.name} is still there`,
        detail: `${hero.name} needed ${target}${penalty ? ` after the −${penalty}` : ''}.`,
      })
    }

    case 'REMOVE_TRAP': {
      const trap = (state.traps ?? []).find((t) => t.id === action.trapId)
      if (!trap) return state
      return withLog(discardEncounterCard({ ...state, traps: state.traps.filter((t) => t.id !== trap.id) }, trap.cardId), `The ${trap.name} marker was removed.`)
    }

    case 'CURSE_ROLL': {
      // A curse the hero can try to end with a roll instead of attacking (opening the Cage).
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const curse = hero?.curses?.find((c) => c.id === action.curseId)
      const removeRoll = curse?.card?.removeRoll
      if (!removeRoll || removeRoll.phase !== 'action' || !validRoll(action.roll)) return state
      const broken = action.roll >= removeRoll.target
      const next = broken
        ? removeCurse(state, hero.id, curse.id, `${hero.name} rolled ${action.roll} and is free of the ${curse.name}!`)
        : withLog(state, `${hero.name} rolled ${action.roll} against the ${curse.name} (needed ${removeRoll.target}).`)
      return withMoment(next, {
        kind: broken ? 'defeat' : 'roll',
        heroId: hero.id,
        value: action.roll,
        title: broken ? `Free of the ${curse.name}!` : `Still stuck in the ${curse.name}`,
        detail: `${hero.name} needed ${removeRoll.target}.`,
      })
    }

    case 'REMOVE_CURSE': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const curse = hero?.curses?.find((c) => c.id === action.curseId)
      return curse ? removeCurse(state, hero.id, curse.id, `${hero.name}'s ${curse.name} curse is over.`) : state
    }

    case 'SET_MONSTER_OWNER': {
      // Warp in Time and High Alert pass monster cards between heroes.
      const owner = state.heroes.find((h) => h.id === action.ownerId)
      const monster = state.monsters.find((m) => m.id === action.monsterId)
      if (!owner || !monster) return state
      return withLog(updateMonster(state, monster.id, () => ({ ownerId: owner.id })), `The ${monster.name} now belongs to ${owner.name}.`)
    }

    case 'DRAW_TREASURE':
      return drawTreasure(state, action)

    case 'KEEP_TREASURE':
      return keepTreasure(state, action)

    case 'USE_ITEM':
      return useItem(state, action)

    case 'MONSTER_CONTROL':
      return monsterControl(state, action)

    case 'TOGGLE_ITEM':
      // A flipped item flipped back by hand, or the other way.
      return updateHero(state, action.heroId, (hero) => ({
        items: heroItems(hero).map((i) => (i.id === action.itemId ? { ...i, used: !i.used } : i)),
      }))

    case 'DISCARD_ITEM': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const item = heroItems(hero).find((i) => i.id === action.itemId)
      return item ? withLog(spendItem(state, hero.id, item.id, 'discard'), `${hero.name} discarded the ${item.name}.`) : state
    }

    case 'SET_TRIANGLE':
      // The Villain Phase's question: does the new tile have a black triangle?
      return { ...state, turn: { ...state.turn, triangle: Boolean(action.triangle) } }


    case 'ADJUST_SURGES':
      return { ...state, surges: Math.max(0, state.surges + action.amount) }

    case 'NEXT_PHASE': {
      const { heroIndex, phase, round } = state.turn
      if (phase < PHASES.length - 1) {
        const ended = endPhaseCurses(state, state.heroes[heroIndex], PHASES[phase].key, action.rolls)
        const next = { ...ended, turn: { ...ended.turn, phase: phase + 1 } }
        return PHASES[phase].key === 'hero' ? endHeroPhase(next, next.heroes[heroIndex], action.roll) : next
      }
      // An encounter or treasure card has to be finished before the turn moves on.
      if (state.encounter || state.treasure) return state
      const nextIndex = (heroIndex + 1) % state.heroes.length
      return startTurn({
        ...endPhaseCurses(state, state.heroes[heroIndex], 'villain', action.rolls),
        turn: { heroIndex: nextIndex, phase: 0, round: nextIndex === 0 ? round + 1 : round },
      })
    }

    case 'PREVIOUS_PHASE': {
      const { heroIndex, phase, round } = state.turn
      if (phase > 0) return { ...state, turn: { ...state.turn, phase: phase - 1 } }
      if (heroIndex === 0 && round === 1) return state
      const prevIndex = (heroIndex - 1 + state.heroes.length) % state.heroes.length
      return {
        ...state,
        turn: { heroIndex: prevIndex, phase: PHASES.length - 1, round: prevIndex === state.heroes.length - 1 ? round - 1 : round },
      }
    }

    case 'END_GAME':
      return withLog({ ...state, status: action.result }, action.result === 'won' ? 'Victory!' : 'The party was defeated.')

    case 'RESUME':
      return { ...state, status: 'playing' }

    default:
      return state
  }
}
