import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { normalizeTiles } from '../board/tileDefs.js'
import { boardGrid } from '../board/play.js'
import { placeTile, unexploredEdges } from '../board/grid.js'
import { tilesBetween } from '../board/paths.js'
import { allyStep } from './brain.js'
import { nobleShieldWorth, teamReaction } from './boardPowers.js'

// A made-up Start tile (its two halves count as two tiles), open to the north, and a plain
// open room to lay north of it, so there are tiles 2 and 3 tiles away.
const TILES = normalizeTiles(
  [
    {
      id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'],
      exits: { N: 'ooox', S: 'xxxx', W: 'xxxxxxxx', E: 'xxxxxxxx' },
      features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
    },
    { id: 'room', rows: ['....', '....', '....', '....'], exits: { N: 'oooo', E: 'xxxx', S: 'oooo', W: 'xxxx' } },
  ],
  [],
)
const card = (name, type, attack = '', damage = '', text = '') => ({ id: name, name, type, attack, damage, text })
const jab = card('Jab', 'at-will', '+6', '1', 'Attack one adjacent monster.')

function start(heroes) {
  const list = heroes.map(([key, powers]) => {
    const hero = createHero(HERO_TEMPLATES.find((t) => t.key === key))
    const given = new Set()
    const slots = hero.powers.map((p) => {
      const c = powers.find((x) => x.type === p.type && !given.has(x))
      if (!c) return { ...p, card: { id: `none-${p.id}`, name: `none-${p.id}`, type: p.type, attack: '', damage: '', text: '' } }
      given.add(c)
      return { ...p, card: c, name: c.name }
    })
    return { ...hero, ally: true, powers: slots }
  })
  const state = gameReducer(initialState, { type: 'START_GAME', heroes: list, tileRandom: [], boardTiles: TILES })
  return { ...state, firstRoll: null, opening: null }
}
const monster = (id, hp = 2) => ({ id, name: `Rat ${id}`, maxHp: hp, hp, ac: 10, xp: 1, ownerId: 'x', conditions: [], card: { hp, figures: 1, attacks: [], tactics: [] } })
function withMonsters(state, spots, hp = 2) {
  const monsters = spots.map((_, i) => monster(`m${i + 1}`, hp))
  const tokens = Object.fromEntries(spots.map((at, i) => [`m${i + 1}`, at]))
  return { ...state, monsters, board: { ...state.board, tokens: { ...state.board.tokens, ...tokens } } }
}
const place = (state, id, at) => ({ ...state, board: { ...state.board, tokens: { ...state.board.tokens, [id]: at } } })
const setHero = (state, i, change) => ({ ...state, heroes: state.heroes.map((h, j) => (j === i ? { ...h, ...change } : h)) })
// Lays the room against the northmost unexplored edge.
function explore(state, n = 1) {
  let board = state.board
  for (let i = 0; i < n; i++) {
    const grid = boardGrid(board)
    const edge = unexploredEdges(grid).filter((e) => e.side === 'N').sort((a, b) => a.at[1] - b.at[1])[0]
    board = placeTile(board, grid, edge, TILES.find((t) => t.id === 'room'), `room${i}`)
  }
  return { ...state, board }
}
const roll = () => 15
const run = (state, step) => gameReducer(state, step.action)

