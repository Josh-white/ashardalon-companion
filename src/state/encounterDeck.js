// The virtual encounter deck: drawing a card for a hero, and the cards that go back
// into it on top or in the top three.
import { buildDeck, drawTop, heroLabel, newId, withLog, withMoment } from './gameHelpers.js'

export const discardEncounterCard = (state, cardId) =>
  state.encounterDeck && cardId
    ? { ...state, encounterDeck: { ...state.encounterDeck, discard: [...state.encounterDeck.discard, cardId] } }
    : state

export const ENCOUNTER_LABELS = { event: 'Event', curse: 'Curse', environment: 'Environment', hazard: 'Hazard', trap: 'Trap' }

// Shuffles a card in among the top 3 cards of the encounter deck ("shuffle this card with
// the top 3 Encounter Cards and return the 4 cards to the top of the deck").
export function intoTopThree(deck, cardId, card, random = []) {
  const r = Number(random[0])
  const slot = Math.floor((Number.isFinite(r) && r >= 0 && r < 1 ? r : 0) * (Math.min(3, deck.draw.length) + 1))
  const draw = deck.draw.filter((id) => id !== cardId)
  return { ...deck, cards: { ...deck.cards, [cardId]: deck.cards[cardId] ?? card }, draw: [...draw.slice(0, slot), cardId, ...draw.slice(slot)], discard: deck.discard.filter((id) => id !== cardId) }
}

// Puts a card on top of the encounter deck.
export function ontoTop(deck, cardId, card) {
  return { ...deck, cards: { ...deck.cards, [cardId]: deck.cards[cardId] ?? card }, draw: [cardId, ...deck.draw.filter((id) => id !== cardId)], discard: deck.discard.filter((id) => id !== cardId) }
}

export function drawEncounter(state, action) {
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

// One more encounter card this Villain Phase, with the reason shown on the button.
export const oweEncounter = (state, why) => ({
  ...state,
  turn: { ...state.turn, encountersOwed: (state.turn.encountersOwed ?? 0) + 1, owedBecause: [...(state.turn.owedBecause ?? []), why] },
})
