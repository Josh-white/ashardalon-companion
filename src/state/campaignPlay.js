// A campaign game (state/campaign.js has the campaign itself): heroes carried over to
// the next adventure, the shop, treasure tokens and boons. The reducer is in game.js.
import { templateFor } from '../data/heroes.js'
import { monsterArt } from '../data/art.js'
import { campaignHero, campaignOutcome, shopCards, shopSize } from './campaign.js'
import { buildDeck, newId, sameName, updateHero, withLog, withMoment } from './gameHelpers.js'
import { discardMonsterCard } from './monsterDeck.js'
import { copyCard, levelSlots } from './heroSetup.js'
import { initialState } from './initialState.js'
import { drawDungeonTile } from './dungeon.js'
import { pickTownEvent, townEventEffect } from '../data/townEvents.js'

export const sameHeroes = (heroes, saved) => heroes.length === saved.length && saved.every((s) => heroes.some((h) => h.key === s.key))

// What a campaign hero takes into the next adventure: level, gold, items (face up again) and powers.
export const heroRecord = (hero, deviceId = null) => ({
  key: hero.key,
  deviceId,
  player: hero.player ?? '',
  level: hero.level,
  gold: hero.gold ?? 0,
  items: (hero.items ?? []).map((item) => ({ ...item, used: false })),
  picks: hero.powers.map((p) => p.card ?? null),
})

export const campaignHeroes = (campaign, heroes, lobby) =>
  heroes.map((hero) => heroRecord(hero, lobby.find((c) => c.heroKey === hero.key)?.deviceId ?? campaign.heroes.find((h) => h.key === hero.key)?.deviceId ?? null))

// A hero entering a later campaign adventure gets back the gold and items they had.
export const fromCampaign = (hero, saved) => (saved ? { ...hero, gold: saved.gold, items: saved.items.map((item) => ({ ...item, id: newId('item') })) } : hero)

// The lobby for the campaign's next adventure: each iPad gets its hero back, waiting to get ready.
export function campaignLobby(state) {
  const lobby = state.campaign.heroes
    .filter((h) => h.deviceId && templateFor(h.key))
    .map((h) => {
      const template = templateFor(h.key)
      return { deviceId: h.deviceId, heroKey: h.key, player: h.player, picks: levelSlots(template, h.level).map((_, i) => copyCard(h.picks[i])), ready: false }
    })
  return { ...state, lobby, lobbyAdventure: state.campaign.card }
}

// A deck without the cards the heroes already hold (one copy each).
export function buildDeckWithout(cards, heldIds, random) {
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
export function nextCampaignAdventure(state, action) {
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
  // A night in town: one event, with the last of the shuffle numbers (the shop uses the first ones).
  const numbers = Array.isArray(action.random) ? action.random : []
  const event = pickTownEvent(numbers[numbers.length - 1], state.campaign.event?.id)
  if (event.gold) campaign.heroes = campaign.heroes.map((h) => ({ ...h, gold: Math.max(0, h.gold + event.gold) }))
  campaign.event = { id: event.id, icon: event.icon, title: event.title, text: event.text, effect: townEventEffect(event), surges: event.surges ?? 0, xp: event.xp ?? 0 }
  const held = campaign.heroes.flatMap((h) => h.items.map((i) => i.cardId))
  const shop = shopCards(action.treasureCards, held, shopSize({ campaign }, action.boons) + (event.shop ?? 0), action.random)
  return campaignLobby({ ...initialState, campaign: { ...campaign, shop }, lobbySurges: state.lobbySurges, lobbyTiles: state.lobbyTiles, lobbyBoard: state.lobbyBoard, lobbyDifficulty: state.lobbyDifficulty })
}

// Between adventures a hero buys a shop card with their own gold.
export function buyFromShop(state, action) {
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
export function drawTreasureToken(state, action) {
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
export function useBoon(state, action) {
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
    return withMoment(spent(withLog(next, `The party used ${boon.name}.`)), { kind: 'roll', title: boon.name, detail: 'Place the top dungeon tile next to any unexplored edge. No monster and no encounter card for it.', read: boon.text })
  }
  if (boon.use === 'discardMonster') {
    const monster = state.monsters.find((m) => m.id === action.monsterId)
    if (!monster || monster.drawnAt !== turnKey(state) || !(monster.card?.types ?? []).some((t) => (boon.monsterTypes ?? []).some((want) => sameName(t, want)))) return state
    const next = discardMonsterCard({ ...state, monsters: state.monsters.filter((m) => m.id !== monster.id) }, monster)
    return withMoment(spent(withLog(next, `${boon.name}: the ${monster.name} card is discarded.`)), { kind: 'defeat', art: monsterArt(monster), title: boon.name, detail: `Take the ${monster.name} off the board. Its card is discarded.`, read: boon.text })
  }
  return state
}

// Marks monsters with the turn they came out, for boons that work on a monster just drawn.
export function tagDrawn(state) {
  if (!state.monsters?.some((m) => !m.drawnAt)) return state
  const key = turnKey(state)
  return { ...state, monsters: state.monsters.map((m) => (m.drawnAt ? m : { ...m, drawnAt: key })) }
}
