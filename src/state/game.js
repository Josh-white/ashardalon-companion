import {
  HERO_TEMPLATES,
  LEVEL_STATS,
  MAX_LEVEL,
  STARTING_SURGES,
  addedSlot,
  hasAbility,
  statsAtLevel,
  templateFor,
  XP_TO_CANCEL_ENCOUNTER,
  XP_TO_LEVEL_UP,
} from '../data/heroes.js'
import { monsterArt } from '../data/art.js'
import { PHASES } from '../data/phases.js'
import { heroItems, itemAttackBonus, itemTrapBonus, tileAcBonus } from '../data/items.js'
import { effectsOf, heroAc, heroAttackPenalty, maxRolls } from '../data/powerEffects.js'
import { STARTING_TILES, MAX_TILES, MIN_TILES, adjustTiles, bottomToTop, buildTileStack, takeTile } from './tiles.js'
import { DOOR_KINDS, DOOR_UNLOCK_ROLL, MAX_SURGES, MIN_SURGES, aliveVillagers, checkVictory, countDefeat, escapeBlockers, isPlayable, newAdventure, objectiveInPlay, onceOnlyDraw, playableChambers, revealsReady, showStory, takeToken, villagerForRoll } from './adventure.js'
import { trackStats } from './stats.js'
import { campaignHero, campaignOutcome, campaignSurges, isCampaign, newCampaign, shopCards, shopSize } from './campaign.js'
import { playBoardSound, setBoardOff, setBoardUnlimited } from './soundboard.js'
import { newFirstRoll, rollFirst } from './firstRoll.js'
import { moveHero, moveToken, newBoard, pruneTokens } from '../board/play.js'

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
  // Villains an adventure put on the board. A defeated villain stays here with
  // defeated: true, so an adventure can tell it was beaten.
  villains: [],
  adventure: null, // the adventure being played (state/adventure.js), or null for a free game
  // Chosen on the projector before the game: the adventure card and how many healing surges.
  lobbyAdventure: null,
  lobbySurges: STARTING_SURGES,
  // The virtual treasure deck, built on the first treasure draw.
  treasureDeck: null,
  treasure: null, // the treasure card just drawn, waiting for a hero to take it: { id, cardId, heroId, card }
  // Villagers a chamber put on the board (Free the Captives). A villager killed by a
  // monster stays here with removed: true, so its roll range activates no one.
  villagers: [],
  // Adventure encounter cards waiting to go into the encounter deck at the next draw:
  // an id goes into the top 3 cards, { id, top: true } on top.
  encounterAdds: [],
  // Cards that go back on top of the deck right after the next draw (Ceremony Progresses!).
  encounterAfter: [],
  // The dungeon tile stack (state/tiles.js): { stack: ['' | special tile name], drawn }, top first.
  tileStack: null,
  lobbyTiles: STARTING_TILES,
  soundboard: null, // the players' sound board (state/soundboard.js): { off, last, turn, used }
  stats: {}, // each hero's bragging rights for the end-of-game recap (state/stats.js), by hero id
  // A campaign (state/campaign.js) lasts across games: New game keeps it until it's over.
  campaign: null,
  // Treasure tokens left in a campaign adventure's stack: { gold, treasure }.
  tokenStack: null,
  // The roll for first turn at the start of a game (state/firstRoll.js), or null.
  firstRoll: null,
  // The virtual board for a solo game (board/play.js), or null when the real tiles are on the table.
  board: null,
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

// A power used outside an attack (healing, a token, a dodge), so screens can play its sound.
const withCast = (state, power) => ({ ...state, cast: { id: newId('cast'), at: Date.now(), power: power.name } })

const heroLabel = (hero) => hero.player || hero.name

const updateHero = (state, heroId, change) => ({
  ...state,
  heroes: state.heroes.map((hero) => (hero.id === heroId ? { ...hero, ...change(hero) } : hero)),
})

const updateMonster = (state, monsterId, change) => {
  const update = (list) => list.map((monster) => (monster.id === monsterId ? { ...monster, ...change(monster) } : monster))
  return state.villains?.some((v) => v.id === monsterId)
    ? { ...state, villains: update(state.villains) }
    : { ...state, monsters: update(state.monsters) }
}

// Villains still on the board. Heroes attack them like monsters, and they take turns like monsters.
export const activeVillains = (state) => (state.villains ?? []).filter((v) => !v.defeated)
// Everything a hero can attack: the monsters, then the villains.
export const foes = (state) => [...state.monsters, ...activeVillains(state)]
const findFoe = (state, id) => foes(state).find((m) => m.id === id)

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
  // Adventure cards wait outside the deck until something adds them.
  const ids = cards.filter((card) => !card.adventure).flatMap((card) => Array.from({ length: card.copies ?? 1 }, () => card.id))
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
  // Some adventures allow a monster card only once; a later copy is discarded with no replacement.
  const once = onceOnlyDraw(next, card)
  next = once.state
  if (once.discard) {
    const exploring = PHASES[next.turn.phase]?.key === 'exploration' && next.heroes[next.turn.heroIndex]?.id === hero.id
    next = { ...next, monsterDeck: { ...deck, draw, discard }, turn: exploring ? { ...next.turn, monsterDrawn: true } : next.turn }
    return withLog(next, `Drew another ${card.name} card. This adventure has just one, so it's discarded and no monster comes this time.`)
  }
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
    art: monsterArt(monster),
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
  const monster = findFoe(state, action.monsterId)
  // A table of attacks (the Gauth's eye ray): the device's roll picks which one.
  const table = validRoll(action.tableRoll) && monster?.card?.attacks.filter((a) => a.group === action.attackId)
  const attack = table?.length
    ? table.find((a) => action.tableRoll >= a.roll[0] && action.tableRoll <= a.roll[1])
    : monster?.card?.attacks.find((a) => a.id === action.attackId)
  const all = (Array.isArray(action.targets) ? action.targets : []).filter((t) => validRoll(t?.roll))
  // Villagers count as heroes for monster tactics, so a monster can attack them too.
  const villagerTargets = all.filter((t) => aliveVillagers(state).some((v) => v.id === t.heroId))
  let targets = all.filter((t) => state.heroes.some((h) => h.id === t.heroId))
  if (!attack || targets.length + villagerTargets.length === 0) return state

  let next = table?.length ? withLog(state, `The ${monster.name} rolled ${action.tableRoll} for its ${action.attackId.replace(/-/g, ' ')}: ${attack.name}!`) : state
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
    results.push({ heroId: hero.id, value: roll, total, ac, hit, dealt: hero.hp - hp, miss: attack.miss, conditions, effect: attack.effect })
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
  for (const { heroId, roll } of villagerTargets) {
    const villager = next.villagers.find((v) => v.id === heroId)
    const total = roll + attack.bonus
    const hit = total >= villager.ac
    const damage = hit ? attack.damage : attack.miss
    const hp = clamp(villager.hp - damage, 0, villager.maxHp)
    const outcome = hit ? `Hit! ${damage} damage` : damage > 0 ? `Miss, but ${damage} damage` : 'Miss!'
    rolls.push({ heroId: villager.id, value: roll, total, ac: villager.ac, hit, outcome })
    results.push({ heroId: villager.id, villager: true, value: roll, total, ac: villager.ac, hit, dealt: villager.hp - hp, miss: attack.miss, conditions: [], effect: attack.effect })
    next = withLog(next, `The ${monster.name} attacked the villager ${villager.name} with its ${attack.name}: rolled ${roll} + ${attack.bonus} = ${total} against AC ${villager.ac}. ${outcome}`)
    next = hurtVillager(next, villager, hp)
    if (hp === 0) downed.push(villager.name)
  }
  // Remembered so Tumbling Escape can turn a hit into a miss.
  next = { ...next, turn: { ...next.turn, lastMonsterAttack: { monsterId: monster.id, attackId: attack.id, tableRoll: table?.length ? action.tableRoll : null, results } } }
  for (const name of downed) next = withLog(next, `${name} is down!`)
  if (next.status === 'lost') return next
  return withMoment(next, {
    kind: downed.length > 0 ? 'monster-down' : 'monster',
    monsterId: monster.id,
    art: monsterArt(monster),
    title: `${monster.name}: ${attack.name}!`,
    detail: downed.length > 0 ? `${downed.join(' and ')} ${downed.length > 1 ? 'are' : 'is'} down!` : '',
    rolls,
  })
}

// A villager's HP after a hit. At 0 the villager is gone: its token comes off the board.
// When the last villager is gone, the heroes lose (Free the Captives).
function hurtVillager(state, villager, hp) {
  let next = { ...state, villagers: state.villagers.map((v) => (v.id === villager.id ? { ...v, hp, removed: hp === 0 } : v)) }
  if (hp > 0 || villager.removed) return next
  next = withLog(next, `The villager ${villager.name} is gone. Take the token off the board.`)
  if (aliveVillagers(next).length > 0) return next
  const lost = withLog({ ...next, status: 'lost' }, 'The last villager is gone. The heroes lose.')
  return withMoment(showStory(lost, 'The captives are lost', 'The last villager has fallen. There is no one left to rescue, and the heroes lose.'), {
    kind: 'down',
    title: 'The last villager is gone!',
    detail: 'The heroes lose.',
  })
}

// Puts villager tokens in a chamber: `n` villager cards drawn at random (all of them when n is 0).
function placeVillagers(state, cards, n, random = []) {
  const list = Array.isArray(cards) ? cards : []
  if (list.length === 0) return withLog(state, 'The app has no villager cards, so place the villagers from the real cards.')
  const drawn = shuffle(list, random).slice(0, n > 0 ? n : list.length)
  const villagers = drawn.map((card) => ({ id: newId('villager'), cardId: card.id, name: card.name, hp: card.hp, maxHp: card.hp, ac: card.ac, removed: false, card }))
  return withLog({ ...state, villagers: [...(state.villagers ?? []), ...villagers] }, `Villagers in the chamber: ${villagers.map((v) => v.name).join(', ')}.`)
}

// The end of a Hero Phase with villagers in play: the d20 says which one acts.
function villagerRoll(state, action) {
  const hero = state.heroes[state.turn.heroIndex]
  if (!hero || PHASES[state.turn.phase]?.key !== 'hero' || state.turn.villagerRoll || aliveVillagers(state).length === 0 || !validRoll(action.roll)) return state
  const villager = villagerForRoll(state, action.roll)
  const next = withLog(
    { ...state, turn: { ...state.turn, villagerRoll: { roll: action.roll, villagerId: villager?.id ?? null, attacked: false } } },
    villager ? `${hero.name} rolled ${action.roll}: the villager ${villager.name} acts.` : `${hero.name} rolled ${action.roll}: no villager acts.`,
  )
  return withMoment(next, {
    kind: 'roll',
    heroId: hero.id,
    value: action.roll,
    title: villager ? `${villager.name} acts!` : 'No villager acts',
    detail: villager ? 'Follow the villager card.' : 'That villager is no longer in play.',
  })
}

// A villager's punch at a monster, rolled on the device.
function villagerAttack(state, action) {
  const turnRoll = state.turn.villagerRoll
  const villager = aliveVillagers(state).find((v) => v.id === action.villagerId)
  const monster = findFoe(state, action.monsterId)
  const attack = villager?.card.attack
  if (!turnRoll || turnRoll.attacked || turnRoll.villagerId !== villager?.id || !attack || !monster || monster.objective || !validRoll(action.roll)) return state
  const total = action.roll + attack.bonus
  const hit = total >= monster.ac
  let next = withLog(
    { ...state, turn: { ...state.turn, villagerRoll: { ...turnRoll, attacked: true } } },
    `${villager.name} punched the ${monster.name}: rolled ${action.roll} + ${attack.bonus} = ${total} against AC ${monster.ac}. ${hit ? `Hit! ${attack.damage} damage` : 'Miss!'}`,
  )
  let defeated = false
  if (hit) ({ state: next, defeated } = hurtMonster(next, monster, attack.damage))
  return withMoment(next, {
    kind: defeated ? 'defeat' : 'roll',
    value: action.roll,
    title: hit ? `${villager.name} hits the ${monster.name}!` : `${villager.name} misses`,
    detail: defeated ? `The ${monster.name} is defeated!` : hit ? `${attack.damage} damage.` : `Needed ${monster.ac} or more.`,
  })
}

