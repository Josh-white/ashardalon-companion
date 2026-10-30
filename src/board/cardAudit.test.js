import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { createHero, gameReducer, initialState, phaseChecks } from '../state/game.js'
import { boardAnswer } from './checks.js'
import { markerOnHeroTile } from './markers.js'
import { foesInRange, powerRange, wrathPull } from './monsters.js'
import { hitMoveStep, moveChoices, movePrompt, moveTargets, queueFoeStep } from './powerMoves.js'
import { heroesInReach } from './encounters.js'
import { sentryMoves } from './monsters.js'
import { tilesBetween } from './paths.js'
import { boardGrid, layTile } from './play.js'
import { heroReach, movesLeft } from './play.js'
import { normalizeTiles } from './tileDefs.js'

// Cards that should use the virtual board (the card audit): each test is one card.

// A made-up Start tile with a room north of it and another north of that.
const TILES = normalizeTiles(
  [
    {
      id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'],
      exits: { N: 'ooox', S: 'ooox', W: 'oooooooo', E: 'xxxxxxxx' },
      features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
    },
    { id: 'room', name: 'Room', kind: 'regular', triangle: 'black', rows: ['....', '.S..', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooo', E: 'oooo' } },
  ],
  [],
)

const file = normalizeCardFile({
  powers: [],
  monsters: [
    { id: 'rat', name: 'Rat', copies: 3, ac: 12, hp: 1, xp: 1, types: ['Animal'], attacks: [{ id: 'bite', name: 'Bite', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] },
    { id: 'ooze', name: 'Ooze', copies: 3, ac: 10, hp: 2, xp: 2, types: ['Aberrant'], attacks: [{ id: 'slap', name: 'Slap', bonus: 5, damage: 2 }], tactics: [{ move: 'toward' }] },
  ],
  villains: [
    { id: 'dragon', name: 'Dragon', ac: 15, hp: 9, attacks: [{ id: 'claw', name: 'Claw', bonus: 9, damage: 3 }], tactics: [{ move: 'toward' }] },
    { id: 'captain', name: 'Captain', ac: 15, hp: 9, attacks: [{ id: 'star', name: 'Morning Star', bonus: 30, damage: 1, effect: 'Move the Hero 1 tile away from the duergar.' }], tactics: [{ move: 'toward' }] },
    { id: 'otyugh', name: 'Otyugh', ac: 15, hp: 9, attacks: [{ id: 'tentacle', name: 'Tentacle', bonus: 30, damage: 1, effect: 'Move the Hero to any square adjacent to the Otyugh.' }], tactics: [{ move: 'toward' }] },
  ],
  encounters: [
    { id: 'cage', name: 'Cage', type: 'curse', text: 'You are cursed!', curse: { acPenalty: 2, removeRoll: { phase: 'action', target: 10 } } },
    {
      id: 'a-gap-in-the-armor', name: 'A Gap in the Armor', type: 'curse', text: 'You are cursed!', curse: { acPenalty: 4 },
      checks: [{ phase: 'hero', ask: 'Did {hero} move during this Hero Phase?', no: { remove: true } }],
    },
    {
      id: 'wrath-of-the-enemy', name: 'Wrath of the Enemy', type: 'curse', text: 'You are cursed!', curse: {},
      checks: [{ phase: 'exploration', note: "Wrath of the Enemy: put the closest monster that isn't on {hero}'s tile next to {hero}." }],
    },
    { id: 'pit', name: 'Pit', type: 'hazard', text: 'Place the Pit marker on the active Hero\'s tile.' },
    { id: 'whirling-blades', name: 'Whirling Blades', type: 'trap', text: 'Trigger the trap: Move the Whirling Blades marker one tile toward the closest Hero.' },
    { id: 'arrives', name: 'Arrives', type: 'event', adventure: true, noCancel: true, placeVillain: 'dragon', text: 'Place the dragon.' },
    { id: 'flares', name: 'Flares', type: 'event', adventure: true, noCancel: true, objective: 'Gate', drawMonsterType: 'Aberrant', text: 'An Aberrant comes out.' },
    { id: 'occupied-lair', name: 'Occupied Lair', type: 'event', drawMonster: true, text: 'A lair.' },
    { id: 'concussive-blast', name: 'Concussive Blast', type: 'event', text: 'Attack each Hero on the active Hero\'s tile.' },
    { id: 'quick-advance', name: 'Quick Advance', type: 'event', text: 'A monster moves closer.' },
    { id: 'blinding-bomb', name: 'Blinding Bomb', type: 'event', text: 'Sentries move.' },
  ],
})
const card = (id) => file.encounters.find((c) => c.id === id)

// Two heroes on the Start tile's north half, the rooms north of it.
function game() {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
  let state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  const tiles = [...state.board.tiles, { uid: 't1', tileId: 'room', at: [0, -4], turn: 0 }, { uid: 't2', tileId: 'room', at: [0, -8], turn: 0 }]
  const [a, b] = state.heroes
  state = { ...state, firstRoll: null, board: { ...state.board, tiles, tokens: { [a.id]: [0, 2], [b.id]: [1, 1] } } }
  return { state, heroes: state.heroes }
}
const curse = (state, heroId, id) => ({
  ...state,
  heroes: state.heroes.map((h) => (h.id === heroId ? { ...h, curses: [...(h.curses ?? []), { id: `curse-${id}`, cardId: id, name: card(id).name, card: card(id).curse, checks: card(id).checks ?? [] }] } : h)),
})
const encounter = (state, id) => ({ ...state, encounter: { id: 'enc1', cardId: id, card: card(id), heroId: state.heroes[0].id } })
const resolve = (state) => gameReducer(state, { type: 'RESOLVE_ENCOUNTER', monsterCards: file.monsters, villains: file.villains, random: [] })

describe('A Gap in the Armor', () => {
  const ask = (name) => `Did ${name} move during this Hero Phase?`

  it('the board says whether the hero moved this Hero Phase', () => {
    const { state, heroes } = game()
    expect(boardAnswer(state, ask(heroes[0].name))).toMatchObject({ answer: false })
    const moved = gameReducer(state, { type: 'MOVE_HERO', heroId: heroes[0].id, to: [0, 5] })
    expect(boardAnswer(moved, ask(heroes[0].name))).toMatchObject({ answer: true })
    // Only the active hero's turn is followed.
    expect(boardAnswer(moved, ask(heroes[1].name))).toBeNull()
  })

  it('a hero who stayed put loses the curse at the end of the Hero Phase', () => {
    let { state, heroes } = game()
    state = curse(state, heroes[0].id, 'a-gap-in-the-armor')
    const [check] = phaseChecks(state, 'hero')
    const board = boardAnswer(state, check.ask.replace('{hero}', heroes[0].name))
    state = gameReducer(state, { type: 'ANSWER_CHECK', key: check.key, answer: board.answer })
    expect(state.heroes[0].curses).toEqual([])
  })
})

describe('Cage', () => {
  it('a caged hero gets no squares to walk to on the board', () => {
    let { state, heroes } = game()
    expect(movesLeft(state, heroes[0])).toBe(2)
    state = curse(state, heroes[0].id, 'cage')
    expect(movesLeft(state, state.heroes[0])).toBe(0)
    expect(heroReach(state, state.heroes[0])).toEqual([])
    expect(gameReducer(state, { type: 'MOVE_HERO', heroId: heroes[0].id, to: [0, 5] })).toBe(state)
  })
})

describe('Wrath of the Enemy', () => {
  const withRats = (state) => ({
    ...state,
    monsters: [
      { id: 'm1', cardId: 'rat', name: 'Rat', hp: 1, ac: 12, ownerId: state.heroes[1].id, card: { hp: 1 } },
      { id: 'm2', cardId: 'ooze', name: 'Ooze', hp: 2, ac: 10, ownerId: state.heroes[1].id, card: { hp: 2 } },
    ],
    board: { ...state.board, tokens: { ...state.board.tokens, m1: [2, -2], m2: [2, -7] } },
  })

  it('pulls the closest monster off another tile next to the hero', () => {
    const { state, heroes } = game()
    const pull = wrathPull(withRats(state), heroes[0].id)
    expect(pull).toMatchObject({ id: 'm1', name: 'Rat' })
    expect(Math.max(Math.abs(pull.to[0] - 0), Math.abs(pull.to[1] - 2))).toBe(1)
  })

  it('skips a monster already on the hero\'s tile, and the board moves it when the note is done', () => {
    let { state, heroes } = game()
    state = withRats(state)
    state = { ...state, board: { ...state.board, tokens: { ...state.board.tokens, m1: [2, 0] } } }
    state = curse(state, heroes[0].id, 'wrath-of-the-enemy')
    state = { ...state, turn: { ...state.turn, phase: 1 } }
    const [check] = phaseChecks(state, 'exploration')
    const after = gameReducer(state, { type: 'ANSWER_CHECK', key: check.key, answer: true })
    const at = after.board.tokens.m2
    expect(Math.max(Math.abs(at[0] - 0), Math.abs(at[1] - 2))).toBe(1)
    expect(after.board.tokens.m1).toEqual([2, 0])
  })

  it('does nothing without a monster on another tile', () => {
    const { state, heroes } = game()
    expect(wrathPull(state, heroes[0].id)).toBeNull()
  })
})

describe('a new trap or hazard: is there a marker on the tile already?', () => {
  const marker = (cardId, tile) => ({ id: `trap-${cardId}`, cardId, name: card(cardId).name, type: card(cardId).type, tile, card: card(cardId) })

  it('the board knows the markers on the hero\'s tile', () => {
    const { state, heroes } = game()
    expect(markerOnHeroTile(state, heroes[0])).toBe(false)
    expect(markerOnHeroTile({ ...state, traps: [marker('pit', 'start')] }, heroes[0])).toMatchObject({ cardId: 'pit' })
    expect(markerOnHeroTile({ ...state, traps: [marker('pit', 't1')] }, heroes[0])).toBe(false)
  })

  it('asks when a marker could be anywhere', () => {
    const { state, heroes } = game()
    expect(markerOnHeroTile({ ...state, traps: [marker('whirling-blades', 't1')] }, heroes[0])).toBeNull()
    expect(markerOnHeroTile({ ...state, traps: [marker('pit', undefined)] }, heroes[0])).toBeNull()
    expect(markerOnHeroTile({ ...state, board: null }, heroes[0])).toBeNull()
  })
})

describe('Ashardalon Arrives! and The Vast Gate Flares!', () => {
  it('puts an arriving villain on the board, on the tile with an unexplored edge closest to the hero', () => {
    const { state } = game()
    const after = resolve(encounter(state, 'arrives'))
    const dragon = after.villains.find((v) => v.name === 'Dragon')
    expect(after.board.tokens[dragon.id]).toBeDefined()
  })

  it('puts the Aberrant next to the Vast Gate', () => {
    let { state } = game()
    const gate = { id: 'gate', name: 'Gate', objective: true, hp: 5, ac: 12, card: { hp: 5 } }
    state = { ...state, monsters: [gate], board: { ...state.board, tokens: { ...state.board.tokens, gate: [1, -6] } } }
    const after = resolve(encounter(state, 'flares'))
    const ooze = after.monsters.find((m) => m.name === 'Ooze')
    const at = after.board.tokens[ooze.id]
    expect(Math.max(Math.abs(at[0] - 1), Math.abs(at[1] + 6))).toBe(1)
  })
})

describe('Occupied Lair', () => {
  it('a Treasure token waits for its square', () => {
    const { state } = game()
    const after = resolve({ ...encounter(state, 'occupied-lair'), encounter: { ...encounter(state, 'occupied-lair').encounter, monsterDrawn: true } })
    expect(after.board.items).toEqual([expect.objectContaining({ kind: 'treasure', at: null })])
  })
})

const rat = (state, at) => ({
  ...state,
  monsters: [{ id: 'm1', cardId: 'rat', name: 'Rat', hp: 1, maxHp: 1, ac: 12, conditions: [], ownerId: state.heroes[0].id, card: { hp: 1, figures: 1 } }],
  board: { ...state.board, tokens: { ...state.board.tokens, m1: at } },
})

describe('Concussive Blast', () => {
  it('after the attack, each hero on the tile is moved to an adjacent tile', () => {
    let { state, heroes } = game()
    state = resolve(encounter(state, 'concussive-blast'))
    expect(moveChoices(state).sort()).toEqual(heroes.map((h) => h.id).sort())
    expect(movePrompt(state)).toMatch(/a hero .* on a tile next to its own/)
    const grid = boardGrid(state.board)
    for (const h of heroes) {
      const spot = moveTargets(state, h.id)[0]
      expect(tilesBetween(grid, state.board.tokens[h.id], spot.split(',').map(Number))).toBe(1)
      state = gameReducer(state, { type: 'BOARD_MOVE', id: h.id, to: spot.split(',').map(Number) })
    }
    expect(state.turn.boardMove).toBeNull()
    expect(heroes.every((h) => boardGrid(state.board).get(state.board.tokens[h.id].join(','))?.area !== 'start')).toBe(true)
  })
})

describe('Quick Advance', () => {
  it('a monster off the heroes\' tiles moves 1 tile closer to the active hero', () => {
    let { state, heroes } = game()
    state = resolve(encounter(rat(state, [1, -6]), 'quick-advance'))
    expect(moveChoices(state)).toEqual(['m1'])
    const grid = boardGrid(state.board)
    const targets = moveTargets(state, 'm1')
    expect(targets.length).toBeGreaterThan(0)
    expect(targets.every((k) => tilesBetween(grid, k.split(',').map(Number), state.board.tokens[heroes[0].id]) === 1)).toBe(true)
  })

  it('a monster on a hero\'s tile can\'t be chosen', () => {
    const { state } = game()
    const after = resolve(encounter(rat(state, [2, 0]), 'quick-advance'))
    expect(after.turn.boardMove).toBeFalsy()
  })
})

describe('item attacks only reach monsters in range', () => {
  it('Crossbow of Speed within 1 tile, Ring of Shooting Stars within 2', () => {
    const crossbow = 'Use during your Hero Phase.\nInstead of moving, you can attack a Monster within 1 tile with a rapidly fired bolt.\nAttack: +4\nDamage: 1'
    const ring = 'Use during your Hero Phase.\nAttack 1 Monster within 2 tiles of you. This attack does not count as an attack action.'
    expect(powerRange(crossbow)).toBe('within1')
    expect(powerRange(ring)).toBe('within2')
    const { state, heroes } = game()
    const far = rat(state, [1, -6])
    expect(foesInRange(far, heroes[0].id, powerRange(crossbow), far.monsters)).toEqual([])
    expect(foesInRange(far, heroes[0].id, powerRange(ring), far.monsters)).toHaveLength(1)
  })
})

describe('To Arms! and Potion of Speed', () => {
  it('To Arms! moves another hero on the tile, then the hero', () => {
    let { state, heroes } = game()
    const power = { id: 'ta', name: 'To Arms!', type: 'utility', used: false, card: { name: 'To Arms!' } }
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, powers: [power] } : h)) }
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroes[0].id, powerId: 'ta' })
    expect(moveChoices(state)).toEqual([heroes[1].id])
    state = gameReducer(state, { type: 'BOARD_MOVE', id: heroes[1].id, to: [1, 5] })
    expect(moveChoices(state)).toEqual([heroes[0].id])
    state = gameReducer(state, { type: 'BOARD_MOVE', id: heroes[0].id, to: [0, 6] })
    expect(state.board.tokens[heroes[0].id]).toEqual([0, 6])
    expect(state.turn.boardMove).toBeNull()
  })

  it('Potion of Speed lets the hero walk their speed', () => {
    let { state, heroes } = game()
    const potion = { id: 'potion-of-speed', name: 'Potion of Speed', type: 'item', text: 'Move up to your speed.', use: 'note', after: 'discard' }
    const item = { id: 'i1', cardId: potion.id, name: potion.name, used: false, card: potion }
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, items: [item] } : h)) }
    state = gameReducer(state, { type: 'USE_ITEM', heroId: heroes[0].id, itemId: 'i1' })
    expect(moveChoices(state)).toEqual([heroes[0].id])
    expect(moveTargets(state, heroes[0].id)).toContain('0,7')
  })
})

