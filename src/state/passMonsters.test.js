import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeTiles } from '../board/tileDefs.js'
import { createHero, gameReducer, initialState } from './game.js'
import { heroOnRight, highAlertPass, thunderPass, warpPasses } from './passMonsters.js'
import { simpleAttack } from '../ally/brain.js'

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

const monster = (id, name, ownerId) => ({ id, name, hp: 2, maxHp: 2, ac: 12, xp: 1, ownerId, conditions: [], card: { hp: 2, figures: 1, attacks: [], tactics: [] } })
const thunder = { id: 'wt', name: 'Wrathful Thunder', type: 'daily', used: false, card: { name: 'Wrathful Thunder', attack: '+6', damage: '3 (Miss: 1)' } }

// Quinn, Vistra, Keyleth on the Start tile (turn order), a room north of it.
// m1 (Vistra's) and m2 (Keyleth's) stand on the Start tile, m3 (Quinn's) in the room.
function game({ board = true } = {}) {
  const heroes = HERO_TEMPLATES.slice(0, 3).map((t) => createHero(t))
  let state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], ...(board ? { boardTiles: TILES } : {}) })
  const [q, v, k] = state.heroes.map((h) => h.id)
  const monsters = [monster('m1', 'Rat', v), monster('m2', 'Snake', k), monster('m3', 'Bat', q), monster('m4', 'Toad', v)]
  state = { ...state, firstRoll: null, monsters, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, powers: [thunder] } : h)) }
  if (board) {
    const tiles = [...state.board.tiles, { uid: 't1', tileId: 'room', at: [0, -4], turn: 0 }]
    state = { ...state, board: { ...state.board, tiles, tokens: { ...state.board.tokens, m1: [2, 2], m2: [2, 5], m3: [1, -2], m4: [1, -3] } } }
  }
  return state
}
const owners = (state) => Object.fromEntries(state.monsters.map((m) => [m.id, state.heroes.find((h) => h.id === m.ownerId)?.name]))

describe('passing monster cards to the player on the right', () => {
  it('the player on the right is the hero who went before, skipping heroes who escaped', () => {
    const state = game()
    const [q, v, k] = state.heroes
    expect(heroOnRight(state, q.id).id).toBe(k.id)
    expect(heroOnRight(state, v.id).id).toBe(q.id)
    const escaped = { ...state, heroes: state.heroes.map((h) => (h.id === q.id ? { ...h, escaped: true } : h)) }
    expect(heroOnRight(escaped, v.id).id).toBe(k.id)
  })

  it('Warp in Time: on the virtual board every hero passes their oldest card at once', () => {
    let state = game()
    const [q, v, k] = state.heroes
    expect(warpPasses(state).map((p) => p.monster.id)).toEqual(['m3', 'm1', 'm2'])
    const card = { id: 'warp-in-time', name: 'Warp in Time', type: 'event', passMonsters: true, drawAnother: true }
    state = gameReducer({ ...state, encounter: { id: 'e1', heroId: q.id, card } }, { type: 'RESOLVE_ENCOUNTER' })
    expect(owners(state)).toEqual({ m1: q.name, m2: v.name, m3: k.name, m4: v.name })
    expect(state.log[0].text ?? state.log[0]).toMatch(/Warp in Time: .*Rat goes to/)
  })

  it('Warp in Time at a real table leaves the cards to the players', () => {
    let state = game({ board: false })
    const card = { id: 'warp-in-time', name: 'Warp in Time', type: 'event', passMonsters: true }
    const before = owners(state)
    state = gameReducer({ ...state, encounter: { id: 'e1', heroId: state.heroes[0].id, card } }, { type: 'RESOLVE_ENCOUNTER' })
    expect(owners(state)).toEqual(before)
  })

  it('High Alert: the active hero passes one card when the Villain Phase ends', () => {
    let state = game()
    const [q, , k] = state.heroes
    state = { ...state, environment: { cardId: 'high-alert', name: 'High Alert', card: {} }, turn: { ...state.turn, heroIndex: 0, phase: 2 } }
    expect(highAlertPass(state).monster.id).toBe('m3')
    state = gameReducer(state, { type: 'NEXT_PHASE' })
    expect(state.monsters.find((m) => m.id === 'm3').ownerId).toBe(k.id)
    expect(state.turn.heroIndex).toBe(1)
    expect(state.monsters.find((m) => m.id === 'm1').ownerId).not.toBe(q.id)
  })

  it('High Alert prefers a card the player on the right does not already have', () => {
    const state = game()
    const v = state.heroes[1]
    const withRat = { ...state, monsters: [...state.monsters, monster('m5', 'Rat', state.heroes[0].id)], turn: { ...state.turn, heroIndex: 1 } }
    expect(highAlertPass(withRat).monster.id).toBe('m4')
    expect(highAlertPass({ ...state, turn: { ...state.turn, heroIndex: 1 } }).from.id).toBe(v.id)
  })

  it('Wrathful Thunder: the board passes the monster on Quinn\'s tile that would act soonest, no question', () => {
    let state = game()
    const [q, v, k] = state.heroes
    // m1 (Vistra, next after Quinn) beats m2 (Keyleth, already Quinn's right).
    expect(thunderPass(state, q.id).monster.id).toBe('m1')
    state = gameReducer(state, { type: 'HERO_ATTACK', heroId: q.id, powerId: 'wt', targets: [{ monsterId: 'm2', roll: 1 }] })
    expect(state.monsters.find((m) => m.id === 'm1').ownerId).toBe(k.id)
    expect(state.turn.lastAttack.followUpDone).toBe(true)
    expect(v).toBeTruthy()
  })

  it('Wrathful Thunder with nobody on the tile passes nothing', () => {
    let state = game()
    const q = state.heroes[0]
    state = { ...state, board: { ...state.board, tokens: { ...state.board.tokens, m1: [1, -1], m2: [2, -1] } } }
    expect(thunderPass(state, q.id)).toBeNull()
    const before = owners(state)
    state = gameReducer(state, { type: 'HERO_ATTACK', heroId: q.id, powerId: 'wt', targets: [{ monsterId: 'm1', roll: 1 }] })
    expect(owners(state)).toEqual(before)
    expect(state.turn.lastAttack.followUpDone).toBe(true)
  })

  it('computer allies can use Wrathful Thunder now that the board passes the monster', () => {
    expect(simpleAttack(thunder)).toBe(true)
  })
})
