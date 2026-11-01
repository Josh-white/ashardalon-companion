import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { normalizeTiles } from '../board/tileDefs.js'
import { allyStep } from './brain.js'
import { allyReaction } from './powers.js'

// A made-up Start tile (its two halves count as two tiles), open to the north.
const TILES = normalizeTiles(
  [
    {
      id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'],
      exits: { N: 'ooox', S: 'xxxx', W: 'xxxxxxxx', E: 'xxxxxxxx' },
      features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
    },
  ],
  [],
)
const card = (name, type, attack = '', damage = '', text = '') => ({ id: name, name, type, attack, damage, text })
const jab = card('Jab', 'at-will', '+6', '1', 'Attack one adjacent monster.')

// Heroes played by the computer, each with the given power cards (by type, in order).
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
const roll = () => 15
const run = (state, step) => gameReducer(state, step.action)

describe('the computer plays Flaming Sphere', () => {
  const sphere = card('Flaming Sphere', 'daily')

  it('casts it on two monsters, puts it down on their tile, and burns them at the end of the Hero Phase', () => {
    let state = start([['wizard', [jab, sphere]]])
    const heskan = state.heroes[0]
    state = place(state, heskan.id, [0, 7])
    state = withMonsters(state, [[0, 0], [2, 0]])
    let step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'USE_POWER', powerId: heskan.powers.find((p) => p.name === 'Flaming Sphere').id })
    state = run(state, step)
    step = allyStep(state, { roll })
    expect(step.action.type).toBe('PLACE_ITEM')
    state = run(state, step)
    const sphereAt = state.board.items.find((i) => i.kind === 'sphere').at
    // On the monsters' half of the Start tile.
    expect(sphereAt[1]).toBeLessThan(4)
    step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'POWER_DAMAGE', source: 'flamingSphere', monsterIds: ['m1', 'm2'] })
    state = run(state, step)
    expect(state.monsters.map((m) => m.hp)).toEqual([1, 1])
    expect(state.heroes[0].tokens.flamingSphere).toBe(2)
    // Burned once this turn: nothing more to do.
    expect(allyStep(state, { roll })).toBeNull()
  })

  it("keeps it for later when there's just one weak monster", () => {
    let state = start([['wizard', [card('Bolt', 'at-will', '+6', '1', 'Attack one monster within 1 tile.'), sphere]]])
    state = place(state, state.heroes[0].id, [0, 7])
    state = withMonsters(state, [[0, 0]], 1)
    expect(allyStep(state, { roll }).action).toMatchObject({ type: 'HERO_ATTACK' })
  })

  it('moves the sphere onto the monsters instead of a move it does not need', () => {
    let state = start([['wizard', [jab, sphere]]])
    const heskan = state.heroes[0]
    state = place(state, heskan.id, [0, 7])
    state = withMonsters(state, [[0, 0], [2, 0]])
    // A sphere still burning from an earlier turn, on Heskan's own (empty) half.
    state = {
      ...state,
      heroes: [{ ...heskan, tokens: { flamingSphere: 2 }, powers: heskan.powers.map((p) => (p.name === 'Flaming Sphere' ? { ...p, used: true } : p)) }],
      board: { ...state.board, items: [{ id: 'fs', kind: 'sphere', owner: heskan.id, at: [1, 6] }] },
      turn: { ...state.turn, attackSpent: { heroId: heskan.id, on: 'something' } },
    }
    const step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'MOVE_HERO_ITEM', id: 'fs' })
    expect(step.action.to[1]).toBeLessThan(4)
    expect(allyStep(run(state, step), { roll }).action).toMatchObject({ type: 'POWER_DAMAGE', source: 'flamingSphere' })
  })
})