const area = (state, at) => boardGrid(state.board).get(at.join(','))?.area
const parse = (k) => k.split(',').map(Number)
// A villain on the room north of the Start tile.
const withVillain = (state, name, at = [1, -2]) => {
  const placed = gameReducer(state, { type: 'PLACE_VILLAIN', name, cards: file.villains })
  const villain = placed.villains.at(-1)
  return { state: { ...placed, board: { ...placed.board, tokens: { ...placed.board.tokens, [villain.id]: at } } }, villain }
}
const villainHits = (state, villain, heroId) => gameReducer(state, { type: 'MONSTER_ATTACK', monsterId: villain.id, attackId: villain.card.attacks[0].id, targets: [{ heroId, roll: 10 }] })

describe('villain hits that move the hero', () => {
  it('reads the move from the attack', () => {
    expect(hitMoveStep('Move the Hero 2 tiles away from the Rage Drake.')).toMatchObject({ to: 'awayFrom', n: 2 })
    expect(hitMoveStep('Move the Hero to any square adjacent to Ashardalon.')).toMatchObject({ to: 'nextToFoe' })
    expect(hitMoveStep("Move the Hero 1 tile in the direction of the tile's triangle.")).toMatchObject({ to: 'triangle' })
    expect(hitMoveStep('The Hero discards 1 item of his or her choice.')).toBeNull()
  })

  it('a hero hit by the duergar captain goes 1 tile farther away', () => {
    let { state, heroes } = game()
    let villain
    ;({ state, villain } = withVillain(state, 'captain'))
    state = gameReducer(villainHits(state, villain, heroes[0].id), { type: 'HIT_MOVES', tokenId: villain.id })
    expect(moveChoices(state)).toEqual([heroes[0].id])
    expect(movePrompt(state)).toMatch(/the Captain hit, then a lit square 1 tile farther from the Captain/)
    const grid = boardGrid(state.board)
    const targets = moveTargets(state, heroes[0].id)
    expect(targets.length).toBeGreaterThan(0)
    expect(targets.every((k) => tilesBetween(grid, parse(k), [1, -2]) === 2)).toBe(true)
  })

  it('a hero hit by the Otyugh\'s tentacle goes next to it; a dodged hit stays put', () => {
    let { state, heroes } = game()
    let villain
    ;({ state, villain } = withVillain(state, 'otyugh'))
    const hit = villainHits(state, villain, heroes[0].id)
    const pulled = gameReducer(hit, { type: 'HIT_MOVES', tokenId: villain.id })
    expect(moveTargets(pulled, heroes[0].id).every((k) => Math.max(Math.abs(parse(k)[0] - 1), Math.abs(parse(k)[1] + 2)) === 1)).toBe(true)
    const last = hit.turn.lastMonsterAttack
    const dodged = { ...hit, turn: { ...hit.turn, lastMonsterAttack: { ...last, results: last.results.map((r) => ({ ...r, dodged: true })) } } }
    expect(gameReducer(dodged, { type: 'HIT_MOVES', tokenId: villain.id }).turn.boardMove).toBeFalsy()
  })

  it("the Orc Storm Shaman's windstorm goes the way the tile's triangle points", () => {
    let { state, heroes } = game()
    state = { ...state, board: { ...state.board, tokens: { ...state.board.tokens, [heroes[0].id]: [1, -3] } } }
    let villain
    ;({ state, villain } = withVillain(state, 'otyugh', [2, -2]))
    state = villainHits(state, villain, heroes[0].id)
    // Same hit, but read as the windstorm.
    const move = { heroId: heroes[0].id, source: 'Windstorm', attacked: [], tokens: [heroes[0].id], from: villain.id, fromName: 'Shaman', steps: [{ pick: 'listed', to: 'triangle' }] }
    const windy = { ...state, turn: { ...state.turn, boardMove: move } }
    const targets = moveTargets(windy, heroes[0].id)
    expect(targets.length).toBeGreaterThan(0)
    expect(targets.every((k) => area(windy, parse(k)) === 'start')).toBe(true)
  })
})

