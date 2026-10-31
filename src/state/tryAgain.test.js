import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { createHero, gameReducer, initialState } from './game.js'
import { withPicks } from './heroSetup.js'
import { defeatHighlights } from './stats.js'
import { describeAction } from './describeAction.js'

const card = (id, name, type) => ({ id, name, type, text: '', attack: '', hit: '', miss: '', damage: '' })
const POWERS = [card('a1', 'Strike', 'at-will'), card('a2', 'Slash', 'at-will'), card('u1', 'Dodge', 'utility'), card('u2', 'Shout', 'utility'), card('d1', 'Smite', 'daily')]

const ADVENTURE = normalizeCardFile({ powers: [], adventures: [{ id: 'adv', title: 'Test', goal: 'Win.', setup: [] }] }).adventures[0]

const lostGame = () => {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t, i) => ({ ...withPicks(createHero(t), POWERS), player: i === 0 ? 'Colton' : 'JJ' }))
  const lobby = { ...initialState, lobbySurges: 3, lobbyTiles: 10, lobbyAdventure: ADVENTURE }
  let state = gameReducer(lobby, { type: 'START_GAME', heroes, tileRandom: [] })
  const quinn = state.heroes[0]
  // A hard game: Quinn levelled up, went down, and the last surge ran out.
  state = { ...state, xp: 4, turn: { ...state.turn, round: 7 }, heroes: state.heroes.map((h) => (h.id === quinn.id ? { ...h, level: 2, hp: 0 } : h)), surges: 0 }
  state = { ...state, stats: { [quinn.id]: { kills: 3, downs: 2, damageTaken: 9 } } }
  return gameReducer(state, { type: 'USE_SURGE', heroId: quinn.id })
}

describe('losing', () => {
  it('says how a game was lost', () => {
    const state = lostGame()
    expect(state.status).toBe('lost')
    expect(state.ending).toMatch(/fell with no healing surges left/)
  })

  it('forgets the reason when the players go back to the game', () => {
    const state = gameReducer(lostGame(), { type: 'RESUME' })
    expect(state.ending).toBe(null)
    expect(gameReducer(state, { type: 'END_GAME', result: 'lost' }).ending).toBe(null)
  })

  it('ends on highlights: rounds, monsters, and the closest call', () => {
    const state = lostGame()
    const lines = defeatHighlights(state)
    expect(lines.map((l) => l.label)).toEqual(['Rounds survived', 'Monsters defeated', 'Closest call'])
    expect(lines[0].value).toBe('7')
    expect(lines[1].value).toBe('3')
    expect(lines[2].value).toBe(`${state.heroes[0].name}, knocked down 2 times`)
  })
})

describe('Try again', () => {
  it('starts the same adventure with the same heroes, players and powers, fresh', () => {
    const lost = lostGame()
    const state = gameReducer(lost, { type: 'TRY_AGAIN', tileRandom: [] })
    expect(state.status).toBe('playing')
    expect(state.adventure.card.title).toBe('Test')
    expect(state.heroes.map((h) => h.key)).toEqual(lost.heroes.map((h) => h.key))
    expect(state.heroes.map((h) => h.player)).toEqual(['Colton', 'JJ'])
    expect(state.heroes[0].powers.map((p) => p.card?.name)).toEqual(['Strike', 'Slash', 'Dodge', 'Shout', 'Smite'])
    // Back to level 1 and full HP, with the lobby's surges and tile count, and nothing carried over.
    expect(state.heroes[0].level).toBe(1)
    expect(state.heroes[0].hp).toBe(state.heroes[0].maxHp)
    expect(state.surges).toBe(3)
    expect(state.retry).toEqual({ surges: 3, tiles: 10, difficulty: 'normal' })
    expect(state.xp).toBe(0)
    expect(state.stats).toEqual({})
    expect(state.ending).toBe(null)
    expect(state.turn.round).toBe(1)
    // The opening story plays again.
    expect(state.opening).toBeTruthy()
  })

  it('only follows a loss, and not in a campaign', () => {
    const lost = lostGame()
    const playing = gameReducer(lost, { type: 'RESUME' })
    expect(gameReducer(playing, { type: 'TRY_AGAIN' })).toBe(playing)
    const campaign = { ...lost, campaign: { card: {}, heroes: [] } }
    expect(gameReducer(campaign, { type: 'TRY_AGAIN' })).toBe(campaign)
  })

  it('works for a game saved before Try again existed', () => {
    const lost = { ...lostGame(), retry: undefined }
    const state = gameReducer(lost, { type: 'TRY_AGAIN', tileRandom: [] })
    expect(state.status).toBe('playing')
    expect(state.surges).toBe(initialState.surges)
  })

  it('is named for Undo', () => {
    expect(describeAction(lostGame(), { type: 'TRY_AGAIN' })).toBe('Try again')
  })
})
