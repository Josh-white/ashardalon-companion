import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { momentSounds } from '../audio/sfx.js'
import { msAt, slowMo, tokenFx } from '../components/AttackFx.jsx'
import { FX_DELAY_MS, FX_IMPACT_MS, attackFx, heroLook, monsterLook, rayColor } from './attackFx.js'
import { normalizeTiles } from './tileDefs.js'

const TILES = normalizeTiles(
  [
    {
      id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'],
      exits: { N: 'ooox', S: 'ooox', W: 'oooooooo', E: 'xxxxxxxx' },
      features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
    },
  ],
  [],
)

const bite = { id: 'bite', name: 'Bite', bonus: 5, damage: 2, miss: 0, conditions: [] }
const rat = (id, hp) => ({ id, name: 'Rat', hp, maxHp: hp, ac: 12, xp: 1, conditions: [], card: { hp, figures: 1, attacks: [bite], tactics: [] } })

// Two heroes on the Start tile and two rats next to them.
function game() {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
  let state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  const zap = { id: 'arc', name: 'Arc Lightning', type: 'at-will', used: false, card: { name: 'Arc Lightning', attack: '+5', damage: '1' } }
  const sword = { id: 'ss', name: 'Sure Strike', type: 'at-will', used: false, card: { name: 'Sure Strike', attack: '+6', damage: '1' } }
  state = {
    ...state,
    firstRoll: null,
    heroes: state.heroes.map((h, i) => ({ ...h, powers: [i === 0 ? zap : sword] })),
    monsters: [{ ...rat('m1', 1), ownerId: heroes[0].id }, { ...rat('m2', 3), ownerId: heroes[0].id }],
    board: { ...state.board, tokens: { ...state.board.tokens, m1: [0, 0], m2: [2, 0] } },
  }
  return { state, heroes: state.heroes }
}

describe('attack animations on the virtual board', () => {
  it("draws a hero's attack from the hero to each monster, with hit, miss and defeated", () => {
    const { state, heroes } = game()
    const next = gameReducer(state, { type: 'HERO_ATTACK', heroId: heroes[0].id, powerId: 'arc', targets: [{ monsterId: 'm1', roll: 19 }, { monsterId: 'm2', roll: 2 }] })
    const fx = next.moment.fx
    expect(fx.look).toBe('zap')
    expect(fx.by).toBe('hero')
    expect(fx.from).toEqual(state.board.tokens[heroes[0].id])
    // The defeated rat's token is off the board, so its square and picture come with the animation.
    expect(next.board.tokens.m1).toBeUndefined()
    expect(fx.shots[0]).toMatchObject({ to: [0, 0], result: 'kill', dealt: 1, art: 'monster-rat' })
    expect(fx.shots[1]).toMatchObject({ to: [2, 0], result: 'miss', dealt: 0, art: null })
  })

  it("draws a monster's bite at the hero it hurt", () => {
    const { state, heroes } = game()
    const next = gameReducer(state, { type: 'MONSTER_ATTACK', monsterId: 'm2', attackId: 'bite', targets: [{ heroId: heroes[1].id, roll: 18 }] })
    expect(next.moment.fx).toMatchObject({ look: 'bite', by: 'monster', from: [2, 0], shots: [{ to: next.board.tokens[heroes[1].id], result: 'hit', dealt: 2 }] })
  })

  it('a hero knocked to 0 HP is down', () => {
    const { state: base, heroes } = game()
    const state = { ...base, heroes: base.heroes.map((h, i) => (i === 1 ? { ...h, hp: 2 } : h)) }
    const next = gameReducer(state, { type: 'MONSTER_ATTACK', monsterId: 'm2', attackId: 'bite', targets: [{ heroId: heroes[1].id, roll: 18 }] })
    expect(next.moment.fx.shots[0].result).toBe('down')
  })

  it('leaves games without the virtual board alone', () => {
    const { state, heroes } = game()
    const next = gameReducer({ ...state, board: null }, { type: 'HERO_ATTACK', heroId: heroes[1].id, powerId: 'ss', targets: [{ monsterId: 'm2', roll: 15 }] })
    expect(next.moment.fx).toBeUndefined()
    expect(attackFx(state, next, { type: 'END_PHASE' })).toBeNull()
  })

  it('picks a look for each kind of attack', () => {
    expect(heroLook('Heskan: Arc Lightning!')).toBe('zap')
    expect(heroLook('Heskan: Ray of Frost!')).toBe('frost')
    expect(heroLook('Vistra: Sure Strike!')).toBe('weapon')
    expect(heroLook('Tarak: Positioning Shot!')).toBe('arrow')
    expect(['Dagger', 'Mace', 'Morning Star'].map(monsterLook)).toEqual(['slash', 'slash', 'slash'])
    expect(['Bite', 'Claws', 'Tentacles', 'Tail Sweep'].map(monsterLook)).toEqual(['bite', 'claw', 'claw', 'claw'])
    expect(['Arrow', 'Quills', 'Lightning', 'Windstorm', 'Gibbering', 'Fire Ray'].map(monsterLook)).toEqual(['arrow', 'arrow', 'zap', 'wind', 'psychic', 'ray'])
    expect(rayColor('Poison Ray')).not.toBe(rayColor('Fire Ray'))
  })

  it('times the sounds and the token moves to the hit', () => {
    expect(slowMo(0)).toBe(0)
    expect(slowMo(1)).toBeCloseTo(1)
    expect(Math.abs(msAt(0.5) - FX_IMPACT_MS)).toBeLessThan(50)
    const fx = { look: 'weapon', by: 'hero', from: [0, 2], shots: [{ to: [0, 0], result: 'hit', dealt: 2 }] }
    const moment = { kind: 'roll', title: 'Vistra: Sure Strike!', rolls: [{ monsterId: 'm1', label: 'Rat', value: 15, hit: true }] }
    // Without the board the sword clangs as the die lands; with it, as the swing lands.
    expect(momentSounds(moment).find(([s]) => s === 'weapon')[1]).toBeLessThan(FX_DELAY_MS)
    expect(momentSounds({ ...moment, fx }).find(([s]) => s === 'weapon')[1]).toBe(FX_DELAY_MS + FX_IMPACT_MS)
    const playing = { id: 'x', fx }
    expect(tokenFx(playing, [0, 0]).className).toBe('fx-flinch')
    expect(tokenFx(playing, [0, 2]).className).toBe('fx-lunge')
    expect(tokenFx(playing, [1, 1])).toBeNull()
  })
})