describe('Kobold Dragonlord', () => {
  it('after its attack, the players tap a square within 1 tile for it', () => {
    let { state } = game()
    let villain
    ;({ state, villain } = withVillain(state, 'dragon'))
    state = queueFoeStep(state, villain.id, 1)
    expect(moveChoices(state)).toEqual([villain.id])
    expect(movePrompt(state)).toMatch(/Tap the Dragon, then a lit square within 1 tile/)
    const grid = boardGrid(state.board)
    expect(moveTargets(state, villain.id).every((k) => tilesBetween(grid, parse(k), [1, -2]) <= 1)).toBe(true)
  })
})

describe('Blinding Bomb', () => {
  it('a Sentry off the unexplored edges moves 1 tile toward one', () => {
    let { state } = game()
    // Rooms on both sides of the first room, so it has no unexplored edge left.
    const tiles = [...state.board.tiles, { uid: 't3', tileId: 'room', at: [-4, -4], turn: 0 }, { uid: 't4', tileId: 'room', at: [4, -4], turn: 0 }]
    state = { ...state, board: { ...state.board, tiles } }
    state = { ...rat(state, [1, -2]), monsters: rat(state, [1, -2]).monsters.map((m) => ({ ...m, card: { ...m.card, types: ['Sentry'] } })) }
    expect(sentryMoves(state)).toHaveLength(1)
    const after = resolve(encounter(state, 'blinding-bomb'))
    expect(area(after, after.board.tokens.m1)).not.toBe('t1')
  })

  it('a Sentry already on a tile with an unexplored edge, or a monster that isn\'t a Sentry, stays', () => {
    const { state } = game()
    const sentry = rat(state, [1, -2])
    expect(sentryMoves({ ...sentry, monsters: sentry.monsters.map((m) => ({ ...m, card: { ...m.card, types: ['Sentry'] } })) })).toEqual([])
    expect(sentryMoves(sentry)).toEqual([])
  })
})

