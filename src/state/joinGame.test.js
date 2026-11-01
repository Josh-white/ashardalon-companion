import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeTiles } from '../board/tileDefs.js'
import { createHero, gameReducer, initialState } from './game.js'
import { canJoin, freeHeroes } from '../components/JoinGame.jsx'

// A made-up Start tile, 3 floor columns wide.
const TILES = normalizeTiles(
  [{ id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'], exits: { N: 'ooox', S: 'xxxx', W: 'xxxxxxxx', E: 'xxxxxxxx' }, features: [] }],
  [],
)
const template = (key) => HERO_TEMPLATES.find((t) => t.key === key)
const playing = ({ board = true } = {}) => {
  const heroes = ['fighter', 'wizard'].map((k) => ({ ...createHero(template(k)), player: k === 'fighter' ? 'JJ' : 'Colton' }))
  const state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], ...(board ? { boardTiles: TILES } : {}) })
  return { ...state, firstRoll: { ...state.firstRoll, winner: heroes[0].id }, opening: null }
}
const rogue = { type: 'JOIN_GAME', heroKey: 'rogue', player: 'Easton', picks: [], deviceId: 'easton-ipad' }

describe('joining a game already going', () => {
  it('puts the new hero next to the active hero and right after them in the turn order', () => {
    const state = playing()
    const joined = gameReducer(state, rogue)
    expect(joined.heroes.map((h) => h.key)).toEqual(['fighter', 'rogue', 'wizard'])
    expect(joined.turn.heroIndex).toBe(0)
    const easton = joined.heroes[1]
    expect(easton).toMatchObject({ player: 'Easton', level: 1 })
    const [x, y] = joined.board.tokens[easton.id]
    const [ax, ay] = state.board.tokens[state.heroes[0].id]
    expect(Math.max(Math.abs(x - ax), Math.abs(y - ay))).toBe(1)
    expect(Object.values(state.board.tokens).some((at) => at[0] === x && at[1] === y)).toBe(false)
    expect(joined.log[0].text).toMatch(/Easton brings/)
    expect(joined.moment).toMatchObject({ kind: 'join', heroId: easton.id })
  })

  it('takes their turn after the hero whose turn it was', () => {
    let state = gameReducer(playing(), rogue)
    for (let i = 0; i < 10 && state.turn.heroIndex === 0; i++) state = gameReducer(state, { type: 'NEXT_PHASE', rolls: [], roll: 10 })
    expect(state.heroes[state.turn.heroIndex].key).toBe('rogue')
  })

  it('needs a name, a free hero, and the roll for first turn over', () => {
    const state = playing()
    expect(gameReducer(state, { ...rogue, player: ' ' })).toBe(state)
    expect(gameReducer(state, { ...rogue, heroKey: 'wizard' })).toBe(state)
    const rolling = { ...state, firstRoll: { ...state.firstRoll, winner: null } }
    expect(gameReducer(rolling, rogue)).toBe(rolling)
    expect(canJoin(rolling)).toBe(false)
    expect(canJoin(state)).toBe(true)
    expect(freeHeroes(state).map((t) => t.key)).not.toContain('wizard')
  })

  it('can be a computer ally, but only on the virtual board', () => {
    const ally = gameReducer(playing(), { ...rogue, player: '', ally: true })
    expect(ally.heroes[1].ally).toBe(true)
    const tiles = playing({ board: false })
    expect(gameReducer(tiles, { ...rogue, player: '', ally: true })).toBe(tiles)
    // On real tiles the players put the figure down themselves.
    const human = gameReducer(tiles, rogue)
    expect(human.heroes[1].ally).toBeUndefined()
    expect(human.log[0].text).toMatch(/Put Tarak's figure next to/)
  })

  it('in a campaign, joins at level 1 with no gold or items, and stays for the next adventures', () => {
    const state = playing()
    const record = { key: 'fighter', deviceId: 'jj', player: 'JJ', level: 2, gold: 300, items: [], picks: [] }
    const campaign = { ...state, campaign: { heroes: [record, { ...record, key: 'wizard', deviceId: 'colton', level: 1 }] } }
    const joined = gameReducer(campaign, rogue)
    expect(joined.campaign.heroes).toHaveLength(3)
    expect(joined.campaign.heroes[2]).toMatchObject({ key: 'rogue', deviceId: 'easton-ipad', player: 'Easton', level: 1, gold: 0, items: [] })
  })
})
