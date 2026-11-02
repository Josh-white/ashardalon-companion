import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { normalizeTiles } from '../board/tileDefs.js'
import { allyStep } from './brain.js'
import { doorGoals } from './doors.js'
import { newAdventure } from '../state/adventure.js'
import { normalizeCardFile } from '../data/cards.js'
import EXAMPLE from '../../cards/cards.example.json'

const ADVENTURE = normalizeCardFile(EXAMPLE).adventures[0]

// A made-up Start tile, 3 floor columns wide and open to the north, with a Closed Door
// across its top row: the only way on is through the door.
const TILES = normalizeTiles(
  [{ id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#'], exits: { N: 'ooox', S: 'xxxx', W: 'xxxx', E: 'xxxx' } }],
  [],
)
const DOOR = { id: 'door-1', squares: [[0, 0], [1, 0], [2, 0]], kind: null }
const roll = () => 15

function start({ door = DOOR, at = [1, 3], locked = false } = {}) {
  const fighter = HERO_TEMPLATES.find((t) => t.key === 'fighter')
  const hero = { ...createHero(fighter), ally: true }
  let state = gameReducer(initialState, { type: 'START_GAME', heroes: [hero], tileRandom: [], boardTiles: TILES })
  const id = state.heroes[0].id
  state = { ...state, firstRoll: null, opening: null, board: { ...state.board, doors: [locked ? { ...door, kind: 'locked' } : door], tokens: { [id]: at } } }
  if (locked) state = { ...state, adventure: { ...newAdventure(ADVENTURE), lockedDoors: [{ id: door.id }] } }
  return state
}

describe('a computer hero and Closed Doors', () => {
  it('walks up to a door that stands in the way, then opens it', () => {
    let state = start()
    expect(doorGoals(state, state.heroes[0])[0].squares.length).toBeGreaterThan(0)
    const walk = allyStep(state, { roll })
    expect(walk.action).toMatchObject({ type: 'MOVE_HERO' })
    expect(walk.action.to[1]).toBe(1)
    state = gameReducer(state, walk.action)
    const open = allyStep(state, { roll, cards: {} })
    expect(open.action).toMatchObject({ type: 'DOOR_REVEALED', doorId: 'door-1', heroId: state.heroes[0].id })
    expect(open.action.pick).toBeGreaterThanOrEqual(0)
  })

  it('rolls to unlock a Locked Door next to it instead of attacking', () => {
    const state = start({ at: [1, 1], locked: true })
    const low = () => 5
    const step = allyStep(state, { roll: low })
    expect(step.action).toEqual(expect.objectContaining({ type: 'DOOR_UNLOCK', doorId: 'door-1', roll: 5 }))
    // Still locked and the attack spent: it waits by the door for next turn.
    const spent = gameReducer(state, step.action)
    expect(spent.board.doors).toHaveLength(1)
    expect(allyStep(spent, { roll: low })).toBeNull()
    // A 15 unlocks it, and the way north is open.
    const opened = gameReducer(state, allyStep(state, { roll }).action)
    expect(opened.board.doors).toHaveLength(0)
  })
})
