// The virtual treasure deck and the items heroes carry: drawing, keeping, spending,
// and the starting treasure some adventures deal.
import { heroItems } from '../data/items.js'
import { article, buildDeck, drawTop, heroLabel, newId, updateHero, withLog, withMoment } from './gameHelpers.js'

// The first monster defeated in a turn earns a treasure card, or in a campaign a Treasure
// token (gold, or now and then a treasure card).
export const oweTreasure = (state, heroId) =>
  state.campaign ? { ...state.turn, treasureDrawn: true, tokenOwed: heroId } : { ...state.turn, treasureDrawn: true, treasureOwed: heroId }

export const treasureWords = (state) => (state.campaign ? 'Draw a Treasure token!' : 'Draw a treasure card!')

export const discardTreasureCard = (state, cardId) =>
  state.treasureDeck && cardId
    ? { ...state, treasureDeck: { ...state.treasureDeck, discard: [...state.treasureDeck.discard, cardId] } }
    : state

// An item that's been used flips over (like a used daily) or goes to the treasure discards.
export function spendItem(state, heroId, itemId, how) {
  const hero = state.heroes.find((h) => h.id === heroId)
  const item = heroItems(hero).find((i) => i.id === itemId)
  const after = how ?? item?.card?.after
  if (!item || !after) return state
  if (after === 'flip') return updateHero(state, hero.id, (h) => ({ items: h.items.map((i) => (i.id === item.id ? { ...i, used: true } : i)) }))
  const next = updateHero(state, hero.id, (h) => ({ items: h.items.filter((i) => i.id !== item.id) }))
  return discardTreasureCard(next, item.cardId)
}

// Defeating a monster earns a treasure card; the device sends the cards and shuffle numbers.
export function drawTreasure(state, action) {
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
export function dealStartingTreasure(state, cards, random, deck = null) {
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
export function keepTreasure(state, action) {
  const treasure = state.treasure
  const hero = state.heroes.find((h) => h.id === (action.heroId ?? treasure?.heroId))
  if (!treasure || !hero) return state
  const { card } = treasure
  const item = { id: newId('item'), cardId: card.id, name: card.name, used: false, card }
  const next = updateHero({ ...state, treasure: null }, hero.id, (h) => ({ items: [...(h.items ?? []), item] }))
  return withLog(next, card.inPlay ? `${hero.name} put the ${card.name} into play.` : `${hero.name} took the ${card.name}.`)
}
