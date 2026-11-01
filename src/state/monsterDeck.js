// The virtual monster deck: drawing a monster for a hero, discarding a defeated one's
// card, and the encounters that draw a monster of one kind.
import { monsterArt } from '../data/art.js'
import { PHASES } from '../data/phases.js'
import { objectiveInPlay, onceOnlyDraw } from './adventure.js'
import { activeVillains, article, buildDeck, drawTop, heroLabel, newId, sameName, shuffle, withLog, withMoment } from './gameHelpers.js'

// A monster in play, with the card copied in so its tactics and attacks travel with it.
export function monsterFromCard(card, ownerId) {
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

// Draws a monster card for a hero. A hero never has two cards of the same monster, so
// cards they already have are discarded until a new one turns up. The discards are
// shuffled into a new deck when the deck runs out.
// The monster cards not on the board now: each card's copies, less the monsters in play.
function cardsNotInPlay(state, deck) {
  const inPlay = state.monsters.map((m) => m.cardId)
  const ids = []
  for (const card of Object.values(deck.cards ?? {}).filter((c) => !c.adventure)) {
    const copies = (card.copies ?? 1) - inPlay.filter((id) => id === card.id).length
    for (let i = 0; i < copies; i++) ids.push(card.id)
  }
  return ids
}

export function drawMonster(state, heroId, random) {
  const hero = state.heroes.find((h) => h.id === heroId)
  const deck = state.monsterDeck
  if (!hero || !deck) return state
  const owned = new Set(state.monsters.filter((m) => m.ownerId === hero.id).map((m) => m.cardId))
  let { draw, discard } = deck
  let next = state
  let reshuffled = false
  const skipped = []
  let cardId = null
  // Every card gone (the defeated ones sit in the XP pile, and the app keeps XP as a number):
  // the cards of monsters not on the board come back as a new deck, so monsters keep coming.
  if (draw.length === 0 && discard.length === 0) {
    discard = cardsNotInPlay(state, deck)
    if (discard.length > 0) next = withLog(next, 'The monster deck ran out: the defeated monsters were shuffled into a new deck.')
  }
  while (cardId === null) {
    if (draw.length === 0) {
      if (discard.length === 0 || reshuffled) {
        // Nothing to draw: no monster comes, and the turn goes on (the draw counts as done).
        const exploring = PHASES[state.turn.phase]?.key === 'exploration' && state.heroes[state.turn.heroIndex]?.id === hero.id
        const done = { ...state, turn: exploring ? { ...state.turn, monsterDrawn: true } : state.turn, encounter: state.encounter ? { ...state.encounter, monsterDrawn: true } : state.encounter }
        return withLog(done, `There's no monster card left that ${hero.name} doesn't already have, so no monster comes this time.`)
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
export const discardMonsterCard = (state, monster) =>
  monster.cardId && state.monsterDeck
    ? { ...state, monsterDeck: { ...state.monsterDeck, discard: [...state.monsterDeck.discard, monster.cardId] } }
    : state

// "Draw 5 Monster Cards. Discard any Monster that is not an Orc. Shuffle the remaining
// cards and put them on top of the Monster Card deck."
export function filterMonsterDeck(state, type, random, cards = []) {
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
export function drawMonsterOfType(state, heroId, type, random, cards = []) {
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
