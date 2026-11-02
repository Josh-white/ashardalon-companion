import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import EXAMPLE from '../../cards/cards.example.json'
import { createHero, gameReducer, initialState } from './game.js'
import { newAdventure } from './adventure.js'

const BARD = { ...HERO_TEMPLATES[0], key: 'bard', name: 'Berryloaf', abilityEffects: ['bardic-song'] }
const ADVENTURE = normalizeCardFile(EXAMPLE).adventures[0]

// Quinn (active) and a bard, in an adventure with a Locked Door Quinn stands next to.
function start({ bard = true } = {}) {
  const heroes = [createHero(HERO_TEMPLATES[0]), ...(bard ? [createHero(BARD)] : [createHero(HERO_TEMPLATES[1])])]
  const state = gameReducer(initialState, { type: 'START_GAME', heroes })
  return { ...state, firstRoll: null, opening: null, adventure: { ...newAdventure(ADVENTURE), lockedDoors: [{ id: 'door-1' }] } }
}
const unlock = (state, roll) => gameReducer(state, { type: 'DOOR_UNLOCK', doorId: 'door-1', heroId: state.heroes[0].id, roll })

describe('Bardic Song on a failed roll', () => {
  it('makes the failed roll again from just before it, and spends a song', () => {
    const failed = unlock(start(), 4)
    expect(failed.adventure.lockedDoors).toHaveLength(1)
    expect(failed.songRoll.heroId).toBe(failed.heroes[0].id)
    const bard = failed.heroes[1]
    const sung = gameReducer(failed, { type: 'BARDIC_SONG', bardId: bard.id, roll: 16 })
    expect(sung.adventure.lockedDoors).toHaveLength(0)
    expect(sung.heroes[1].tokens.bardicSongsUsed).toBe(1)
    expect(sung.songRoll ?? null).toBeNull()
    expect(sung.log.map((l) => l.text).join(' | ')).toMatch(/Bardic Song: Quinn rolls again to unlock the door/)
    // Only one roll for the door this turn: the second try didn't cost a second attack.
    expect(sung.log.filter((l) => /rolled 4 to unlock/.test(l.text))).toHaveLength(0)
  })

  it('can sing again when the new roll fails too, until the songs run out', () => {
    let state = unlock(start(), 4)
    const bardId = state.heroes[1].id
    for (let i = 0; i < 3; i++) state = gameReducer(state, { type: 'BARDIC_SONG', bardId, roll: 2 })
    expect(state.heroes[1].tokens.bardicSongsUsed).toBe(3)
    expect(state.songRoll ?? null).toBeNull()
    expect(gameReducer(state, { type: 'BARDIC_SONG', bardId, roll: 20 })).toBe(state)
  })

  it('ends the chance when anything else happens, and never comes up without a bard', () => {
    const failed = unlock(start(), 4)
    const moved = gameReducer(failed, { type: 'ADJUST_XP', amount: 1 })
    expect(moved.songRoll).toBeNull()
    expect(gameReducer(moved, { type: 'BARDIC_SONG', bardId: moved.heroes[1].id, roll: 16 })).toBe(moved)
    // A screen reading a card out loud doesn't count.
    expect(gameReducer(failed, { type: 'ALLY_HELP', reason: 'x' }).songRoll).toBeTruthy()
    expect(unlock(start({ bard: false }), 4).songRoll).toBeUndefined()
    // A roll that worked needs no song.
    expect(unlock(start(), 15).songRoll).toBeUndefined()
  })

  it('covers Mind Over Body', () => {
    const monk = { ...HERO_TEMPLATES[1], key: 'monk', name: 'Darna', abilityEffects: ['mind-over-body'] }
    let state = gameReducer(initialState, { type: 'START_GAME', heroes: [createHero(monk), createHero(BARD)] })
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, conditions: ['Dazed'] } : h)) }
    const failed = gameReducer(state, { type: 'MIND_OVER_BODY', heroId: state.heroes[0].id, condition: 'Dazed', roll: 3 })
    expect(failed.heroes[0].conditions).toContain('Dazed')
    const sung = gameReducer(failed, { type: 'BARDIC_SONG', bardId: failed.heroes[1].id, roll: 14 })
    expect(sung.heroes[0].conditions).not.toContain('Dazed')
  })
})