describe('powers that move a figure first, then attack', () => {
  it('Divine Challenge pulls a monster from the next tile and hits it', () => {
    const challenge = card('Divine Challenge', 'at-will', '+6', '1', 'Choose one Monster within 1 tile of you. Place that Monster adjacent to your Hero.')
    let state = start([['paladin', [challenge]]])
    const keyleth = state.heroes[0]
    state = withMonsters(place(state, keyleth.id, [0, 7]), [[0, 1]])
    let step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'START_BOARD_MOVE', powerId: keyleth.powers.find((p) => p.name === 'Divine Challenge').id })
    state = run(state, step)
    step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'BOARD_MOVE', id: 'm1' })
    state = run(state, step)
    step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'HERO_ATTACK', targets: [{ monsterId: 'm1' }] })
    state = run(state, step)
    expect(state.monsters[0].hp).toBe(1)
  })

  it('Benign Transposition swaps with a hurt friend next to a monster, then hits it', () => {
    const swap = card('Benign Transposition', 'daily', '+7', '2', 'Choose 1 Hero within 2 tiles of you. You swap positions with that Hero. After swapping positions, attack one adjacent Monster.')
    let state = start([['paladin', [jab, swap]], ['fighter', [jab]]])
    const [keyleth, vistra] = state.heroes
    state = place(place(state, keyleth.id, [0, 7]), vistra.id, [0, 1])
    state = withMonsters(setHero(state, 1, { hp: 2 }), [[1, 0]], 5)
    let step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'START_BOARD_MOVE', powerId: keyleth.powers.find((p) => p.name === 'Benign Transposition').id })
    state = run(state, step)
    step = allyStep(state, { roll })
    expect(step.action).toEqual({ type: 'BOARD_MOVE', id: vistra.id })
    state = run(state, step)
    expect(state.board.tokens[keyleth.id]).toEqual([0, 1])
    expect(state.board.tokens[vistra.id]).toEqual([0, 7])
    step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'HERO_ATTACK', powerId: keyleth.powers.find((p) => p.name === 'Benign Transposition').id })
  })

  it("King's Castle swaps, then shoots a monster within 2 tiles", () => {
    const castle = card("King's Castle", 'daily', '+7', '2', 'Swap positions with one Hero within 1 tile of you. Attack 1 Monster within 2 tiles of you.')
    let state = start([['rogue', [jab, castle]], ['cleric', [jab]]])
    const [tarak, quinn] = state.heroes
    state = explore(state)
    state = place(place(state, tarak.id, [0, 7]), quinn.id, [0, 1])
    // A 2 HP monster in the room north of the Start tile, next to Quinn (down to 2 HP).
    state = withMonsters(setHero(state, 1, { hp: 2 }), [[0, -1]], 2)
    let step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'START_BOARD_MOVE', powerId: tarak.powers.find((p) => p.name === "King's Castle").id })
    state = run(state, step)
    state = run(state, allyStep(state, { roll }))
    expect(state.board.tokens[tarak.id]).toEqual([0, 1])
    step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'HERO_ATTACK', targets: [{ monsterId: 'm1' }] })
  })

  it("leaves a daily swap alone when nobody needs rescuing and it can't finish anything", () => {
    const swap = card('Benign Transposition', 'daily', '+7', '2', 'Choose 1 Hero within 2 tiles of you. You swap positions with that Hero. After swapping positions, attack one adjacent Monster.')
    let state = start([['paladin', [jab, swap]], ['fighter', [jab]]])
    const [keyleth, vistra] = state.heroes
    state = place(place(state, keyleth.id, [0, 7]), vistra.id, [0, 1])
    state = withMonsters(state, [[1, 0]], 5)
    expect(allyStep(state, { roll }).action.type).toBe('MOVE_HERO')
  })

  it('Hypnotism walks one monster next to another and attacks that one', () => {
    const hypnotism = card('Hypnotism', 'at-will', '+5', '1', 'Choose a Monster within 1 tile of you. Move that Monster 1 tile. If it ends adjacent to another Monster, make an attack against the second Monster.')
    let state = start([['wizard', [jab, hypnotism]]])
    const heskan = state.heroes[0]
    state = withMonsters(place(state, heskan.id, [0, 7]), [[2, 5], [1, 0]], 1)
    let step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'START_BOARD_MOVE', powerId: heskan.powers.find((p) => p.name === 'Hypnotism').id })
    state = run(state, step)
    step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'BOARD_MOVE', id: 'm1' })
    state = run(state, step)
    step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'HERO_ATTACK', movedId: 'm1', targets: [{ monsterId: 'm2' }] })
    state = run(state, step)
    expect(state.monsters.map((m) => m.id)).toEqual(['m1'])
  })
})