// An attack on one or more heroes, from a monster, an encounter card or a trap. Each
// target comes with the d20 the device rolled for it. A hit deals the damage and
// conditions; a miss deals the miss damage (and any miss conditions).
// `source` ({ kind: 'encounter' } or { kind: 'trap', trapId }) is remembered for Practiced Evasion.
function attackHeroes(state, { who, attack, targets: list, moment, tileGuarded, source }) {
  const targets = (Array.isArray(list) ? list : []).filter(
    (t) => state.heroes.some((h) => h.id === t.heroId) && validRoll(t.roll),
  )
  if (!attack || targets.length === 0) return state

  let next = state
  const rolls = []
  const results = []
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
    results.push({ heroId: hero.id, hit, dealt: hero.hp - hp, conditions, miss: attack.miss, missConditions: attack.missConditions ?? [] })
    next = withLog(next, `${who} attacked ${hero.name}: rolled ${roll} + ${attack.bonus} = ${total} against AC ${ac}. ${outcome}`)
    // Each miss against Mirror Image pops one of the images.
    if (!hit && hero.tokens?.mirrorImage > 0) {
      next = updateHero(next, hero.id, (h) => ({ tokens: { ...h.tokens, mirrorImage: h.tokens.mirrorImage - 1 } }))
      next = withLog(next, `One of ${hero.name}'s mirror images vanished.`)
    }
  }
  if (source) next = { ...next, turn: { ...next.turn, lastEventAttack: { ...source, results } } }
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

// Shuffles a card in among the top 3 cards of the encounter deck ("shuffle this card with
// the top 3 Encounter Cards and return the 4 cards to the top of the deck").
function intoTopThree(deck, cardId, card, random = []) {
  const r = Number(random[0])
  const slot = Math.floor((Number.isFinite(r) && r >= 0 && r < 1 ? r : 0) * (Math.min(3, deck.draw.length) + 1))
  const draw = deck.draw.filter((id) => id !== cardId)
  return { ...deck, cards: { ...deck.cards, [cardId]: deck.cards[cardId] ?? card }, draw: [...draw.slice(0, slot), cardId, ...draw.slice(slot)], discard: deck.discard.filter((id) => id !== cardId) }
}

// Puts a card on top of the encounter deck.
function ontoTop(deck, cardId, card) {
  return { ...deck, cards: { ...deck.cards, [cardId]: deck.cards[cardId] ?? card }, draw: [cardId, ...deck.draw.filter((id) => id !== cardId)], discard: deck.discard.filter((id) => id !== cardId) }
}

function drawEncounter(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  if (!hero || state.encounter) return state
  let withDeck = state.encounterDeck ? state : { ...state, encounterDeck: buildDeck(action.cards, action.random) }
  // Cards waiting to go in, such as Ashardalon Breathes! once Ashardalon is on the board.
  const findCard = (cardId) => withDeck.encounterDeck.cards[cardId] ?? (action.cards ?? []).find((c) => c.id === cardId)
  for (const add of withDeck.encounterAdds ?? []) {
    const cardId = typeof add === 'string' ? add : add.id
    const card = findCard(cardId)
    if (!card) continue
    const deck = add.top ? ontoTop(withDeck.encounterDeck, cardId, card) : intoTopThree(withDeck.encounterDeck, cardId, card, action.random?.slice(-1))
    withDeck = { ...withDeck, encounterDeck: deck }
  }
  withDeck = { ...withDeck, encounterAdds: [] }
  const drawn = drawTop(withDeck.encounterDeck, action.random)
  if (!drawn) return withLog(state, 'There are no encounter cards left to draw.')
  const card = drawn.deck.cards[drawn.cardId]
  if (!card) return state
  // Ceremony Progresses! goes back on top once the extra card it asked for is drawn.
  let deckAfter = drawn.deck
  for (const cardId of withDeck.encounterAfter ?? []) deckAfter = ontoTop(deckAfter, cardId, findCard(cardId))
  let next = {
    ...withDeck,
    encounterAfter: [],
    encounterDeck: deckAfter,
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

// A card about a villain (Ashardalon Breathes!) or an objective (the Vast Gate) only does
// anything while it is in play; otherwise the card is just discarded.
export const villainInPlay = (state, card) =>
  (!card.villain || activeVillains(state).some((v) => v.cardId === card.villain)) && (!card.objective || objectiveInPlay(state, card.objective))

// Draws monster cards until one of a type turns up (The Vast Gate Flares!: an Aberrant) and
// gives it to the hero. The others are discarded, and so is one the hero already has.
function drawMonsterOfType(state, heroId, type, random, cards = []) {
  const hero = state.heroes.find((h) => h.id === heroId)
  let deck = state.monsterDeck ?? (cards.length > 0 ? buildDeck(cards, random) : null)
  if (!hero || !deck) return state
  const owned = new Set(state.monsters.filter((m) => m.ownerId === hero.id).map((m) => m.cardId))
  const tossed = []
  for (let tries = deck.draw.length + deck.discard.length; tries > 0; tries--) {
    const drawn = drawTop(deck, random)
    if (!drawn) break
    deck = drawn.deck
    const card = deck.cards[drawn.cardId]
    if ((card?.types ?? []).some((t) => sameName(t, type)) && !owned.has(card.id)) {
      const monster = monsterFromCard(card, hero.id)
      const next = withLog({ ...state, monsterDeck: deck, monsters: [...state.monsters, monster] }, `${tossed.length} monster card${tossed.length === 1 ? '' : 's'} discarded before ${article(card.name)} ${card.name} turned up for ${hero.name}.`)
      return withMoment(next, { kind: 'spawn', heroId: hero.id, title: `${article(card.name) === 'an' ? 'An' : 'A'} ${card.name} appears!`, detail: `It's ${hero.name}'s monster. Place its figure where the card says.` })
    }
    tossed.push(drawn.cardId)
    deck = { ...deck, discard: [...deck.discard, drawn.cardId] }
  }
  return withLog({ ...state, monsterDeck: deck }, `There's no ${type} monster card left to draw.`)
}

// One more encounter card this Villain Phase, with the reason shown on the button.
const oweEncounter = (state, why) => ({
  ...state,
  turn: { ...state.turn, encountersOwed: (state.turn.encountersOwed ?? 0) + 1, owedBecause: [...(state.turn.owedBecause ?? []), why] },
})

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
  // Its villain or objective isn't in play: the card is just discarded.
  if (!villainInPlay(state, card)) return withLog(discardEncounterCard(next, card.id), `${card.name} was discarded: it has nothing to do.`)

  if (card.damageEach > 0) {
    ;({ next, downed } = damageHeroes(next, next.heroes.map((h) => h.id), card.damageEach, card.name))
  }
  if (card.damageIfMonsterOnTile > 0 && action.monsterOnTile && hero) {
    ;({ next, downed } = damageHeroes(next, [hero.id], card.damageIfMonsterOnTile, card.name))
  }
  if (card.damagePoisoned > 0) {
    const poisoned = next.heroes.filter((h) => h.conditions.includes('Poisoned')).map((h) => h.id)
    ;({ next, downed } = damageHeroes(next, poisoned, card.damagePoisoned, card.name))
  }
  if (card.filterMonsters && !encounter.filtered) next = filterMonsterDeck(next, card.filterMonsters, action.random, action.monsterCards)
  if (card.placeVillain) next = reduce(next, { type: 'PLACE_VILLAIN', name: card.placeVillain, cards: action.villains ?? [] })
  if (card.drawMonsterType && hero) next = drawMonsterOfType(next, hero.id, card.drawMonsterType, action.random, action.monsterCards)
  if (card.timeToken) next = removeTimeToken(next, card.name)

  if (card.type === 'curse' && hero) {
    const curse = { id: newId('curse'), cardId: card.id, name: card.name, text: card.text, card: card.curse ?? {}, checks: card.checks ?? [] }
    next = withLog(updateHero(next, hero.id, (h) => ({ curses: [...(h.curses ?? []), curse] })), `${hero.name} is cursed: ${card.name}.`)
  } else if (card.type === 'environment') {
    if (next.environment) next = discardEncounterCard(next, next.environment.cardId)
    next = withLog({ ...next, environment: { cardId: card.id, name: card.name, card } }, `${card.name} is the new environment.`)
  } else if (card.type === 'trap' || card.type === 'hazard') {
    const marker = { id: newId('trap'), cardId: card.id, name: card.name, type: card.type, ownerId: encounter.heroId, card }
    next = withLog({ ...next, traps: [...(next.traps ?? []), marker] }, `A ${card.name} marker goes on ${hero?.name ?? 'the hero'}'s tile.`)
  } else if (card.returnToTop) {
    next = withLog({ ...next, encounterDeck: intoTopThree(next.encounterDeck, card.id, card, action.random?.slice(-1)) }, `${card.name} was shuffled back into the top of the encounter deck.`)
  } else if (card.afterDrawTop) {
    next = { ...next, encounterAfter: [...(next.encounterAfter ?? []).filter((id) => id !== card.id), card.id] }
  } else {
    next = discardEncounterCard(next, card.id)
  }
  if (card.id === 'lost') next = bottomToTop(next)
  if (card.drawAnother) next = oweEncounter(next, `${card.name} says to draw another encounter card.`)
  if (downed.length > 0) {
    next = withMoment(next, { kind: 'down', title: `${downed.join(' and ')} ${downed.length > 1 ? 'are' : 'is'} down!`, detail: card.name })
  }
  return next
}

// Ceremony Progresses!: one Time token off the Vast Gate. When the last one goes, the gate
// opens and the heroes lose.
function removeTimeToken(state, why) {
  const left = state.adventure?.timeTokens
  if (!Number.isInteger(left) || left <= 0) return state
  const next = withLog({ ...state, adventure: { ...state.adventure, timeTokens: left - 1 } }, `${why}: a Time token comes off the Vast Gate. ${left - 1} left.`)
  if (left - 1 > 0) {
    return withMoment(next, { kind: 'encounter', title: `${left - 1} Time token${left - 1 === 1 ? '' : 's'} left!`, detail: 'Take one Time token off the Vast Gate. Destroy it before they run out!' })
  }
  const lost = withLog({ ...next, status: 'lost' }, 'The last Time token is gone. The Vast Gate opens!')
  const defeat = state.adventure.card.story.defeat
  return withMoment(showStory(lost, 'The Vast Gate opens!', defeat || 'The last Time token is gone, and a horde of aberrant monsters pours out of the Far Realm. The heroes lose.'), {
    kind: 'down',
    title: 'The Vast Gate opens!',
    detail: 'The last Time token is gone.',
  })
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
  if (monster.villain) return hp > 0 ? { state: updateMonster(state, monster.id, () => ({ hp })), defeated: false } : defeatVillain(state, monster)
  // Figures taken off the board count toward adventures such as Monster Hunt.
  const counted = countDefeat(state, monster, figuresLeft(monster, monster.hp) - figuresLeft(monster, hp), hp === 0)
  if (hp > 0) return { state: updateMonster(counted, monster.id, () => ({ hp })), defeated: false }
  const next = { ...counted, xp: state.xp + monster.xp, monsters: state.monsters.filter((m) => m.id !== monster.id) }
  return { state: withLog(next, `The ${monster.name} was defeated! +${monster.xp} XP`), defeated: true }
}

// A villain at 0 HP. The Rage Drake flips to its enraged side the first time; any other
// villain is defeated, and stays in the villain list marked defeated for the adventure.
function defeatVillain(state, villain) {
  const rage = villain.card.enraged
  if (rage) {
    const card = { ...villain.card, hp: rage.hp, attacks: rage.attacks, tactics: rage.tactics, enraged: null }
    const next = updateMonster(state, villain.id, () => ({ hp: rage.hp, maxHp: rage.hp, ac: rage.ac, enraged: true, card }))
    return {
      state: withMoment(withLog(next, `The ${villain.name} is enraged! It's back up with ${rage.hp} HP and AC ${rage.ac}.`), {
        kind: 'spawn',
        art: monsterArt(villain),
        title: `The ${villain.name} is enraged!`,
        detail: `It gets back up with ${rage.hp} HP, AC ${rage.ac} and nastier tactics. Flip its card over.`,
      }),
      defeated: false,
    }
  }
  const next = updateMonster(state, villain.id, () => ({ hp: 0, defeated: true }))
  return { state: withLog(next, `The villain ${villain.name} was defeated!`), defeated: true }
}

// Figures still on the board for a monster card at this HP (three for a full group of Legion Devils).
function figuresLeft(monster, hp) {
  const perFigure = monster.card?.figures > 1 ? monster.card.hp : monster.maxHp
  return Math.ceil(hp / perFigure)
}

// The first monster defeated in a turn earns a treasure card for the hero who defeated
// it (a villain or a chamber's Altar doesn't). Returns the moment's words.
function defeatDetails(state, defeated, heroId) {
  if (defeated.length === 0) return { state, details: [] }
  if (defeated.every((m) => m.villain || m.objective)) return { state, details: [`${defeated.map((m) => m.name).join(' and ')} defeated!`] }
  const treasure = !state.turn.treasureDrawn
  const next = treasure ? { ...state, turn: oweTreasure(state, heroId ?? null) } : state
  const xp = defeated.reduce((sum, m) => sum + (m.xp ?? 0), 0)
  return {
    state: next,
    details: [`${defeated.map((m) => m.name).join(' and ')} defeated! +${xp} XP`, treasure && treasureWords(state)].filter(Boolean),
  }
}

// The first monster defeated in a turn earns a treasure card, or in a campaign a Treasure
// token (gold, or now and then a treasure card).
const oweTreasure = (state, heroId) =>
  state.campaign ? { ...state.turn, treasureDrawn: true, tokenOwed: heroId } : { ...state.turn, treasureDrawn: true, treasureOwed: heroId }
const treasureWords = (state) => (state.campaign ? 'Draw a Treasure token!' : 'Draw a treasure card!')

const markUsed = (state, heroId, powerId) =>
  updateHero(state, heroId, (h) => ({ powers: h.powers.map((p) => (p.id === powerId ? { ...p, used: true } : p)) }))

// Heals a hero (never past max HP) and logs it.
function healHero(state, heroId, amount, source) {
  const hero = state.heroes.find((h) => h.id === heroId)
  if (!hero || amount <= 0) return state
  const hp = Math.min(hero.maxHp, hero.hp + amount)
  if (hp === hero.hp) return withLog(state, `${hero.name} is already at full HP.`)
  const next = withLog(updateHero(state, hero.id, () => ({ hp })), `${hero.name} regained ${hp - hero.hp} HP from ${source}.`)
  return offerSavingGrace(next, hero)
}

// The heroes' own abilities (the hero cards), offered for the rest of the turn on the hero
// card they help: turn.abilityOffers = { savingGrace: [heroId], healingHands: [heroId], brutalRecovery }.
const heroWith = (state, effect) => state.heroes.find((h) => hasAbility(h, effect))
const offers = (state) => state.turn.abilityOffers ?? {}
function addOffer(state, kind, value) {
  const now = offers(state)
  const merged = value === true ? true : [...new Set([...(now[kind] ?? []), value])]
  return { ...state, turn: { ...state.turn, abilityOffers: { ...now, [kind]: merged } } }
}
function dropOffer(state, kind, heroId) {
  const now = offers(state)
  const left = heroId ? (now[kind] ?? []).filter((id) => id !== heroId) : false
  return { ...state, turn: { ...state.turn, abilityOffers: { ...now, [kind]: left } } }
}

// Quinn's Saving Grace: a hero on Quinn's tile who regains HP can also end a condition.
function offerSavingGrace(state, hero) {
  if (!heroWith(state, 'saving-grace') || hero.conditions.length === 0) return state
  return addOffer(state, 'savingGrace', hero.id)
}

// Tarak's Brutal Recovery: a natural 20 by a hero on Tarak's tile can flip Furious Assault back over.
function offerBrutalRecovery(state) {
  const tarak = heroWith(state, 'brutal-recovery')
  if (!tarak?.powers.some((p) => p.used && effectsOf(p).reaction === 'furious')) return state
  return addOffer(state, 'brutalRecovery', true)
}

// Vistra's Cast-Iron Stomach: +5 to rolls to end Poisoned.
export const poisonBonus = (hero) => (hasAbility(hero, 'cast-iron-stomach') ? 5 : 0)

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
    .filter((t) => foes(state).some((m) => m.id === t.monsterId && m.ac) && validRoll(t.roll))
    // Hypnotism never hurts the monster it moved.
    .filter((t) => effects.ask !== 'moved-monster' || t.monsterId !== action.movedId)
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
    const monster = findFoe(next, monsterId)
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
      lastAttack: { heroId: hero.id, powerId: power?.id ?? null, itemId: item?.id ?? null, attack, rolls, followUpDone: false, bonus: Boolean(extraAttack), free: Boolean(effects.free) },
    },
  }

  // Bloodlust ends when the hero defeats a monster.
  const ending = defeated.length > 0 ? (hero.curses ?? []).filter((c) => c.card?.removeOnDefeat) : []
  for (const curse of ending) next = removeCurse(next, hero.id, curse.id, `${hero.name}'s ${curse.name} curse is over.`)
  const natural20 = rolls.some((r) => r.value === 20)
  const canLevel = natural20 && hero.level === 1 && next.xp >= XP_TO_LEVEL_UP
  // A natural 20 on an attack is what lets a hero level up this turn.
  if (natural20) next = offerBrutalRecovery({ ...next, turn: { ...next.turn, natural20: hero.id } })
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
  const monster = findFoe(state, action.monsterId)
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
  if (action.roll === 20) next = offerBrutalRecovery({ ...next, turn: { ...next.turn, natural20: hero.id } })
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
    .map((id) => findFoe(state, id))
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

  let next = withCast(power.type === 'at-will' ? state : markUsed(state, hero.id, power.id), power)
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
  let next = withCast(markUsed(state, hero.id, power.id), power)
  next = updateHero(next, hero.id, (h) => ({
    hp: clamp(h.hp + row.dealt - row.miss, 0, h.maxHp),
    conditions: h.conditions.filter((c) => !row.conditions.includes(c)),
  }))
  const results = last.results.map((r) => (r === row ? { ...r, dodged: true } : r))
  next = { ...next, turn: { ...next.turn, lastMonsterAttack: { ...last, results } } }
  return withLog(next, `${hero.name} used Tumbling Escape: the attack misses!${row.miss > 0 ? ` (${row.miss} miss damage)` : ''} Put ${hero.name} on a tile within 1 tile.`)
}

