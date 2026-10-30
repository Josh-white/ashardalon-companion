// Small helpers the game rules share: ids, the log, big moments, changing a hero or
// monster, and shuffling with the numbers a device sent (see state/random.js).

let idCounter = 0

export const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

// The newest entry first. Each entry keeps whose turn it was (heroIndex), so a hero's iPad
// can show what happened since that hero's last turn (state/sinceLastTurn.js). 200 entries
// covers a long round with four or five heroes.
export const LOG_LIMIT = 200

export const withLog = (state, text) => ({
  ...state,
  log: [{ id: newId('log'), round: state.turn.round, heroIndex: state.turn.heroIndex, text }, ...state.log].slice(0, LOG_LIMIT),
})

export const withMoment = (state, moment) => ({
  ...state,
  moment: { id: newId('moment'), at: Date.now(), ...moment },
})

// A villain arriving, flipping to its enraged side or falling, so the narrator gives it
// its line even when a later moment (the chamber, the hero's attack) takes the screen.
export const withVillainCall = (state, villain, when) => ({
  ...state,
  villainCalls: [...(state.villainCalls ?? []), { id: newId('call'), at: Date.now(), villainId: villain.id, when }].slice(-4),
})

// A power used outside an attack (healing, a token, a dodge), so screens can play its sound.
export const withCast = (state, power) => ({ ...state, cast: { id: newId('cast'), at: Date.now(), power: power.name } })

export const heroLabel = (hero) => hero.player || hero.name

export const updateHero = (state, heroId, change) => ({
  ...state,
  heroes: state.heroes.map((hero) => (hero.id === heroId ? { ...hero, ...change(hero) } : hero)),
})

export const updateMonster = (state, monsterId, change) => {
  const update = (list) => list.map((monster) => (monster.id === monsterId ? { ...monster, ...change(monster) } : monster))
  return state.villains?.some((v) => v.id === monsterId)
    ? { ...state, villains: update(state.villains) }
    : { ...state, monsters: update(state.monsters) }
}

// Villains still on the board. Heroes attack them like monsters, and they take turns like monsters.
export const activeVillains = (state) => (state.villains ?? []).filter((v) => !v.defeated)

// Everything a hero can attack: the monsters, then the villains.
export const foes = (state) => [...state.monsters, ...activeVillains(state)]

export const findFoe = (state, id) => foes(state).find((m) => m.id === id)

export const toggle = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

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

export function buildDeck(cards = [], random) {
  const byId = Object.fromEntries(cards.map((card) => [card.id, card]))
  // Adventure cards wait outside the deck until something adds them.
  const ids = cards.filter((card) => !card.adventure).flatMap((card) => Array.from({ length: card.copies ?? 1 }, () => card.id))
  return { cards: byId, draw: shuffle(ids, random), discard: [] }
}

export const article = (name) => (/^[AEIOU]/.test(name) ? 'an' : 'a')

// Draws the top card of a deck, shuffling the discards into a new deck when it runs out.
export function drawTop(deck, random) {
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

export const markUsed = (state, heroId, powerId) =>
  updateHero(state, heroId, (h) => ({ powers: h.powers.map((p) => (p.id === powerId ? { ...p, used: true } : p)) }))

export const validRoll = (roll) => Number.isInteger(roll) && roll >= 1 && roll <= 20

// One of the list, picked with a random number the device sent along.
export const pick = (list, r) => list[Math.min(list.length - 1, Math.floor((Number.isFinite(Number(r)) ? Number(r) : 0) * list.length))]

export const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()
