import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { key } from './grid.js'
import { heroEdges } from './play.js'
import { sphereVictims, tokenMoveTargets, tokenTargets } from './heroTokens.js'
import { normalizeTiles } from './tileDefs.js'

// A made-up start tile with a room north of it and one more room north of that.
const room = (id) => ({ id, name: 'Room', kind: 'regular', triangle: 'black', rows: ['....', '.S..', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooo', E: 'oooo' } })
const TILES = normalizeTiles(
  [
    {
      id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'],
      exits: { N: 'ooox', S: 'ooox', W: 'oooooooo', E: 'xxxxxxxx' },
      features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
    },
    room('room'),
    room('room-2'),
  ],
  [],
)
const ogre = { id: 'ogre', name: 'Ogre', copies: 1, ac: 10, hp: 3, xp: 2, attacks: [{ id: 'club', name: 'Club', bonus: 5, damage: 2 }], tactics: [] }
const imp = { ...ogre, id: 'imp', name: 'Imp', hp: 1, xp: 1 }

// Quinn (cleric) and Heskan (wizard) on the Start tile, rooms laid north.
function game() {
  const heroes = HERO_TEMPLATES.filter((t) => ['cleric', 'wizard'].includes(t.key)).map((t) => createHero(t))
  let state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  const tiles = [...state.board.tiles, { uid: 't1', tileId: 'room', at: [0, -4], turn: 0 }, { uid: 't2', tileId: 'room-2', at: [0, -8], turn: 0 }]
  const [quinn, heskan] = state.heroes
  state = { ...state, firstRoll: null, board: { ...state.board, tiles, tokens: { [quinn.id]: [0, 1], [heskan.id]: [1, 1] } } }
  for (const card of [ogre, imp]) state = gameReducer(state, { type: 'DRAW_MONSTER', heroId: quinn.id, cards: [ogre, imp], random: [], card })
  return state
}

const give = (state, heroIndex, name, type) => {
  const hero = state.heroes[heroIndex]
  const slot = hero.powers.find((p) => p.type === type)
  return gameReducer(state, { type: 'SET_POWER_CARD', heroId: hero.id, powerId: slot.id, card: { id: name, name } })
}
const use = (state, heroIndex, type) => {
  const hero = state.heroes[heroIndex]
  return gameReducer(state, { type: 'USE_POWER', heroId: hero.id, powerId: hero.powers.find((p) => p.type === type).id })
}
const mine = (state, kind) => state.board.items.filter((i) => i.kind === kind)
const put = (state, id, at) => gameReducer(state, { type: 'PLACE_ITEM', id, to: at })
const moveFoe = (state, id, at) => gameReducer(state, { type: 'MOVE_TOKEN', id, to: at })

describe('tokens heroes put on the virtual board', () => {
  it('Blade Barrier: five tokens in hand, one tile within 2 tiles, and a monster put on one takes 1 damage', () => {
    let state = use(give(game(), 0, 'Blade Barrier', 'daily'), 0, 'daily')
    const blades = mine(state, 'blade')
    expect(blades).toHaveLength(5)
    expect(blades.every((b) => b.at === null)).toBe(true)
    // Within 2 tiles of Quinn on the Start tile: the Start tile's two halves and the first room.
    expect(tokenTargets(state, blades[0])).toContain(key([0, -3]))
    state = put(state, blades[0].id, [0, -3])
    // The rest follow it onto the same tile.
    const targets = tokenTargets(state, mine(state, 'blade').find((b) => !b.at))
    expect(targets.every((k) => Number(k.split(',')[1]) < 0 && Number(k.split(',')[1]) >= -4)).toBe(true)
    const ogreId = state.monsters.find((m) => m.name === 'Ogre').id
    state = moveFoe(state, ogreId, [0, -3])
    expect(state.monsters.find((m) => m.id === ogreId).hp).toBe(2)
    expect(state.heroes[0].tokens.bladeBarrier).toBe(4)
    expect(mine(state, 'blade')).toHaveLength(4)
    expect(mine(state, 'blade').some((b) => b.at && key(b.at) === key([0, -3]))).toBe(false)
  })

  it('Caltrops: three squares of your own tile', () => {
    let state = game()
    const quinn = state.heroes[0]
    state = { ...state, heroes: state.heroes.map((h) => (h.id === quinn.id ? { ...h, tokens: { ...h.tokens, caltrops: 3 } } : h)) }
    state = gameReducer(state, { type: 'ADJUST_XP', amount: 0 })
    const caltrops = mine(state, 'caltrop')
    expect(caltrops).toHaveLength(3)
    const targets = tokenTargets(state, caltrops[0])
    expect(targets).toContain(key([2, 0]))
    expect(targets).not.toContain(key([0, -3]))
    state = put(state, caltrops[0].id, [2, 0])
    const impId = state.monsters.find((m) => m.name === 'Imp').id
    state = moveFoe(state, impId, [2, 0])
    expect(state.monsters.some((m) => m.id === impId)).toBe(false)
    expect(state.heroes[0].tokens.caltrops).toBe(2)
  })

  it('Flaming Sphere: burns the monsters on its tile, moves 1 tile instead of moving, and goes when spent', () => {
    let state = use(give(game(), 1, 'Flaming Sphere', 'daily'), 1, 'daily')
    const [sphere] = mine(state, 'sphere')
    expect(mine(state, 'sphere')).toHaveLength(1)
    state = put(state, sphere.id, [1, -2])
    const heskan = state.heroes[1]
    const ogreId = state.monsters.find((m) => m.name === 'Ogre').id
    state = moveFoe(state, ogreId, [2, -2])
    state = moveFoe(state, state.monsters.find((m) => m.name === 'Imp').id, [2, 2])
    expect(sphereVictims(state, heskan)).toEqual([ogreId])
    // Heskan's turn: move the sphere a tile north instead of moving.
    state = { ...state, turn: { ...state.turn, heroIndex: 1, phase: 0 } }
    expect(tokenMoveTargets(state, mine(state, 'sphere')[0])).toContain(key([1, -6]))
    state = gameReducer(state, { type: 'MOVE_HERO_ITEM', id: sphere.id, to: [1, -6] })
    expect(mine(state, 'sphere')[0].at).toEqual([1, -6])
    expect(state.turn.boardMoves).toBe(1)
    // It can't go two tiles.
    expect(gameReducer(state, { type: 'MOVE_HERO_ITEM', id: sphere.id, to: [1, 2] })).toBe(state)
    // Spent: three burns later it leaves the board.
    state = { ...state, heroes: state.heroes.map((h) => (h.id === heskan.id ? { ...h, tokens: { ...h.tokens, flamingSphere: 0 } } : h)) }
    state = gameReducer(state, { type: 'ADJUST_XP', amount: 0 })
    expect(mine(state, 'sphere')).toHaveLength(0)
  })

  it('Wizard Eye: explore from the edges on its tile', () => {
    let state = use(give(game(), 1, 'Wizard Eye', 'utility'), 1, 'utility')
    const [eye] = mine(state, 'eye')
    expect(eye).toBeTruthy()
    state = put(state, eye.id, [1, -3])
    state = { ...state, turn: { ...state.turn, heroIndex: 1, phase: 0 } }
    const edges = heroEdges(state)
    expect(edges.some((e) => e.eye)).toBe(true)
    expect(edges.filter((e) => e.eye).every((e) => e.area === 't1')).toBe(true)
  })
})

describe('monsters the board moves stop on Blade Barrier and Caltrop tokens', () => {
  it('a monster headed for a hero stops on the first token on its way and takes 1 damage', async () => {
    const { squareNextTo, squareToward } = await import('./monsters.js')
    let state = use(give(game(), 0, 'Blade Barrier', 'daily'), 0, 'daily')
    const ogreId = state.monsters.find((m) => m.name === 'Ogre').id
    const impId = state.monsters.find((m) => m.name === 'Imp').id
    state = moveFoe(moveFoe(state, impId, [3, -8]), ogreId, [1, -7])
    // A token in the room between the ogre and Quinn (on the Start tile at 0,1).
    state = put(state, mine(state, 'blade')[0].id, [1, -3])
    const quinnAt = state.board.tokens[state.heroes[0].id]
    expect(squareNextTo(state, ogreId, quinnAt)).toEqual([1, -3])
    expect(squareToward(state, ogreId, quinnAt, 1)).toEqual([1, -3])
    state = moveFoe(state, ogreId, [1, -3])
    expect(state.monsters.find((m) => m.id === ogreId).hp).toBe(2)
  })

  it('a token off the way is left alone', async () => {
    const { squareNextTo } = await import('./monsters.js')
    let state = use(give(game(), 0, 'Blade Barrier', 'daily'), 0, 'daily')
    const ogreId = state.monsters.find((m) => m.name === 'Ogre').id
    const impId = state.monsters.find((m) => m.name === 'Imp').id
    state = moveFoe(moveFoe(state, impId, [3, -8]), ogreId, [0, -3])
    state = put(state, mine(state, 'blade')[0].id, [3, -4])
    const to = squareNextTo(state, ogreId, state.board.tokens[state.heroes[0].id])
    expect(to).not.toEqual([3, -4])
  })
})