describe('Command and Distant Diversion', () => {
  it('Command sends a monster on the tile far from a hurt cleric', () => {
    const command = card('Command', 'utility', '', '', 'Choose one Monster on your tile. Place that Monster on a tile within 2 tiles of you.')
    let state = start([['cleric', [jab, command]]])
    const quinn = state.heroes[0]
    state = explore(state)
    state = withMonsters(setHero(place(state, quinn.id, [0, 7]), 0, { hp: 2 }), [[1, 6]], 5)
    let step = allyStep(state, { roll })
    expect(step.action.type).toBe('HERO_ATTACK')
    state = run(state, step)
    step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'USE_POWER', powerId: quinn.powers.find((p) => p.name === 'Command').id })
    state = run(state, step)
    step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'BOARD_MOVE', id: 'm1' })
    state = run(state, step)
    const grid = boardGrid(state.board)
    expect(tilesBetween(grid, state.board.tokens.m1, state.board.tokens[quinn.id])).toBe(2)
  })

  it("keeps Command when nobody's hurt", () => {
    const command = card('Command', 'utility', '', '', 'Choose one Monster on your tile. Place that Monster on a tile within 2 tiles of you.')
    let state = start([['cleric', [jab, command]]])
    state = explore(state)
    state = withMonsters(place(state, state.heroes[0].id, [0, 7]), [[1, 6]], 5)
    state = run(state, allyStep(state, { roll }))
    expect(allyStep(state, { roll })).toBeNull()
  })

  it('Distant Diversion moves a monster away from a hurt friend', () => {
    const diversion = card('Distant Diversion', 'utility', '', '', 'Choose one Monster within 3 tiles of you. Place it on a tile adjacent to its tile.')
    let state = start([['rogue', [jab, diversion]], ['fighter', [jab]]])
    const [tarak, vistra] = state.heroes
    state = explore(state, 2)
    // Vistra (2 HP) in the room next to a monster; Tarak on the Start tile, out of its reach.
    state = place(place(state, tarak.id, [0, 7]), vistra.id, [0, -3])
    state = withMonsters(setHero(state, 1, { hp: 2 }), [[1, -3]], 5)
    state = { ...state, turn: { ...state.turn, boardMoves: 2 } }
    const step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'USE_POWER', powerId: tarak.powers.find((p) => p.name === 'Distant Diversion').id })
    let next = run(state, step)
    next = run(next, allyStep(next, { roll }))
    const grid = boardGrid(next.board)
    // Off Vistra's tile, onto the next room up (away from Tarak too).
    expect(tilesBetween(grid, next.board.tokens.m1, next.board.tokens[vistra.id])).toBe(1)
    expect(next.board.tokens.m1[1]).toBeLessThan(-4)
  })
})

describe('Wizard Eye', () => {
  it('puts the eye on a tile with an unexplored edge the wizard cannot walk to', () => {
    const eye = card('Wizard Eye', 'utility', '', '', 'Place the Wizard Eye token on a tile within 1 tile of you.')
    let state = start([['wizard', [jab, eye]]])
    const heskan = state.heroes[0]
    state = explore(state)
    // One move left, and the room's far edge is farther than that.
    state = { ...place(state, heskan.id, [0, 3]), turn: { ...state.turn, boardMoves: 1 } }
    let step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'USE_POWER', powerId: heskan.powers.find((p) => p.name === 'Wizard Eye').id })
    state = run(state, step)
    step = allyStep(state, { roll })
    expect(step.action.type).toBe('PLACE_ITEM')
    state = run(state, step)
    const at = state.board.items.find((i) => i.kind === 'eye').at
    expect(at[1]).toBeLessThan(0)
  })
})