describe('the computer plays the other big powers', () => {
  it('puts up a Blade Barrier in the way of monsters coming at it', () => {
    let state = start([['cleric', [jab, card('Blade Barrier', 'daily')]]])
    state = place(state, state.heroes[0].id, [0, 7])
    state = withMonsters(state, [[0, 0], [2, 0]])
    let step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'USE_POWER' })
    state = run(state, step)
    for (let i = 0; i < 5; i++) {
      step = allyStep(state, { roll })
      expect(step.action.type).toBe('PLACE_ITEM')
      state = run(state, step)
    }
    expect(state.board.items.filter((i) => i.kind === 'blade' && i.at)).toHaveLength(5)
  })

  it('casts Cause Fear when two friends have monsters to hit, and the monsters run away', () => {
    let state = start([
      ['cleric', [card('Fear', 'at-will', '+1', '1', 'Attack one adjacent monster.'), card('Cause Fear', 'daily')]],
      ['fighter', [jab]],
      ['rogue', [jab]],
    ])
    const [quinn, vistra, tarak] = state.heroes
    state = place(place(place(state, quinn.id, [0, 6]), vistra.id, [0, 1]), tarak.id, [2, 1])
    state = withMonsters(state, [[1, 0], [1, 1]])
    const step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'USE_POWER', heroIds: [vistra.id, tarak.id] })
    state = run(state, step)
    expect(state.turn.bonusAttacks.map((b) => b.heroId)).toEqual([vistra.id, tarak.id])
  })

  it('turns invisible when hurt with a monster close by', () => {
    let state = start([['wizard', [jab, card('Invisibility', 'utility')]]])
    const heskan = state.heroes[0]
    state = place(state, heskan.id, [0, 7])
    state = withMonsters(state, [[0, 0]])
    state = { ...state, heroes: [{ ...heskan, hp: 2 }], turn: { ...state.turn, attackSpent: { heroId: heskan.id, on: 'x' }, boardMoves: 1 } }
    expect(allyStep(state, { roll }).action).toMatchObject({ type: 'USE_POWER', powerId: heskan.powers.find((p) => p.name === 'Invisibility').id })
  })

  it('sends a friend at 1 HP to the Astral Refuge', () => {
    let state = start([['cleric', [jab, card('Astral Refuge', 'utility')]], ['fighter', [jab]]])
    const [quinn, vistra] = state.heroes
    state = place(place(state, quinn.id, [0, 7]), vistra.id, [1, 7])
    state = withMonsters(state, [[0, 0]])
    state = { ...state, heroes: [quinn, { ...vistra, hp: 1 }], turn: { ...state.turn, attackSpent: { heroId: quinn.id, on: 'x' }, boardMoves: 1 } }
    expect(allyStep(state, { roll }).action).toMatchObject({ type: 'USE_POWER', heroIds: [vistra.id] })
  })
})

describe('reactions and hero card abilities', () => {
  it('uses Tumbling Escape on a hard hit', () => {
    let state = start([['rogue', [jab, card('Tumbling Escape', 'utility')]]])
    const tarak = state.heroes[0]
    const power = tarak.powers.find((p) => p.name === 'Tumbling Escape')
    const hit = (dealt) => ({ ...state, turn: { ...state.turn, lastMonsterAttack: { monsterId: 'm1', results: [{ heroId: tarak.id, hit: true, dealt, miss: 0, conditions: [] }] } } })
    expect(allyReaction(hit(1))).toBeNull()
    expect(allyReaction(hit(2)).action).toEqual({ type: 'DODGE_HIT', heroId: tarak.id, powerId: power.id })
  })

  it("adds Keyleth's Healing Hands to a surge on her tile", () => {
    let state = start([['paladin', [jab]], ['fighter', [jab]]])
    const [keyleth, vistra] = state.heroes
    state = place(place(state, keyleth.id, [0, 7]), vistra.id, [1, 7])
    state = { ...state, heroes: [keyleth, { ...vistra, hp: 4 }], turn: { ...state.turn, abilityOffers: { healingHands: [vistra.id] } } }
    expect(allyReaction(state).action).toEqual({ type: 'HEALING_HANDS', heroId: vistra.id })
    expect(allyReaction(run(state, allyReaction(state)))).toBeNull()
  })

  it('uses Furious Assault to finish off a monster it hit', () => {
    let state = start([['rogue', [jab, card('Furious Assault', 'utility')]]])
    const tarak = state.heroes[0]
    state = withMonsters(state, [[0, 0]], 1)
    const hurt = { ...state, monsters: [{ ...state.monsters[0], maxHp: 2 }], turn: { ...state.turn, lastAttack: { heroId: tarak.id, powerId: tarak.powers[0].id, rolls: [{ monsterId: 'm1', hit: true }] } } }
    expect(allyReaction(hurt).action).toMatchObject({ type: 'POWER_DAMAGE', source: 'furious', monsterIds: ['m1'] })
  })
})