// Practiced Evasion: an encounter card's or trap's hit becomes a miss. The damage and
// conditions come back off and the miss result lands instead. Against a trap, the
// hero also gets a free roll to disable it (the device sends the d20 as disableRoll).
function evadeHit(state, action) {
  const last = state.turn.lastEventAttack
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const power = hero?.powers.find((p) => p.id === action.powerId)
  const row = last?.results.find((r) => r.heroId === hero?.id && r.hit && !r.evaded)
  if (!row || !power || power.used || effectsOf(power).reaction !== 'evade') return state
  let next = withCast(markUsed(state, hero.id, power.id), power)
  next = updateHero(next, hero.id, (h) => {
    const kept = h.conditions.filter((c) => !row.conditions.includes(c))
    return {
      hp: clamp(h.hp + row.dealt - row.miss, 0, h.maxHp),
      conditions: [...kept, ...row.missConditions.filter((c) => !kept.includes(c))],
    }
  })
  const results = last.results.map((r) => (r === row ? { ...r, evaded: true } : r))
  next = { ...next, turn: { ...next.turn, lastEventAttack: { ...last, results } } }
  next = withLog(next, `${hero.name} used Practiced Evasion: the attack misses!${row.miss > 0 ? ` (${row.miss} miss damage)` : ''}`)
  if (last.kind === 'trap' && validRoll(action.disableRoll)) {
    next = gameReducer(next, { type: 'DISABLE_TRAP', trapId: last.trapId, heroId: hero.id, roll: action.disableRoll, free: true })
  }
  return next
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

// The end of the Hero Phase, with villagers in play and no villager roll yet.
export const villagerRollDue = (state) => PHASES[state.turn.phase]?.key === 'hero' && !state.turn.villagerRoll && aliveVillagers(state).length > 0

// Which checks a phase shows. The Villain Phase has none, so a card drawn there waits
// for the next turn's Exploration Phase.
export const checksFor = (phaseKey) => (phaseKey === 'hero' || phaseKey === 'exploration' ? phaseKey : null)

// The questions a phase ends with, from the active hero's curses, the environment, and
// hazards on the board. Each has a key so it's asked once per turn, on every device.
export function phaseChecks(state, phaseKey) {
  const hero = state.heroes[state.turn.heroIndex]
  if (!hero) return []
  const sources = [
    ...(hero.curses ?? []).map((curse) => ({ id: curse.id, name: curse.name, checks: curse.checks, curseId: curse.id })),
    ...(state.environment ? [{ id: `env-${state.environment.cardId}`, name: state.environment.name, checks: state.environment.card.checks }] : []),
    ...(state.traps ?? []).map((trap) => ({ id: trap.id, name: trap.name, checks: trap.card.checks })),
    // The adventure's own questions (the Vast Gate spitting out monsters), while their objective stands.
    ...(state.adventure ? [{ id: 'adventure', name: state.adventure.card.title, checks: (state.adventure.card.checks ?? []).filter((c) => !c.whileObjective || objectiveInPlay(state, c.whileObjective)) }] : []),
  ]
  const done = state.turn.checksDone ?? []
  return sources.flatMap((source) =>
    (source.checks ?? [])
      .map((check, i) => ({ ...check, key: `${source.id}-${i}`, source: source.name, curseId: source.curseId ?? null, heroId: hero.id }))
      .filter((check) => check.phase === phaseKey && !done.includes(check.key)),
  )
}

// True when the game's copies of encounter cards are older than the card file, such as
// cards saved before the file gained its end-of-phase checks.
export function encounterCardsOutdated(state, cards = []) {
  const deck = state?.encounterDeck?.cards
  if (!deck) return false
  return cards.some((card) => deck[card.id] && JSON.stringify(deck[card.id]) !== JSON.stringify(card))
}

// Brings every saved copy of an encounter card up to date with the card file: the deck,
// the card being read out, the environment, markers on the board, and curses on heroes.
function updateEncounterCards(state, cards) {
  const byId = Object.fromEntries((Array.isArray(cards) ? cards : []).map((c) => [c.id, c]))
  if (!encounterCardsOutdated(state, cards)) return state
  const fresh = (card) => byId[card?.id] ?? card
  return {
    ...state,
    encounterDeck: { ...state.encounterDeck, cards: Object.fromEntries(Object.entries(state.encounterDeck.cards).map(([id, c]) => [id, fresh(c)])) },
    encounter: state.encounter && { ...state.encounter, card: fresh(state.encounter.card) },
    environment: state.environment && { ...state.environment, card: fresh(state.environment.card) },
    traps: (state.traps ?? []).map((trap) => ({ ...trap, card: fresh(trap.card) })),
    heroes: state.heroes.map((hero) => ({
      ...hero,
      curses: (hero.curses ?? []).map((curse) =>
        byId[curse.cardId] ? { ...curse, card: byId[curse.cardId].curse ?? {}, checks: byId[curse.cardId].checks ?? [] } : curse,
      ),
    })),
  }
}

function answerCheck(state, action) {
  const check = phaseChecks(state, checksFor(PHASES[state.turn.phase]?.key)).find((c) => c.key === action.key)
  if (!check) return state
  const hero = state.heroes.find((h) => h.id === check.heroId)
  let next = { ...state, turn: { ...state.turn, checksDone: [...(state.turn.checksDone ?? []), check.key] } }
  const effect = check.ask ? (action.answer ? check.yes : check.no) : null
  if (!effect) return next
  if (effect.damage) {
    const { next: hurt, downed } = damageHeroes(next, [hero.id], effect.damage, check.source)
    next = hurt
    next = withMoment(next, {
      kind: downed.length > 0 ? 'down' : 'monster',
      heroId: hero.id,
      title: downed.length > 0 ? `${hero.name} is down!` : `${check.source}: ${effect.damage} damage`,
      detail: downed.length > 0 ? 'Spend a healing surge to get back up.' : `${hero.name} takes ${effect.damage} damage.`,
    })
  }
  if (effect.condition && !hero.conditions.includes(effect.condition)) {
    next = withLog(updateHero(next, hero.id, (h) => ({ conditions: [...h.conditions, effect.condition] })), `${hero.name} is ${effect.condition} from ${check.source}.`)
  }
  if (effect.remove && check.curseId) next = removeCurse(next, hero.id, check.curseId, `${hero.name}'s ${check.source} curse is over.`)
  if (effect.drawMonster) {
    // Not the tile's monster, so the Exploration Phase's draw button stays as it was.
    const { monsterDrawn } = next.turn
    const withDeck = next.monsterDeck || !Array.isArray(action.cards) ? next : { ...next, monsterDeck: buildDeck(action.cards, action.random) }
    next = drawMonster(withDeck, hero.id, action.random)
    next = { ...next, turn: { ...next.turn, monsterDrawn } }
  }
  return next
}

// What the phase still needs before the turn moves on, as short labels for the screen.
// `cards` says which virtual decks are in use (the table may draw from the real ones).
export function phaseTodo(state, cards = {}) {
  const { phase, explored, triangle, monsterDrawn, acted = [] } = state.turn
  const hero = state.heroes[state.turn.heroIndex]
  if (!hero) return []
  const todo = []
  if (state.turn.startDamageDue) todo.push(`${hero.name}'s healing surge`)
  const key = PHASES[phase]?.key
  if (key === 'exploration') {
    if (explored === undefined) todo.push('the unexplored edge question')
    else if (explored === true && cards.monsters && !monsterDrawn) todo.push('the new monster')
  }
  if (key === 'villain') {
    for (const villain of activeVillains(state)) if (!acted.includes(villain.id)) todo.push(`the ${villain.name}'s turn`)
    if (cards.encounters) {
      if (explored === true && triangle === undefined) todo.push('the black triangle question')
      else if (state.encounter || encounterCount(state, hero) > 0) todo.push('the encounter card')
    }
    for (const monster of state.monsters.filter((m) => m.ownerId === hero.id)) if (!acted.includes(monster.id)) todo.push(`the ${monster.name}'s turn`)
    for (const trap of (state.traps ?? []).filter((t) => t.ownerId === hero.id && t.type === 'trap')) if (!acted.includes(trap.id)) todo.push(`the ${trap.name}`)
  }
  return todo
}

// Encounter cards the Villain Phase still owes: one without a new tile (or with a black
// triangle), plus curses (Bad Luck), the adventure's extras and "draw another" cards.
export function encounterCount(state, hero) {
  const { explored, triangle, encountersDrawn = 0, encountersOwed = 0 } = state.turn
  // After the Elite Regiment is found (Assault on Firestorm Peak), every encounter card is two.
  const base = (explored !== true || triangle === true ? 1 : 0) * (state.adventure?.doubleEncounters ? 2 : 1)
  const badLuck = (hero.curses ?? []).reduce((sum, c) => sum + (c.card?.extraEncounter ?? 0), 0)
  // Some adventures add an encounter to every Villain Phase (Roghar's Gear, once the Vault is found).
  const adventure = state.adventure?.extraEncounters ?? 0
  return Math.max(0, base + badLuck + adventure + encountersOwed - encountersDrawn)
}

// Poison (and Bloodlust) hurt at the start of the hero's turn, and a hero lost in a Time
// Leap comes back.
function startTurn(state) {
  const hero = state.heroes[state.turn.heroIndex]
  state = returnFromPowers(state, hero)
  for (const curse of (hero?.curses ?? []).filter((c) => c.card?.removeAtTurnStart)) {
    state = removeCurse(state, hero.id, curse.id, `${hero.name} is back from the ${curse.name}. Put ${hero.name} on any tile.`)
    state = withMoment(state, { kind: 'encounter', heroId: hero.id, title: `${hero.name} is back!`, detail: `${curse.name} is over. Put ${hero.name} on any tile.` })
  }
  if (!hero) return state
  // A hero who starts the turn at 0 HP spends a healing surge first; the poison and curse
  // damage comes after that (USE_SURGE), so getting back up doesn't skip it.
  if (hero.hp === 0 && state.surges <= 0) {
    return withLog({ ...state, status: 'lost' }, `${hero.name} is down at the start of the turn with no healing surges left.`)
  }
  if (hero.hp === 0) return { ...state, turn: { ...state.turn, startDamageDue: hero.id } }
  return startDamage(state, hero)
}

// Poison and start-of-turn curse damage (Bloodlust).
function startDamage(state, hero) {
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

// Opening the Cage or disabling a trap takes the place of the active hero's attack:
// once per Hero Phase, and not after they've attacked.
export function canSpendAttack(state, hero) {
  if (!hero || PHASES[state.turn.phase]?.key !== 'hero' || state.heroes[state.turn.heroIndex]?.id !== hero.id) return false
  const last = state.turn.lastAttack
  return !state.turn.attackSpent && !(last && !last.bonus && !last.free && last.heroId === hero.id)
}

const spendAttack = (state, hero, on) => ({ ...state, turn: { ...state.turn, attackSpent: { heroId: hero.id, on } } })

// Some curses end on a roll at the end of a phase ("Roll a die at the end of your Hero
// Phase: 10+ discard this card"). The device sends the dice with NEXT_PHASE.
function endPhaseCurses(state, hero, phaseKey, rolls = []) {
  let next = state
  let i = 0
  for (const curse of (hero?.curses ?? []).filter((c) => c.card?.removeRoll?.phase === phaseKey)) {
    const roll = rolls[i++]
    if (!validRoll(roll)) continue
    const { target } = curse.card.removeRoll
    const broken = roll >= target
    next = broken
      ? removeCurse(next, hero.id, curse.id, `${hero.name} rolled ${roll} and broke the ${curse.name} curse!`)
      : withLog(next, `${hero.name} rolled ${roll} against the ${curse.name} curse (needed ${target}). Still cursed.`)
    // Shown on the big screen too, so nobody wonders whether the roll happened.
    next = withMoment(next, {
      kind: broken ? 'defeat' : 'roll',
      heroId: hero.id,
      value: roll,
      title: broken ? `${hero.name} broke the ${curse.name} curse!` : `${hero.name} is still under ${curse.name}`,
      detail: `The curse roll needed ${target}.`,
    })
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
  const bonus = poisonBonus(hero)
  const cured = roll + bonus >= 10
  const rolled = bonus ? `${roll} + ${bonus} (Cast-Iron Stomach) = ${roll + bonus}` : roll
  if (cured) next = updateHero(next, hero.id, (h) => ({ conditions: h.conditions.filter((c) => c !== 'Poisoned') }))
  next = withLog(next, `${hero.name} rolled ${rolled} against the poison${cured ? ' and shook it off!' : '. Still poisoned.'}`)
  return withMoment(next, {
    kind: 'poison',
    heroId: hero.id,
    value: roll,
    title: cured ? 'Poison gone!' : 'Still poisoned',
    detail: bonus ? `${hero.name} needed 10 or more, with +${bonus} from Cast-Iron Stomach.` : `${hero.name} needed 10 or more.`,
  })
}

// The next level's side of the hero card (level 2 in the box), with an empty slot for the
// power card it adds. HP goes up as much as max HP does. A hero whose template is gone
// from cards.json levels up the box way.
const nextLevel = (h) => {
  const template = templateFor(h.key) ?? h
  const level = h.level + 1
  const before = statsAtLevel(template, h.level)
  const after = statsAtLevel(template, level)
  const change = Object.fromEntries(LEVEL_STATS.map((stat) => [stat, h[stat] + after[stat] - before[stat]]))
  return { level, ...change, hp: h.hp + after.maxHp - before.maxHp, powers: [...h.powers, newPower(addedSlot(template, level))] }
}

function levelUp(state, hero) {
  const leveled = updateHero(state, hero.id, nextLevel)
  const level = hero.level + 1
  const slot = addedSlot(templateFor(hero.key), level)
  return withMoment(withLog(leveled, `${hero.name} reached level ${level}!`), {
    kind: 'level',
    heroId: hero.id,
    title: `${hero.name} reached level ${level}!`,
    detail: `Flip your hero card and choose another ${slot} power!`,
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

// Before the adventure, each hero draws one treasure card to start with (Rulebook p. 13).
// A campaign's later adventures pass a deck without the cards the heroes already hold.
function dealStartingTreasure(state, cards, random, deck = null) {
  if (!deck && (!Array.isArray(cards) || cards.length === 0)) return state
  let next = { ...state, treasureDeck: deck ?? buildDeck(cards, random) }
  const found = []
  for (const hero of next.heroes) {
    const drawn = drawTop(next.treasureDeck, random)
    const card = drawn && drawn.deck.cards[drawn.cardId]
    if (!card) break
    const item = { id: newId('item'), cardId: card.id, name: card.name, used: false, card }
    next = updateHero({ ...next, treasureDeck: drawn.deck }, hero.id, (h) => ({ items: [...(h.items ?? []), item] }))
    next = withLog(next, `${heroLabel(hero)} starts with ${/^\S+s'?(\s|$)/.test(card.name) ? '' : `${article(card.name)} `}${card.name}.`)
    found.push(`${hero.name}: ${card.name}`)
  }
  const moment = { kind: 'treasure', title: 'Starting treasure!', detail: found.join(' · ') }
  // With a roll for first turn coming, the treasure waits until it's decided, so the
  // two don't land on top of each other.
  if (next.firstRoll) return { ...next, firstRoll: { ...next.firstRoll, after: moment } }
  return withMoment(next, moment)
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
  // Villains count as monsters here: a villain can be controlled, or attacked.
  const monster = findFoe(state, action.monsterId)
  const target = action.targetId !== action.monsterId ? findFoe(state, action.targetId) : null
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
// Each level after the first adds a power card: one more daily in the box.
export const levelSlots = (template, level = 1) => [
  ...powerSlotsFor(template),
  ...Array.from({ length: Math.max(0, level - 1) }, (_, i) => addedSlot(template, i + 2)),
]

// The card is copied into the game, so later edits to the card file don't change a game in progress.
const copyCard = (card) =>
  card
    ? {
        id: String(card.id),
        name: String(card.name),
        text: String(card.text ?? ''),
        attack: card.attack ? String(card.attack) : '',
        damage: card.damage ? String(card.damage) : '',
        // A homebrew power's own effect (powerEffects.js), kept with the card.
        ...(card.effect && typeof card.effect === 'object' ? { effect: card.effect } : {}),
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

function heroesFromLobby(lobby, campaign = null) {
  return lobby.flatMap((claim) => {
    const template = templateFor(claim.heroKey)
    if (!template) return []
    // A campaign hero who levelled up starts at that level, with the power cards it added.
    const saved = (campaign?.heroes ?? []).find((h) => h.key === template.key)
    let hero = createHero(template)
    while (hero.level < Math.min(saved?.level ?? 1, MAX_LEVEL)) hero = { ...hero, ...nextLevel(hero) }
    return [{ ...withPicks(hero, claim.picks), player: claim.player }]
  })
}

// ---- Campaigns (state/campaign.js) ----

const sameHeroes = (heroes, saved) => heroes.length === saved.length && saved.every((s) => heroes.some((h) => h.key === s.key))

// What a campaign hero takes into the next adventure: level, gold, items (face up again) and powers.
const heroRecord = (hero, deviceId = null) => ({
  key: hero.key,
  deviceId,
  player: hero.player ?? '',
  level: hero.level,
  gold: hero.gold ?? 0,
  items: (hero.items ?? []).map((item) => ({ ...item, used: false })),
  picks: hero.powers.map((p) => p.card ?? null),
})

const campaignHeroes = (campaign, heroes, lobby) =>
  heroes.map((hero) => heroRecord(hero, lobby.find((c) => c.heroKey === hero.key)?.deviceId ?? campaign.heroes.find((h) => h.key === hero.key)?.deviceId ?? null))

// A hero entering a later campaign adventure gets back the gold and items they had.
const fromCampaign = (hero, saved) => (saved ? { ...hero, gold: saved.gold, items: saved.items.map((item) => ({ ...item, id: newId('item') })) } : hero)

// The lobby for the campaign's next adventure: each iPad gets its hero back, waiting to get ready.
function campaignLobby(state) {
  const lobby = state.campaign.heroes
    .filter((h) => h.deviceId && templateFor(h.key))
    .map((h) => {
      const template = templateFor(h.key)
      return { deviceId: h.deviceId, heroKey: h.key, player: h.player, picks: levelSlots(template, h.level).map((_, i) => copyCard(h.picks[i])), ready: false }
    })
  return { ...state, lobby, lobbyAdventure: state.campaign.card }
}

// A deck without the cards the heroes already hold (one copy each).
function buildDeckWithout(cards, heldIds, random) {
  if (!Array.isArray(cards) || cards.length === 0) return null
  const deck = buildDeck(cards, random)
  const held = [...heldIds]
  const draw = deck.draw.filter((id) => {
    const i = held.indexOf(id)
    if (i === -1) return true
    held.splice(i, 1)
    return false
  })
  return { ...deck, draw }
}

// After the recap: the campaign takes in what happened, and the lobby opens for the next
// adventure with the shop. A finished campaign stays on the recap until New game.
function nextCampaignAdventure(state, action) {
  const outcome = campaignOutcome(state)
  if (!outcome || outcome.over) return state
  const campaign = {
    ...state.campaign,
    deck: outcome.deck,
    beaten: outcome.beaten,
    defeats: outcome.defeats,
    hard: state.campaign.hard || Boolean(state.adventure?.doubleEncounters),
    boons: [...state.campaign.boons, ...outcome.boons],
    heroes: state.heroes.map((hero) => heroRecord(hero, campaignHero(state, hero.key)?.deviceId ?? null)),
    games: state.campaign.games + 1,
    // For the Chronicle in the next lobby: how the last adventure went.
    last: { won: outcome.won, chamber: outcome.chamber?.name ?? null },
  }
  const held = campaign.heroes.flatMap((h) => h.items.map((i) => i.cardId))
  const shop = shopCards(action.treasureCards, held, shopSize({ campaign }, action.boons), action.random)
  return campaignLobby({ ...initialState, campaign: { ...campaign, shop }, lobbySurges: state.lobbySurges, lobbyTiles: state.lobbyTiles })
}

// Between adventures a hero buys a shop card with their own gold.
function buyFromShop(state, action) {
  const campaign = state.campaign
  const hero = campaignHero(state, action.heroKey)
  const index = (campaign?.shop ?? []).findIndex((c) => c.id === action.cardId)
  if (state.status !== 'setup' || !hero || index === -1) return state
  const card = campaign.shop[index]
  if (!(card.cost > 0) || hero.gold < card.cost) return state
  const item = { id: newId('item'), cardId: card.id, name: card.name, used: false, card }
  const heroes = campaign.heroes.map((h) => (h.key === hero.key ? { ...h, gold: h.gold - card.cost, items: [...h.items, item] } : h))
  return { ...state, campaign: { ...campaign, heroes, shop: campaign.shop.filter((_, i) => i !== index) } }
}

// A hero defeated a monster in a campaign adventure: a Treasure token from the stack, or
// the one the player drew from the real stack (`token`: { gold } or { treasure: true }).
// Dragon's Tribute: draw two and keep the lower value; a Treasure one is discarded.
function drawTreasureToken(state, action) {
  const hero = state.heroes.find((h) => h.id === state.turn.tokenOwed)
  if (!hero) return state
  const done = { ...state, turn: { ...state.turn, tokenOwed: null } }
  const manual = action.token && (action.token.treasure === true || (Number.isInteger(action.token.gold) && action.token.gold > 0))
  let stack = state.tokenStack ?? []
  let drawn
  if (manual) {
    drawn = [{ gold: action.token.treasure ? 0 : action.token.gold, treasure: action.token.treasure === true }]
  } else {
    const count = state.environment?.cardId === 'dragon-s-tribute' ? 2 : 1
    drawn = stack.slice(0, count)
    stack = stack.slice(count)
  }
  if (drawn.length === 0) return withLog(done, 'There are no Treasure tokens left.')
  let token = drawn[0]
  if (drawn.length > 1) {
    const gold = drawn.filter((t) => !t.treasure)
    token = gold.length > 0 ? gold.reduce((low, t) => (t.gold < low.gold ? t : low)) : null
  }
  const next = { ...done, tokenStack: stack }
  if (!token) return withMoment(withLog(next, `${hero.name} drew two Treasure tokens, but Dragon's Tribute takes both.`), { kind: 'treasure', heroId: hero.id, title: 'Dragon’s Tribute!', detail: 'Both tokens are lost.' })
  if (token.treasure) {
    return withMoment(withLog({ ...next, turn: { ...next.turn, treasureOwed: hero.id } }, `${hero.name}'s Treasure token says Treasure!`), { kind: 'treasure', heroId: hero.id, title: 'Treasure!', detail: `${hero.name} draws a treasure card.` })
  }
  const rich = updateHero(next, hero.id, (h) => ({ gold: (h.gold ?? 0) + token.gold }))
  return withMoment(withLog(rich, `${hero.name} found ${token.gold} gold.`), { kind: 'treasure', heroId: hero.id, title: `${token.gold} gold!`, detail: drawn.length > 1 ? `Dragon’s Tribute: ${hero.name} keeps the lower token.` : `${hero.name} has ${(hero.gold ?? 0) + token.gold} gold.` })
}

// Turn order key, so a boon can tell which monsters were drawn this turn.
export const turnKey = (state) => `${state.turn.round}-${state.turn.heroIndex}`

// Using one of the campaign's boons, once per adventure. `boon` is its card from the card file.
function useBoon(state, action) {
  const boon = action.boon
  const used = state.adventure?.boonsUsed ?? []
  if (!boon || !state.campaign?.boons.includes(boon.id) || used.includes(boon.id) || state.status !== 'playing') return state
  const spent = (next) => ({ ...next, adventure: { ...next.adventure, boonsUsed: [...used, boon.id] } })
  if (boon.use === 'startTile') {
    // Before anyone's first turn: the top dungeon tile goes down, with no monster and no encounter.
    const { round, heroIndex, phase, tiles } = state.turn
    if (round !== 1 || heroIndex !== 0 || phase !== 0 || tiles?.explore !== undefined) return state
    const next = drawDungeonTile(state, { ...action, key: `boon-${boon.id}` })
    if (next === state) return state
    return withMoment(spent(withLog(next, `The party used ${boon.name}.`)), { kind: 'roll', title: boon.name, detail: 'Place the top dungeon tile next to any unexplored edge. No monster and no encounter card for it.' })
  }
  if (boon.use === 'discardMonster') {
    const monster = state.monsters.find((m) => m.id === action.monsterId)
    if (!monster || monster.drawnAt !== turnKey(state) || !(monster.card?.types ?? []).some((t) => (boon.monsterTypes ?? []).some((want) => sameName(t, want)))) return state
    const next = discardMonsterCard({ ...state, monsters: state.monsters.filter((m) => m.id !== monster.id) }, monster)
    return withMoment(spent(withLog(next, `${boon.name}: the ${monster.name} card is discarded.`)), { kind: 'defeat', art: monsterArt(monster), title: boon.name, detail: `Take the ${monster.name} off the board. Its card is discarded.` })
  }
  return state
}

// Marks monsters with the turn they came out, for boons that work on a monster just drawn.
function tagDrawn(state) {
  if (!state.monsters?.some((m) => !m.drawnAt)) return state
  const key = turnKey(state)
  return { ...state, monsters: state.monsters.map((m) => (m.drawnAt ? m : { ...m, drawnAt: key })) }
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
    // Saved with the hero, so a game in progress keeps them if cards.json changes.
    abilityEffects: hero.abilityEffects ?? [],
    conditions: [],
    // Power tokens (Mirror Image, Blade Barrier, Flaming Sphere) and markers (invisible, refuge).
    tokens: {},
    shieldedBy: null, // the cleric whose Cleric's Shield gives this hero +2 AC
    powers: powerSlotsFor(hero).map((type) => newPower(type)),
  }
}

// Puts a villain on the board, found by its card's id or name ("Kobold Dragonlord").
// An adventure does this when its villain's tile is revealed.
function placeVillain(state, action) {
  const wanted = String(action.name ?? '').toLowerCase()
  const card = (Array.isArray(action.cards) ? action.cards : []).find(
    (c) => c.id.toLowerCase() === wanted || c.name.toLowerCase() === wanted || c.fullName?.toLowerCase() === wanted,
  )
  if (!card) return withLog(state, `The app has no villain card called "${action.name}".`)
  if (activeVillains(state).some((v) => v.cardId === card.id)) return state
  const villain = {
    id: newId('villain'),
    villain: true,
    cardId: card.id,
    name: card.name,
    fullName: card.fullName ?? card.name,
    maxHp: card.hp,
    hp: card.hp,
    ac: card.ac,
    xp: 0,
    ownerId: null,
    conditions: [],
    defeated: false,
    enraged: false,
    card: {
      hp: card.hp,
      figures: 1,
      level: card.level ?? null,
      flavor: card.flavor ?? '',
      special: card.special ?? '',
      onPlace: card.onPlace ?? '',
      types: card.types ?? [],
      attacks: card.attacks,
      tactics: card.tactics,
      enraged: card.enraged ?? null,
    },
  }
  let next = { ...state, villains: [...(state.villains ?? []), villain] }
  // Ashardalon brings his breath card: it goes into the top of the encounter deck before the next draw.
  if (card.addEncounter) next = { ...next, encounterAdds: [...(next.encounterAdds ?? []).filter((id) => id !== card.addEncounter), card.addEncounter] }
  return withMoment(withLog(next, `The villain ${villain.fullName} appears!`), {
    kind: 'spawn',
    art: monsterArt(villain),
    title: `${villain.fullName} appears!`,
    detail: [
      `Place the ${villain.name} figure. It takes a turn at the start of every Villain Phase.`,
      card.addEncounter ? 'The app shuffles its special encounter card into the top of the encounter deck.' : card.onPlace,
    ].filter(Boolean).join(' '),
  })
}

// Every action, then a check for an adventure's victory, then the recap's counts.
export const gameReducer = (state, action) => trackStats(state, pruneTokens(checkVictory(tagDrawn(reduce(state, action)))), action)

// A dungeon tile drawn from the stack, from the top when exploring or the bottom for a
// card that says so. `key` says what it was for (explore, a monster, an encounter), so
// each thing draws once. A special tile is revealed straight away.
function drawDungeonTile(state, action) {
  const key = action.key ?? 'explore'
  if (!state.tileStack || state.turn.tiles?.[key] !== undefined) return state
  const { state: drawn, tile } = takeTile(state, action.from === 'bottom' ? 'bottom' : 'top')
  let next = { ...drawn, turn: { ...drawn.turn, tiles: { ...drawn.turn.tiles, [key]: tile ?? 'none' } } }
  if (tile === null) return next
  const left = next.tileStack.stack.length
  next = withLog(next, `Dungeon tile drawn${action.from === 'bottom' ? ' from the bottom' : ''}; ${left} left.`)
  if (tile) next = revealTile(next, { ...action, tile, door: false })
  return next
}

// A special tile turned up: read its text, then do what the adventure says.
function revealTile(state, action) {
  const reveal = revealsReady(state.adventure, Boolean(action.door)).find((r) => r.tile === action.tile)
  const hero = state.heroes[state.turn.heroIndex]
  if (!reveal || !hero) return state
  let next = { ...state, adventure: { ...state.adventure, revealed: [...state.adventure.revealed, reveal.tile] } }
  next = withLog(next, `${hero.name} revealed the ${reveal.tile}!`)
  for (const step of reveal.actions) {
    if (step.type === 'drawGuardians') {
      // The guardians come off the monster deck and go to the hero who found them.
      if (!next.monsterDeck && Array.isArray(action.cards)) next = { ...next, monsterDeck: buildDeck(action.cards, action.random) }
      for (let i = 0; i < step.count; i++) {
        const before = next.monsters.length
        next = drawMonster(next, hero.id, action.random)
        if (next.monsters.length > before) {
          const guardian = next.monsters[next.monsters.length - 1]
          next = updateMonster(next, guardian.id, () => ({ guardian: true }))
          next = { ...next, adventure: { ...next.adventure, guardians: next.adventure.guardians + 1 } }
        }
      }
    } else if (step.type === 'placeToken') {
      const token = { name: step.name, heldBy: null, ask: step.ask ?? '', drawTreasure: Boolean(step.drawTreasure) }
      next = { ...next, adventure: { ...next.adventure, tokens: [...next.adventure.tokens, token] } }
    } else if (step.type === 'extraEncounters') {
      next = { ...next, adventure: { ...next.adventure, extraEncounters: next.adventure.extraEncounters + step.count } }
    } else if (step.type === 'placeVillain') {
      // The villain rules take it from here, with the villain cards the device sent along.
      next = reduce(next, { type: 'PLACE_VILLAIN', name: step.name, cards: action.villains ?? [] })
    } else if (step.type === 'chamber') {
      next = openChamber(next, step, action, hero)
    } else if (step.type === 'chamberMonsters') {
      // A chamber with no Chamber card (Sneaky Endeavor's treasure vault): just its monsters.
      next = fillChamber(next, { perPlayer: step.count, types: [], redrawXp: [] }, action)
    }
  }
  // A new chamber (Wrath of Ashardalon has two) adds its card's steps.
  const chamber = next.adventure.chamber !== state.adventure.chamber && next.adventure.chamber
  const steps = [...reveal.steps, ...(chamber ? chamberSteps(next, chamber, state) : monsterSteps(next, state))]
  return showStory(next, `The ${reveal.tile}!`, reveal.story, steps)
}

// A hero next to a Closed Door token turned it over (Rulebook p. 15).
function revealDoor(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId) ?? state.heroes[state.turn.heroIndex]
  if (!state.adventure || !DOOR_KINDS.includes(action.kind) || !hero) return state
  if (action.kind === 'unlocked') {
    return withMoment(withLog(state, `${hero.name} opened an Unlocked Door.`), { kind: 'roll', heroId: hero.id, title: 'The door swings open!', detail: 'Discard the Closed Door token.' })
  }
  if (action.kind === 'trapped') {
    // Each hero next to the door takes 1 damage.
    const ids = Array.isArray(action.heroIds) ? action.heroIds : [hero.id]
    const { next } = damageHeroes(state, ids, 1, 'a Trapped Door')
    const names = state.heroes.filter((h) => ids.includes(h.id)).map((h) => h.name)
    return withMoment(next, { kind: 'fumble', heroId: hero.id, title: 'A Trapped Door!', detail: `${names.join(', ') || 'No one'} took 1 damage. Discard the Closed Door token.` })
  }
  const next = { ...state, adventure: { ...state.adventure, lockedDoors: [...(state.adventure.lockedDoors ?? []), { id: newId('door') }] } }
  return withMoment(withLog(next, `${hero.name} found a Locked Door.`), {
    kind: 'roll',
    heroId: hero.id,
    title: 'A Locked Door!',
    detail: `Put the token back face up. A hero next to it can try to unlock it instead of attacking: ${DOOR_UNLOCK_ROLL} or more.`,
  })
}

// One of the list, picked with a random number the device sent along.
const pick = (list, r) => list[Math.min(list.length - 1, Math.floor((Number.isFinite(Number(r)) ? Number(r) : 0) * list.length))]

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

// A chamber's entrance turned up. The chamber card (named by the adventure, or drawn
// from the Chamber deck) puts its villain or objective in the chamber, then each
// player, starting with the active hero, draws monsters for it.
function openChamber(state, step, action, hero) {
  const random = Array.isArray(action.random) ? action.random : []
  const deck = playableChambers(action.chambers)
  // A campaign has its own Chamber deck, and the top card is the one found.
  const top = !step.name && state.campaign ? deck.find((c) => c.id === state.campaign.deck[0]) : null
  const card = step.name ? deck.find((c) => c.id === step.name || sameName(c.name, step.name)) : state.campaign ? top : deck.length > 0 ? pick(deck, random[0]) : null
  if (!card) return withLog(state, step.name ? `The app has no chamber card called "${step.name}".` : 'There are no chamber cards to draw.')
  const from = card.villainFrom.filter((name) => !(step.exclude ?? []).some((x) => sameName(x, name)))
  const villain = card.villain || (from.length > 0 ? pick(from, random[1]) : '')
  let next = { ...state, adventure: { ...state.adventure, chamber: { card, villain, objectivePlaced: false, done: false } } }
  next = withLog(next, step.name ? `The chamber is the ${card.name}.` : `${hero.name} drew the ${card.name} chamber card!`)
  // Finding the Elite Regiment makes this adventure and every later one draw two encounter cards.
  if (state.campaign && card.id === state.campaign.card.campaign.hard) {
    next = withLog({ ...next, adventure: { ...next.adventure, doubleEncounters: true } }, 'The Elite Regiment! From now on, every encounter card is two.')
  }
  if (villain) next = reduce(next, { type: 'PLACE_VILLAIN', name: villain, cards: action.villains ?? [] })
  if (card.objective) {
    const { name, hp, ac } = card.objective
    const objective = { id: newId('monster'), name, maxHp: hp, hp, ac, xp: 0, ownerId: null, conditions: [], objective: true, card: { hp, figures: 1, special: '', types: [], attacks: [], tactics: [] } }
    next = { ...next, monsters: [...next.monsters, objective], adventure: { ...next.adventure, chamber: { ...next.adventure.chamber, objectivePlaced: true } } }
  }
  if (card.timeTokens > 0) next = { ...next, adventure: { ...next.adventure, timeTokens: card.timeTokens } }
  // Ceremony Progresses! goes on top of the encounter deck; Ashardalon Arrives! into the top 3.
  if (card.addEncounter) next = { ...next, encounterAdds: [...(next.encounterAdds ?? []), card.encounterTop ? { id: card.addEncounter, top: true } : card.addEncounter] }
  if (card.villagers) next = placeVillagers(next, action.villagerCards, step.villagers || state.heroes.length, random.slice(2))
  next = fillChamber(next, card.monsters, action)
  const placed = next.monsters.filter((m) => m.chamber && !state.monsters.some((old) => old.id === m.id))
  return withMoment(next, {
    kind: 'spawn',
    title: `The ${card.name}!`,
    detail: [villain && `The ${villain}`, card.objective && `the ${card.objective.name}`, ...placed.map((m) => m.name)].filter(Boolean).join(', ') + ' wait in the chamber.',
  })
}

// Each player, starting with the active hero, draws monsters for a chamber.
function fillChamber(state, rule, action) {
  const random = Array.isArray(action.random) ? action.random : []
  // Filling the chamber isn't the hero's tile draw or an encounter's monster, so those buttons stay as they were.
  const { monsterDrawn } = state.turn
  const { encounter } = state
  let next = !state.monsterDeck && Array.isArray(action.cards) ? { ...state, monsterDeck: buildDeck(action.cards, random) } : state
  const start = state.turn.heroIndex
  const order = state.heroes.map((_, i) => state.heroes[(start + i) % state.heroes.length])
  for (let round = 0; round < rule.perPlayer; round++) {
    for (const player of order) next = drawChamberMonster(next, player, rule, random)
  }
  return { ...next, turn: { ...next.turn, monsterDrawn }, encounter }
}

// Does a drawn monster belong in this chamber? Elite Regiment wants no 1 XP monsters,
// the clan lairs want their kind. A misfit is discarded once and another drawn.
const fitsChamber = (monster, rule) =>
  (rule.types.length === 0 || (monster.card?.types ?? []).some((t) => rule.types.some((want) => sameName(t, want)))) && !rule.redrawXp.includes(monster.xp)

function drawChamberMonster(state, hero, rule, random) {
  const draw = (current) => {
    const after = drawMonster(current, hero.id, random)
    return { state: after, monster: after.monsters.length > current.monsters.length ? after.monsters[after.monsters.length - 1] : null }
  }
  let { state: next, monster } = draw(state)
  if (monster && !fitsChamber(monster, rule)) {
    next = discardMonsterCard({ ...next, monsters: next.monsters.filter((m) => m.id !== monster.id) }, monster)
    next = withLog(next, `The ${monster.name} doesn't belong in this chamber, so it's discarded and ${hero.name} draws again.`)
    ;({ state: next, monster } = draw(next))
  }
  return monster ? updateMonster(next, monster.id, () => ({ chamber: true })) : next
}

// What the players do on the board for the chamber card, added to the reveal's read-aloud box.
function chamberSteps(state, chamber, before) {
  const villagers = (state.villagers ?? []).filter((v) => !(before.villagers ?? []).some((old) => old.id === v.id))
  return [
    `Chamber card: ${chamber.card.name}. ${chamber.card.goal}`,
    villagers.length > 0 && `Place these villager tokens on Chamber tiles, one per tile before doubling up: ${villagers.map((v) => v.name).join(', ')}.`,
    chamber.villain && `Place the ${chamber.villain} on a Chamber tile${chamber.card.setup.some((line) => /Chamber Entrance tile/i.test(line)) ? ' (the card says where)' : ''}.`,
    chamber.card.objective && `Place the ${chamber.card.objective.name} marker on any Chamber tile (${chamber.card.objective.hp} HP, AC ${chamber.card.objective.ac})${chamber.card.timeTokens ? ` with ${chamber.card.timeTokens} Time tokens on it` : ''}.`,
    chamber.card.addEncounter && (chamber.card.encounterTop ? 'The app puts its adventure encounter card on top of the encounter deck.' : 'The app shuffles its adventure encounter card into the top 3 encounter cards.'),
    ...monsterSteps(state, before),
  ].filter(Boolean)
}

// "Place these monsters on Chamber tiles": the chamber's new monsters and who they belong to.
function monsterSteps(state, before) {
  const placed = state.monsters.filter((m) => m.chamber && !before.monsters.some((old) => old.id === m.id))
  const owners = placed.map((m) => `${m.name} (${state.heroes.find((h) => h.id === m.ownerId)?.name ?? 'no one'})`)
  return placed.length > 0 ? [`Place these monsters on Chamber tiles, empty tiles first: ${owners.join(', ')}.`] : []
}

function reduce(state, action) {
  switch (action.type) {
    case 'NEW_GAME': {
      // A campaign goes on until it's over (or someone ends it), so its heroes come back to the lobby.
      const outcome = campaignOutcome(state)
      if (!state.campaign || outcome?.over) return initialState
      return campaignLobby({ ...initialState, campaign: state.campaign, lobbySurges: state.lobbySurges, lobbyTiles: state.lobbyTiles })
    }

    case 'CAMPAIGN_NEXT':
      return nextCampaignAdventure(state, action)

    case 'ROLL_FIRST': {
      if (state.status !== 'playing') return state
      const out = rollFirst(state.firstRoll, action.heroId, action.value, Date.now())
      if (!out) return state
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const value = Math.min(20, Math.max(1, Math.round(Number(action.value)) || 1))
      let next = withLog({ ...state, firstRoll: out.firstRoll }, `${heroLabel(hero)} rolled ${value} for first turn.`)
      if (value === 20) next = withMoment(next, { kind: 'crit', heroId: hero.id, value: 20, title: 'NATURAL 20!' })
      if (out.result?.winner) {
        const index = state.heroes.findIndex((h) => h.id === out.result.winner)
        next = withLog({ ...next, turn: { ...next.turn, heroIndex: index } }, `${state.heroes[index].name} goes first!`)
      }
      if (out.result?.tie) {
        const names = out.result.tie.map((id) => state.heroes.find((h) => h.id === id)?.name).join(' and ')
        next = withLog(next, `A tie! ${names} roll again.`)
      }
      return next
    }

    case 'SKIP_FIRST_ROLL': {
      if (!state.firstRoll || state.firstRoll.winner) return state
      const next = withLog({ ...state, firstRoll: null }, 'The heroes skipped the roll for first turn.')
      return state.firstRoll.after ? withMoment(next, state.firstRoll.after) : next
    }

    // The "X goes first!" screen has finished: show what waited for it (the starting
    // treasure). Every screen sends this when its roll screen closes; only the first counts.
    case 'FIRST_ROLL_DONE':
      if (!state.firstRoll?.winner || !state.firstRoll.after) return state
      return withMoment({ ...state, firstRoll: { ...state.firstRoll, after: null } }, state.firstRoll.after)

    case 'CAMPAIGN_BUY':
      return buyFromShop(state, action)

    case 'END_CAMPAIGN':
      if (state.status !== 'setup' || !state.campaign) return state
      return { ...state, campaign: null, lobbyAdventure: null, lobby: [] }

    case 'DRAW_TREASURE_TOKEN':
      return drawTreasureToken(state, action)

    case 'USE_BOON':
      return useBoon(state, action)

    case 'START_GAME': {
      // Without a hero list, the heroes come from the lobby.
      // Everyone in the lobby has to be ready first.
      if (!action.heroes && !(state.lobby ?? []).every((c) => c.ready)) return state
      const heroes = action.heroes ?? heroesFromLobby(state.lobby ?? [], state.campaign)
      if (state.status !== 'setup' || heroes.length === 0) return state
      const card = state.campaign?.card ?? state.lobbyAdventure
      // A campaign's adventure needs every hero of the campaign, and only them.
      if (state.campaign && !sameHeroes(heroes, state.campaign.heroes)) return state
      const campaign = state.campaign ?? (isCampaign(card) ? newCampaign(card, action.chambers, action.random) : null)
      const surges = campaignSurges(campaign, clamp(Number(state.lobbySurges) || STARTING_SURGES, MIN_SURGES, MAX_SURGES))
      const tiles = clamp(Number(state.lobbyTiles) || STARTING_TILES, MIN_TILES, MAX_TILES)
      let started = {
        ...initialState,
        status: 'playing',
        heroes: state.campaign ? heroes.map((h) => fromCampaign(h, campaignHero(state, h.key))) : heroes,
        surges,
        adventure: card ? { ...newAdventure(card), doubleEncounters: Boolean(campaign?.hard) } : null,
        tileStack: buildTileStack(tiles, card, action.tileRandom),
        campaign: campaign && { ...campaign, heroes: campaignHeroes(campaign, heroes, state.lobby ?? []) },
        tokenStack: campaign ? shuffle(Array.isArray(action.tokens) ? action.tokens : [], action.random) : null,
        firstRoll: newFirstRoll(heroes),
        // A solo game on the virtual board starts with the Start tile and the heroes on it.
        board: action.boardTiles ? newBoard(action.boardTiles, heroes) : null,
      }
      // The Vast Gate Opens: the gate is on the Start tile, and its Flares! card is in the top 3 encounters.
      const objective = card?.startObjective
      if (objective) {
        const { name, hp, ac } = objective
        started = { ...started, monsters: [{ id: newId('monster'), name, maxHp: hp, hp, ac, xp: 0, ownerId: null, conditions: [], objective: true, card: { hp, figures: 1, special: '', types: [], attacks: [], tactics: [] } }] }
      }
      if (card?.startEncounters?.length > 0) started = { ...started, encounterAdds: [...card.startEncounters] }
      const names = heroes.map((h) => h.name).join(', ')
      const begun = withLog(started, card ? `${card.title} begins with ${names}.` : `The adventure begins with ${names}.`)
      // Later campaign adventures: the heroes still have their treasure, so those cards stay out
      // of the deck. Everyone still draws a starting card, as every adventure begins.
      if (state.campaign) {
        const held = started.heroes.flatMap((h) => (h.items ?? []).map((i) => i.cardId))
        const deck = buildDeckWithout(action.treasureCards, held, action.random)
        return deck ? dealStartingTreasure(begun, action.treasureCards, action.random, deck) : begun
      }
      return dealStartingTreasure(begun, action.treasureCards, action.random)
    }

    case 'MOVE_HERO':
      return moveHero(state, action)
    case 'MOVE_TOKEN':
      return moveToken(state, action)

    case 'CHOOSE_ADVENTURE': {
      // Only before the game, and only an adventure the app can run.
      if (state.status !== 'setup' || state.campaign) return state
      const card = action.adventure ?? null
      if (card && !isPlayable(card)) return state
      return { ...state, lobbyAdventure: card }
    }

    case 'SET_LOBBY_SURGES':
      if (state.status !== 'setup') return state
      return { ...state, lobbySurges: clamp(Number(action.surges) || STARTING_SURGES, MIN_SURGES, MAX_SURGES) }

    case 'SET_LOBBY_TILES':
      if (state.status !== 'setup') return state
      return { ...state, lobbyTiles: clamp(Number(action.tiles) || STARTING_TILES, MIN_TILES, MAX_TILES) }

    case 'ADVENTURE_REVEAL':
      return revealTile(state, action)

    case 'DRAW_TILE':
      return drawDungeonTile(state, action)

    case 'ADVENTURE_STORY_DONE':
      if (!state.adventure?.story || state.adventure.story.id !== action.storyId) return state
      return { ...state, adventure: { ...state.adventure, story: null } }

    case 'ADVENTURE_TAKE_TOKEN': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const token = state.adventure?.tokens.find((t) => t.name === action.name && !t.heldBy)
      if (!hero || !token) return state
      const next = withLog(takeToken(state, action.name, hero.id), `${hero.name} picked up the ${action.name}!`)
      // Sneaky Endeavor's stolen item: a treasure card says what it is.
      if (!token.drawTreasure || next.turn.treasureOwed || next.treasure) return next
      return withMoment({ ...next, turn: { ...next.turn, treasureOwed: hero.id } }, { kind: 'treasure', heroId: hero.id, title: `${hero.name} found the ${action.name}!`, detail: 'Draw a treasure card to see what it is.' })
    }

    case 'ADVENTURE_CHAMBER_DONE': {
      // A chamber goal the app can't check (Treasure Hoard): the players say when it's done.
      const chamber = state.adventure?.chamber
      if (!chamber?.card.win.manual) return state
      return { ...state, adventure: { ...state.adventure, chamber: { ...chamber, done: Boolean(action.done) } } }
    }

    case 'DOOR_REVEALED':
      return revealDoor(state, action)

    case 'VILLAGER_ROLL':
      return villagerRoll(state, action)

    case 'VILLAGER_ATTACK':
      return villagerAttack(state, action)

    case 'ADJUST_VILLAGER_HP': {
      const villager = aliveVillagers(state).find((v) => v.id === action.villagerId)
      if (!villager) return state
      return hurtVillager(state, villager, clamp(villager.hp + action.amount, 0, villager.maxHp))
    }

    case 'DOOR_UNLOCK': {
      // Instead of attacking, a hero next to a Locked Door rolls to unlock it.
      const door = (state.adventure?.lockedDoors ?? []).find((d) => d.id === action.doorId)
      const hero = state.heroes.find((h) => h.id === action.heroId)
      if (!door || !hero || !validRoll(action.roll)) return state
      const unlocked = action.roll >= DOOR_UNLOCK_ROLL
      let next = withLog(state, `${hero.name} rolled ${action.roll} to unlock the door (needed ${DOOR_UNLOCK_ROLL}).${unlocked ? ' Unlocked!' : ''}`)
      if (unlocked) next = { ...next, adventure: { ...next.adventure, lockedDoors: next.adventure.lockedDoors.filter((d) => d.id !== door.id) } }
      return withMoment(next, {
        kind: unlocked ? 'defeat' : 'roll',
        heroId: hero.id,
        value: action.roll,
        title: unlocked ? 'The door is unlocked!' : 'Still locked',
        detail: unlocked ? 'Discard the Closed Door token.' : `${hero.name} needed ${DOOR_UNLOCK_ROLL} or more.`,
      })
    }

    case 'ADVENTURE_ESCAPED':
      if (!state.adventure) return state
      // Escaping only counts once every other goal is done.
      if (action.escaped && escapeBlockers(state).length > 0) return state
      return withLog({ ...state, adventure: { ...state.adventure, escaped: Boolean(action.escaped) } }, action.escaped ? 'The heroes escaped the dungeon!' : 'Not escaped after all.')

    case 'CLAIM_HERO': {
      const template = templateFor(action.heroKey)
      const lobby = state.lobby ?? []
      if (state.status !== 'setup' || !template || !action.deviceId) return state
      // One hero per iPad, and nobody can take a hero another iPad already has.
      if (lobby.some((c) => c.heroKey === template.key && c.deviceId !== action.deviceId)) return state
      // A campaign's heroes come back with their level, name and powers.
      const saved = campaignHero(state, template.key)
      if (state.campaign && !saved) return state
      const previous = lobby.find((c) => c.deviceId === action.deviceId)
      const slots = levelSlots(template, saved?.level)
      const picks = slots.map((_, i) => copyCard((saved ? saved.picks : action.picks)?.[i]))
      const claim = { deviceId: action.deviceId, heroKey: template.key, player: saved?.player ?? previous?.player ?? '', picks, ready: false }
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
        tileStack: buildTileStack(STARTING_TILES - 4, null),
        // The roll for first turn too, so it can be tried out (or skipped).
        firstRoll: newFirstRoll(heroes),
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
      // Keyleth's Healing Hands: her own surge heals 1 more. Anyone else's is offered,
      // since only the players know who is on Keyleth's tile.
      const own = hasAbility(hero, 'healing-hands') ? 1 : 0
      let healed = updateHero({ ...state, surges: state.surges - 1 }, hero.id, (h) => ({
        hp: Math.min(h.maxHp, h.surgeValue + own),
      }))
      if (!own && heroWith(state, 'healing-hands')) healed = addOffer(healed, 'healingHands', hero.id)
      healed = offerSavingGrace(healed, hero)
      const logged = withLog(healed, `${hero.name} used a healing surge${own ? ', +1 HP from Healing Hands' : ''}.`)
      if (state.turn.startDamageDue !== hero.id) return logged
      const { startDamageDue: _, ...turn } = logged.turn
      return startDamage({ ...logged, turn }, logged.heroes.find((h) => h.id === hero.id))
    }

    case 'SAVING_GRACE': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      if (!hero || !offers(state).savingGrace?.includes(hero.id) || !hero.conditions.includes(action.condition)) return state
      const next = updateHero(state, hero.id, (h) => ({ conditions: h.conditions.filter((c) => c !== action.condition) }))
      return withLog(dropOffer(next, 'savingGrace', hero.id), `Saving Grace: ${hero.name} is no longer ${action.condition}.`)
    }

    case 'HEALING_HANDS': {
      const hero = state.heroes.find((h) => h.id === action.heroId)
      if (!hero || !offers(state).healingHands?.includes(hero.id)) return state
      return healHero(dropOffer(state, 'healingHands', hero.id), hero.id, 1, 'Healing Hands')
    }

    case 'BRUTAL_RECOVERY': {
      const tarak = heroWith(state, 'brutal-recovery')
      const assault = tarak?.powers.find((p) => p.used && effectsOf(p).reaction === 'furious')
      if (!offers(state).brutalRecovery || !assault) return state
      const next = updateHero(dropOffer(state, 'brutalRecovery'), tarak.id, (h) => ({
        powers: h.powers.map((p) => (p.id === assault.id ? { ...p, used: false } : p)),
      }))
      return withLog(next, `Brutal Recovery: ${tarak.name} flipped Furious Assault back over.`)
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
      if (!hero || hero.level >= MAX_LEVEL || state.xp < XP_TO_LEVEL_UP || state.turn.natural20 !== hero.id) return state
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
      // A card's "draw a monster for that tile" (a Duergar, a villager) draws once per `drawKey`.
      if (action.drawKey && state.turn.monsterDraws?.[action.drawKey] !== undefined) return state
      const withDeck = state.monsterDeck ? state : { ...state, monsterDeck: buildDeck(action.cards, action.random) }
      const drawn = drawMonster(withDeck, action.heroId, action.random)
      if (!action.drawKey || drawn.monsterDeck === withDeck.monsterDeck) return drawn
      const added = drawn.monsters.length > state.monsters.length ? drawn.monsters[drawn.monsters.length - 1].name : 'none'
      return { ...drawn, turn: { ...drawn.turn, monsterDraws: { ...drawn.turn.monsterDraws, [action.drawKey]: added } } }
    }

    case 'MONSTER_ATTACK':
      return monsterAttack(state, action)

    case 'PLACE_VILLAIN':
      return placeVillain(state, action)

    case 'REMOVE_VILLAIN':
      // Put on the board by mistake: it goes away without counting as defeated.
      return { ...state, villains: (state.villains ?? []).filter((v) => v.id !== action.villainId) }

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

    case 'EVADE_HIT':
      return evadeHit(state, action)

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

    case 'MARK_ACTED': {
      // A monster, villain or trap finished its turn this Villain Phase. Kept in the game so
      // every screen sees it, and the turn can't pass until they all have.
      const acted = state.turn.acted ?? []
      if (!action.id || acted.includes(action.id)) return state
      return { ...state, turn: { ...state.turn, acted: [...acted, action.id] } }
    }

    case 'SET_EXPLORED': {
      // The Exploration Phase's question: is the hero on an unexplored edge? With no
      // new tile the phase is over, and the Villain Phase knows to draw an encounter.
      if (PHASES[state.turn.phase]?.key !== 'exploration') return state
      let explored = Boolean(action.explored)
      // With the tile stack, saying yes draws the tile. An empty stack means no new tile.
      if (explored && state.tileStack) {
        if (state.tileStack.stack.length === 0) {
          explored = false
          state = { ...state, turn: { ...state.turn, noTiles: true } }
        } else {
          const drawn = drawDungeonTile(state, { ...action, key: 'explore', from: 'top' })
          return { ...drawn, turn: { ...drawn.turn, explored: true } }
        }
      }
      // A card's end-of-Exploration question (Wrath of the Enemy) holds the phase open.
      if (!explored && phaseChecks(state, 'exploration').length > 0) return { ...state, turn: { ...state.turn, explored } }
      // Skipping ahead ends the Exploration Phase, so its curse rolls happen now.
      const ended = explored ? state : endPhaseCurses(state, state.heroes[state.turn.heroIndex], 'exploration', action.rolls)
      return { ...ended, turn: { ...ended.turn, explored, phase: explored ? ended.turn.phase : ended.turn.phase + 1 } }
    }

    case 'ADJUST_MONSTER_HP':
      return updateMonster(state, action.monsterId, (m) => ({ hp: clamp(m.hp + action.amount, 0, m.maxHp) }))

    case 'TOGGLE_MONSTER_CONDITION':
      return updateMonster(state, action.monsterId, (m) => ({ conditions: toggle(m.conditions, action.condition) }))

    case 'DEFEAT_MONSTER': {
      const villain = activeVillains(state).find((v) => v.id === action.monsterId)
      if (villain) {
        // The Rage Drake still flips to its enraged side the first time.
        const { state: next, defeated } = defeatVillain(state, villain)
        return defeated ? withMoment(next, { kind: 'defeat', art: monsterArt(villain), title: `${villain.name} defeated!`, detail: '' }) : next
      }
      const monster = state.monsters.find((m) => m.id === action.monsterId)
      if (!monster) return state
      if (monster.objective) {
        // The Altar isn't a monster: no XP and no treasure, but it counts for the chamber's goal.
        const next = { ...state, monsters: state.monsters.filter((m) => m.id !== monster.id) }
        return withMoment(withLog(next, `The ${monster.name} was destroyed!`), { kind: 'defeat', title: `The ${monster.name} is destroyed!`, detail: '' })
      }
      // One treasure card per turn, for the first monster defeated.
      const treasure = !state.turn.treasureDrawn
      const counted = countDefeat(state, monster, figuresLeft(monster, monster.hp), true)
      const winner = action.heroId ?? state.heroes[state.turn.heroIndex]?.id ?? null
      const next = {
        ...counted,
        xp: state.xp + monster.xp,
        monsters: state.monsters.filter((m) => m.id !== monster.id),
        turn: treasure ? oweTreasure(state, winner) : state.turn,
      }
      return withMoment(withLog(next, `The ${monster.name} was defeated! +${monster.xp} XP`), {
        kind: 'defeat',
        art: monsterArt(monster),
        title: `${monster.name} defeated!`,
        detail: `+${monster.xp} XP for the party${treasure ? `. ${treasureWords(state)}` : ''}`,
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
      if (state.xp < cost || (p && !helps) || state.encounter?.attacked || state.encounter?.card.noCancel) return state
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
        source: { kind: 'encounter' },
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
        oweEncounter(next, `${encounter.card.name} was discarded because the tile already had a marker, so draw a new card.`),
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
        moment: { title: `${trap.name}!`, trap: true },
        source: { kind: 'trap', trapId: trap.id },
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
        trap: true,
        title: `${trap.name}!`,
        detail: downed.length > 0 ? `${downed.join(' and ')} ${downed.length > 1 ? 'are' : 'is'} down!` : `${damage} damage`,
      })
    }

    case 'DISABLE_TRAP': {
      // Instead of attacking, a hero on the trap's tile rolls to disable it (Kobold Trappers makes it harder).
      const trap = (state.traps ?? []).find((t) => t.id === action.trapId && t.type === 'trap')
      const hero = state.heroes.find((h) => h.id === action.heroId)
      // Practiced Evasion's roll is free; otherwise this is the active hero's attack.
      if (!trap || !hero || !validRoll(action.roll) || (!action.free && !canSpendAttack(state, hero))) return state
      const penalty = state.environment?.card?.trapPenalty ?? 0
      const tools = itemTrapBonus(hero)
      const total = action.roll - penalty + tools
      const target = trap.card.trap?.disable ?? 10
      const disabled = total >= target
      const sum = penalty || tools ? `${action.roll}${tools ? ` + ${tools}` : ''}${penalty ? ` − ${penalty}` : ''} = ${total}` : `${action.roll}`
      let next = withLog(action.free ? state : spendAttack(state, hero, `the ${trap.name}`), `${hero.name} rolled ${sum} to disable the ${trap.name} (needed ${target}).${disabled ? ' Disabled!' : ''}`)
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
      // A curse a hero can try to end with a roll instead of attacking (opening the Cage).
      // The active hero rolls for their own curse, or for a hero on their tile, and it
      // takes the place of their attack this turn.
      const hero = state.heroes.find((h) => h.id === action.heroId)
      const curse = hero?.curses?.find((c) => c.id === action.curseId)
      const removeRoll = curse?.card?.removeRoll
      if (!removeRoll || removeRoll.phase !== 'action' || !validRoll(action.roll)) return state
      const helper = state.heroes[state.turn.heroIndex]
      if (!canSpendAttack(state, helper)) return state
      const broken = action.roll >= removeRoll.target
      const who = helper.id === hero.id ? hero.name : `${helper.name}, helping ${hero.name},`
      const tried = spendAttack(state, helper, `the ${curse.name}`)
      const next = broken
        ? removeCurse(tried, hero.id, curse.id, `${who} rolled ${action.roll}. ${hero.name} is free of the ${curse.name}!`)
        : withLog(tried, `${who} rolled ${action.roll} against the ${curse.name} (needed ${removeRoll.target}).`)
      return withMoment(next, {
        kind: broken ? 'defeat' : 'roll',
        heroId: helper.id,
        value: action.roll,
        title: broken ? `${hero.name} is free of the ${curse.name}!` : `${hero.name} is still stuck in the ${curse.name}`,
        detail: `${helper.name} needed ${removeRoll.target}.`,
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

    case 'UPDATE_ENCOUNTER_CARDS':
      return updateEncounterCards(state, action.cards)

    case 'ANSWER_CHECK':
      return answerCheck(state, action)

    case 'SET_TRIANGLE':
      // The Villain Phase's question: does the new tile have a black triangle?
      return { ...state, turn: { ...state.turn, triangle: Boolean(action.triangle) } }


    case 'ADJUST_SURGES':
      return { ...state, surges: Math.max(0, state.surges + action.amount) }

    case 'ADJUST_TILES':
      return adjustTiles(state, action.amount)

    case 'NEXT_PHASE': {
      const { heroIndex, phase, round } = state.turn
      // The phase's questions (Walls of Magma, Dragon Fear...) have to be answered first.
      if (phaseChecks(state, checksFor(PHASES[phase].key)).length > 0) return state
      // A hero who started the turn at 0 HP spends a healing surge before anything else.
      if (state.turn.startDamageDue && state.status === 'playing') return state
      // With villagers in play, the Hero Phase ends with the roll for one of them.
      if (villagerRollDue(state)) return state
      if (phase < PHASES.length - 1) {
        const ended = endPhaseCurses(state, state.heroes[heroIndex], PHASES[phase].key, action.rolls)
        const next = { ...ended, turn: { ...ended.turn, phase: phase + 1 } }
        return PHASES[phase].key === 'hero' ? endHeroPhase(next, next.heroes[heroIndex], action.roll) : next
      }
      // An encounter or treasure card has to be finished before the turn moves on.
      if (state.encounter || state.treasure) return state
      const nextIndex = (heroIndex + 1) % state.heroes.length
      // Read-aloud text belongs to the turn it came up in; it doesn't stay on the projector.
      const told = state.adventure?.story ? { ...state, adventure: { ...state.adventure, story: null } } : state
      return startTurn({
        ...endPhaseCurses(told, state.heroes[heroIndex], 'villain', action.rolls),
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

    case 'PLAY_BOARD_SOUND':
      return playBoardSound(state, action)

    case 'SET_SOUNDBOARD_OFF':
      return setBoardOff(state, action.off)

    case 'SET_SOUNDBOARD_UNLIMITED':
      return setBoardUnlimited(state, action.unlimited)

    default:
      return state
  }
}