describe('on a monster turn', () => {
  it('Bravery: a hurt computer paladin steps up to the monster and heals', () => {
    const bravery = card('Bravery', 'utility', '', '', 'Use when a Monster within 1 tile of you activates.')
    let state = start([['fighter', [jab]], ['paladin', [jab, bravery]]])
    const keyleth = state.heroes[1]
    state = place(place(state, state.heroes[0].id, [0, 1]), keyleth.id, [0, 7])
    state = withMonsters(setHero(state, 1, { hp: 5 }), [[1, 2]], 2)
    state = { ...state, turn: { ...state.turn, phase: 2, acting: 'm1' } }
    const step = teamReaction(state)
    expect(step.action).toMatchObject({ type: 'USE_POWER', heroId: keyleth.id, foeToken: 'm1' })
    let next = run(state, step)
    expect(next.heroes[1].hp).toBe(6)
    next = run(next, teamReaction(next))
    expect(tilesBetween(boardGrid(next.board), next.board.tokens[keyleth.id], [1, 2])).toBe(0)
  })

  it('Noble Shield: takes a hit that would knock a friend down', () => {
    let state = start([['paladin', [jab]], ['wizard', [jab]]])
    state = setHero(state, 1, { hp: 1 })
    const [keyleth, heskan] = state.heroes
    const attack = { damage: 2, conditions: [] }
    expect(nobleShieldWorth(state, keyleth, [keyleth.id, heskan.id], attack, 6)).toBe(true)
    // Not when Keyleth would go down herself.
    expect(nobleShieldWorth(setHero(state, 0, { hp: 2 }), { ...keyleth, hp: 2 }, [keyleth.id, heskan.id], attack, 6)).toBe(false)
    // Not for a player's own hero.
    expect(nobleShieldWorth(state, { ...keyleth, ally: false }, [keyleth.id, heskan.id], attack, 6)).toBe(false)
  })
})

describe('To Arms! and One for the Team', () => {
  it('To Arms!: the fighter rushes next to a new monster', () => {
    const toArms = card('To Arms!', 'utility', '', '', 'Use when a new Monster is placed on a tile.')
    let state = start([['wizard', [jab]], ['fighter', [jab, toArms]]])
    const vistra = state.heroes[1]
    state = explore(state)
    const uid = state.board.tiles.at(-1).uid
    state = place(place(state, state.heroes[0].id, [2, 6]), vistra.id, [0, 3])
    state = withMonsters(state, [[1, -2]], 2)
    state = { ...state, turn: { ...state.turn, phase: 1, monsterDrawn: true, boardTiles: [{ uid }] } }
    const step = teamReaction(state)
    expect(step.action).toMatchObject({ type: 'USE_POWER', heroId: vistra.id })
    let next = run(state, step)
    for (let i = 0; i < 3 && next.turn.boardMove; i++) next = run(next, teamReaction(next))
    expect(next.turn.boardMove).toBeFalsy()
    const at = next.board.tokens[vistra.id]
    expect(Math.max(Math.abs(at[0] - 1), Math.abs(at[1] + 2))).toBe(1)
  })

  it('One for the Team: the fighter takes a curse a hurt friend drew', () => {
    const team = card('One for the Team', 'utility', '', '', 'Use when any player draws an Encounter Card.')
    let state = start([['wizard', [jab]], ['fighter', [jab, team]]])
    state = setHero(state, 0, { hp: 2 })
    const [heskan, vistra] = state.heroes
    const curse = { id: 'gap', name: 'A Gap in the Armor', type: 'curse', text: 'Made up.' }
    state = { ...state, encounter: { id: 'e1', cardId: 'gap', heroId: heskan.id, card: curse, attacked: false } }
    const step = teamReaction(state)
    expect(step.action).toMatchObject({ type: 'USE_POWER', heroId: vistra.id })
    const next = run(state, step)
    expect(next.encounter.heroId).toBe(vistra.id)
    // Once taken, the card is hers: nothing more to take.
    expect(teamReaction(next)).toBeNull()
  })

  it('One for the Team does nothing without another hero’s card to take', () => {
    const team = card('One for the Team', 'utility', '', '', 'Use when any player draws an Encounter Card.')
    const state = start([['fighter', [jab, team]]])
    const vistra = state.heroes[0]
    expect(gameReducer(state, { type: 'USE_POWER', heroId: vistra.id, powerId: vistra.powers.find((p) => p.name === 'One for the Team').id, heroIds: [] })).toBe(state)
  })
})