describe('Scream of the Sentry', () => {
  it('the bottom tile goes next to the unexplored edge closest to the chosen monster', () => {
    let { state } = game()
    state = { ...rat(state, [1, -6]), board: { ...rat(state, [1, -6]).board, pile: ['room'] } }
    const { state: laid } = layTile(state, '', 'encounter-e1~m1')
    const tile = laid.board.tiles.at(-1)
    const grid = boardGrid(laid.board)
    const square = [...grid.values()].find((sq) => sq.tile === tile.uid && sq.floor)
    expect(tilesBetween(grid, [1, -6], [square.x, square.y])).toBe(1)
  })
})

describe('pickers show only who is in reach', () => {
  it('finds the heroes on the tile, next to the hero, or within 2 tiles', () => {
    const { state, heroes } = game()
    expect(heroesInReach(state, heroes[0].id, 'adjacent').sort()).toEqual(heroes.map((h) => h.id).sort())
    const apart = { ...state, board: { ...state.board, tokens: { ...state.board.tokens, [heroes[1].id]: [2, -2] } } }
    expect(heroesInReach(apart, heroes[0].id, 'adjacent')).toEqual([heroes[0].id])
    expect(heroesInReach(apart, heroes[0].id, 'sameTile')).toEqual([heroes[0].id])
    expect(heroesInReach(apart, heroes[0].id, 'within2').sort()).toEqual(heroes.map((h) => h.id).sort())
    expect(heroesInReach({ ...state, board: null }, heroes[0].id, 'adjacent')).toBeNull()
  })
})

