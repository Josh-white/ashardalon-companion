import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { allyStep } from './brain.js'
import { normalizeTiles } from '../board/tileDefs.js'

// A made-up Start tile, so the heroes stand on a virtual board.
const TILES = normalizeTiles(
  [{ id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'], exits: { N: 'ooox', S: 'xxxx', W: 'xxxxxxxx', E: 'xxxxxxxx' } }],
  [],
)
import { cancelAdvice, cancelEncounter, encounterHarm, levelUpReserve, spareXp } from './cancelEncounter.js'

const card = (extra) => ({ id: 'x', name: 'Card', type: 'event', text: '', ...extra })
const CAGE = card({ id: 'cage', name: 'Cage', type: 'curse', curse: { acPenalty: 2 } })
const BULLS_EYE = card({ id: 'bulls-eye', name: "Bull's Eye!", attack: { bonus: 10, damage: 1, conditions: [], targets: 'active' } })
const EARTHQUAKE = card({ id: 'earthquake', name: 'Earthquake!', attack: { bonus: 6, damage: 2, conditions: ['Dazed'], targets: 'all', miss: 1 } })
const TREASURE = card({ id: 'hidden-treasure', name: 'Hidden Treasure', drawAnother: true })
const BLESSING = card({ id: 'ancient-spirit-s-blessing', name: "Ancient Spirit's Blessing", refreshDaily: true, drawAnother: true })

// Two heroes (both level 1 unless told), the first played by the computer, with an encounter drawn.
function game({ xp = 0, levels = [1, 1], encounter = CAGE, surges = 2, hp } = {}) {
  const heroes = ['fighter', 'wizard'].map((k, i) => ({ ...createHero(HERO_TEMPLATES.find((t) => t.key === k)), ally: i === 0 }))
  const state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  return {
    ...state,
    firstRoll: null,
    opening: null,
    xp,
    surges,
    heroes: state.heroes.map((h, i) => ({ ...h, level: levels[i], ...(hp != null ? { hp } : {}) })),
    encounter: encounter && { id: 'e1', cardId: encounter.id, heroId: state.heroes[0].id, card: encounter, attacked: false },
  }
}
const hero = (state) => state.heroes[0]

describe('computer allies cancelling encounters', () => {
  it('keeps 5 XP back for each hero still at level 1', () => {
    expect(levelUpReserve(game())).toBe(10)
    expect(levelUpReserve(game({ levels: [2, 1] }))).toBe(5)
    expect(levelUpReserve(game({ levels: [2, 2] }))).toBe(0)
    expect(spareXp(game({ xp: 12 }))).toBe(2)
  })

  it("doesn't touch the level-up XP", () => {
    const state = game({ xp: 12 })
    expect(cancelEncounter(state, hero(state))).toBeNull()
  })

  it('cancels a curse with XP beyond the level-up reserve', () => {
    const state = game({ xp: 15 })
    const step = cancelEncounter(state, hero(state))
    expect(step.action).toEqual({ type: 'CANCEL_ENCOUNTER' })
    expect(step.say).toMatch(/spends 5 XP to cancel Cage/)
    expect(gameReducer(state, step.action).xp).toBe(10)
  })

  it('cancels with any XP once every hero is level 2', () => {
    const state = game({ xp: 5, levels: [2, 2] })
    expect(cancelEncounter(state, hero(state))).not.toBeNull()
  })

  it('lets a small sting through unless there is plenty to spare', () => {
    const some = game({ xp: 5, levels: [2, 2], encounter: BULLS_EYE })
    expect(cancelEncounter(some, hero(some))).toBeNull()
    const lots = game({ xp: 10, levels: [2, 2], encounter: EARTHQUAKE })
    expect(cancelEncounter(lots, hero(lots))).not.toBeNull()
  })

  it('never pays to cancel a card that helps', () => {
    for (const encounter of [TREASURE, BLESSING]) {
      const state = game({ xp: 30, levels: [2, 2], encounter })
      expect(encounterHarm(state, encounter, hero(state)).score).toBe(0)
      expect(cancelEncounter(state, hero(state))).toBeNull()
    }
  })

  it('spends the level-up XP only to stop a knockout with no surges left', () => {
    const risky = game({ xp: 5, encounter: EARTHQUAKE, surges: 0, hp: 2 })
    expect(cancelEncounter(risky, hero(risky))).not.toBeNull()
    const surges = game({ xp: 5, encounter: EARTHQUAKE, surges: 1, hp: 2 })
    expect(cancelEncounter(surges, hero(surges))).toBeNull()
  })

  it("leaves cards that can't be cancelled, or already attacked, alone", () => {
    const fixed = game({ xp: 20, levels: [2, 2], encounter: { ...CAGE, noCancel: true } })
    expect(cancelEncounter(fixed, hero(fixed))).toBeNull()
    const rolled = game({ xp: 20, levels: [2, 2], encounter: EARTHQUAKE })
    const after = { ...rolled, encounter: { ...rolled.encounter, attacked: true } }
    expect(cancelEncounter(after, hero(after))).toBeNull()
  })

  it('is what the ally does on its turn (not on a human hero’s turn)', () => {
    const state = game({ xp: 15 })
    expect(state.board).toBeTruthy()
    const withBoard = state
    expect(allyStep(withBoard)?.action).toEqual({ type: 'CANCEL_ENCOUNTER' })
    const human = { ...withBoard, heroes: withBoard.heroes.map((h) => ({ ...h, ally: false })) }
    expect(allyStep(human)).toBeNull()
  })

  describe('advice for the players', () => {
    it('says to save the XP, naming the heroes still at level 1', () => {
      const state = game({ xp: 12 })
      const advice = cancelAdvice(state, hero(state))
      expect(advice).toMatchObject({ cancel: false, tone: 'save' })
      expect(advice.text).toContain(`${state.heroes[0].name} and ${state.heroes[1].name} still need 5 XP each`)
    })

    it('says go ahead with XP to spare on a nasty card', () => {
      const state = game({ xp: 15 })
      expect(cancelAdvice(state, hero(state))).toMatchObject({ cancel: true, tone: 'good' })
      const all2 = game({ xp: 5, levels: [2, 2] })
      expect(cancelAdvice(all2, hero(all2)).text).toMatch(/every hero is level 2/)
    })

    it('says keep the XP on a mild or helpful card', () => {
      const mild = game({ xp: 5, levels: [2, 2], encounter: BULLS_EYE })
      expect(cancelAdvice(mild, hero(mild))).toMatchObject({ cancel: false, tone: 'save' })
      const good = game({ xp: 30, encounter: TREASURE })
      expect(cancelAdvice(good, hero(good))).toMatchObject({ cancel: false, tone: 'helps' })
    })

    it("says nothing when the party can't afford it", () => {
      const state = game({ xp: 3 })
      expect(cancelAdvice(state, hero(state))).toBeNull()
    })
  })
})