describe('Bravery and Wand of Fear', () => {
  it('Bravery on a monster turn puts the hero next to that monster', () => {
    let { state, heroes } = game()
    state = rat(state, [1, -2])
    const bravery = { id: 'br', name: 'Bravery', type: 'utility', used: false, card: { name: 'Bravery' } }
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, powers: [bravery] } : h)) }
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroes[0].id, powerId: 'br', heroIds: [], foeToken: 'm1' })
    expect(moveChoices(state)).toEqual([heroes[0].id])
    expect(moveTargets(state, heroes[0].id).every((k) => Math.max(Math.abs(parse(k)[0] - 1), Math.abs(parse(k)[1] + 2)) === 1)).toBe(true)
  })

  it('Wand of Fear offers each monster within 1 tile, to go within 2 tiles of the hero', () => {
    let { state, heroes } = game()
    state = rat(state, [1, -2])
    const wand = { id: 'wand-of-fear', name: 'Wand of Fear', type: 'item', text: 'Use instead of an attack.', use: 'note', after: 'flip' }
    const item = { id: 'i1', cardId: wand.id, name: wand.name, used: false, card: wand }
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, items: [item] } : h)) }
    state = gameReducer(state, { type: 'USE_ITEM', heroId: heroes[0].id, itemId: 'i1' })
    expect(moveChoices(state)).toEqual(['m1'])
    expect(movePrompt(state)).toMatch(/the tile you chose/)
    const grid = boardGrid(state.board)
    expect(moveTargets(state, 'm1').every((k) => tilesBetween(grid, parse(k), [0, 2]) <= 2)).toBe(true)
  })
})
