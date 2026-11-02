import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { normalizeTiles } from '../board/tileDefs.js'
import { key } from '../board/grid.js'
import { boardGrid } from '../board/play.js'
import { attackOptions, allyStep } from './brain.js'
import { fanReaction } from './fanPowers.js'

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
const card = (name, type, attack = '', damage = '', effect = undefined, text = 'Made-up power.') => ({ id: name, name, type, attack, damage, text, ...(effect ? { effect } : {}) })
const jab = card('Jab', 'at-will', '+6', '1')

// Fan heroes built on box templates (the cards.json fan heroes look like this to the app).
const fan = (i, key, abilityEffects = []) => ({ ...HERO_TEMPLATES[i], key, name: key, abilityEffects })

// Heroes played by the computer, each with the given power cards (by slot type, in order).
function start(heroes) {
  const list = heroes.map(([template, powers, ally = true]) => {
    const hero = createHero(template)
    const given = new Set()
    const slots = hero.powers.map((p) => {
      const c = powers.find((x) => x.type === p.type && !given.has(x))
      if (!c) return { ...p, card: { id: `none-${p.id}`, name: `none-${p.id}`, type: p.type, attack: '', damage: '', text: '' } }
      given.add(c)
      return { ...p, card: c, name: c.name }
    })
    return { ...hero, ally, powers: slots }
  })
  const state = gameReducer(initialState, { type: 'START_GAME', heroes: list, tileRandom: [], boardTiles: TILES })
  return { ...state, firstRoll: null, opening: null }
}
const monster = (id, hp = 2, extra = {}) => ({ id, name: `Rat ${id}`, maxHp: hp, hp, ac: 10, xp: 1, ownerId: 'x', conditions: [], card: { hp, figures: 1, attacks: [], tactics: [] }, ...extra })
function withMonsters(state, spots, hp = 2) {
  const monsters = spots.map((_, i) => monster(`m${i + 1}`, hp))
  const tokens = Object.fromEntries(spots.map((at, i) => [`m${i + 1}`, at]))
  return { ...state, monsters, board: { ...state.board, tokens: { ...state.board.tokens, ...tokens } } }
}
const place = (state, id, at) => ({ ...state, board: { ...state.board, tokens: { ...state.board.tokens, [id]: at } } })
const hero = (state, i) => state.heroes[i]
const powerId = (state, i, name) => hero(state, i).powers.find((p) => p.name === name).id
const roll = () => 15
const run = (state, step) => gameReducer(state, step.action)

describe('Wolf Form (a fan Druid)', () => {
  const DRUID = fan(2, 'druid', ['natures-healing'])
  const bite = card('Wolf Form', 'at-will', '+9', '1', { wolf: true })

  it("never picks the wolf's attack while the hero isn't the wolf, so the turn doesn't stall", () => {
    let state = start([[DRUID, [bite, jab]]])
    state = place(state, hero(state, 0).id, [0, 6])
    state = withMonsters(state, [[0, 5]])
    expect(attackOptions(state, hero(state, 0)).map((o) => o.power.name)).toEqual(['Jab'])
    const step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'HERO_ATTACK', powerId: powerId(state, 0, 'Jab') })
    expect(run(state, step)).not.toBe(state)
  })

  it('as the wolf, only bites', () => {
    let state = start([[DRUID, [bite, jab]]])
    state = place(state, hero(state, 0).id, [0, 6])
    state = withMonsters(state, [[0, 5]])
    state = { ...state, heroes: state.heroes.map((h) => ({ ...h, tokens: { ...h.tokens, wolf: { hp: h.hp } } })) }
    expect(attackOptions(state, hero(state, 0)).map((o) => o.power.name)).toEqual(['Wolf Form'])
  })
})

describe('fan target rules', () => {
  it('Guiding Strike (no attack number) is a sure hit, only on a monster next to another hero', () => {
    const guiding = card('Guiding Strike', 'at-will', '', '1', { autoHit: true, targetOnly: 'nextToHero' })
    let state = start([[fan(0, 'bard', ['bardic-song']), [guiding]], [HERO_TEMPLATES[1], [jab]]])
    state = place(state, hero(state, 0).id, [0, 6])
    state = place(state, hero(state, 1).id, [3, 7])
    state = withMonsters(state, [[1, 6]])
    // The monster is next to the bard but not next to the other hero.
    expect(attackOptions(state, hero(state, 0))).toEqual([])
    state = place(state, hero(state, 1).id, [2, 6])
    const [option] = attackOptions(state, hero(state, 0))
    expect(option).toMatchObject({ power: { name: 'Guiding Strike' }, chance: 1, targets: ['m1'] })
    const after = run(state, allyStep(state, { roll: () => 1 }))
    expect(after.monsters[0].hp).toBe(1)
  })

  it('a Longbow shot skips monsters on the hero\'s own tile', () => {
    const oak = card('Longbow: Oak Arrow', 'at-will', '+11', '1', { range: 'within2', targetOnly: 'notOwnTile' })
    let state = start([[fan(3, 'ranger'), [oak]]])
    state = place(state, hero(state, 0).id, [0, 6])
    // m1 next to her on her half of the Start tile, m2 on the other half.
    state = withMonsters(state, [[0, 5], [0, 1]])
    expect(attackOptions(state, hero(state, 0))[0].targets).toEqual(['m2'])
  })
})

describe('Ballad of Life', () => {
  const ballad = card('Ballad of Life', 'utility', '', '', { use: { heal: 2, pick: 'other' } }, 'Made-up power: a hero at 0 HP gets 2 HP.')

  it('is kept for a hero at 0 HP, not spent on a scratch', () => {
    let state = start([[fan(0, 'bard', ['bardic-song']), [ballad, jab]], [HERO_TEMPLATES[1], [jab], false]])
    state = place(state, hero(state, 0).id, [0, 7])
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 1 ? { ...h, hp: h.maxHp - 3 } : h)) }
    expect(allyStep(state, { roll })?.action.type).not.toBe('USE_POWER')
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 1 ? { ...h, hp: 0 } : h)) }
    const step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'USE_POWER', powerId: powerId(state, 0, 'Ballad of Life'), heroIds: [hero(state, 1).id] })
    expect(run(state, step).heroes[1].hp).toBe(2)
  })
})

describe('songs and stances at the start of the Hero Phase', () => {
  const courage = card('Song of Courage', 'utility', '', '', { use: { buff: { attack: 2, who: 'all', lasts: 'heroPhaseEnd' } } })
  const melody = card('Melody of Defense', 'utility', '', '', { use: { buff: { ac: 2, who: 'all', lasts: 'heroPhaseEnd' } } })
  const BARD = { ...fan(0, 'bard', ['bardic-song']), powerSlots: ['at-will', 'utility', 'utility', 'daily'] }

  it('sings Song of Courage with two monsters out, then attacks', () => {
    let state = start([[BARD, [jab, courage, melody]]])
    state = place(state, hero(state, 0).id, [0, 6])
    state = withMonsters(state, [[0, 5], [2, 0]])
    let step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'USE_POWER', powerId: powerId(state, 0, 'Song of Courage') })
    state = run(state, step)
    expect(hero(state, 0).buffs[0]).toMatchObject({ attack: 2 })
    step = allyStep(state, { roll })
    expect(step.action.type).toBe('HERO_ATTACK')
  })

  it('sings Melody of Defense when a hurt friend has a monster close and there is just one monster', () => {
    let state = start([[BARD, [jab, courage, melody]]])
    state = place(state, hero(state, 0).id, [0, 6])
    state = { ...state, heroes: state.heroes.map((h) => ({ ...h, hp: 2 })) }
    state = withMonsters(state, [[2, 7]])
    expect(allyStep(state, { roll }).action).toMatchObject({ type: 'USE_POWER', powerId: powerId(state, 0, 'Melody of Defense') })
  })

  it("doesn't sing with no monster on the board", () => {
    let state = start([[BARD, [jab, courage, melody]]])
    state = place(state, hero(state, 0).id, [0, 6])
    expect(allyStep(state, { roll })?.action.type).not.toBe('USE_POWER')
  })
})

describe('Heavy Hitter', () => {
  const heavy = card('Heavy Hitter', 'utility', '', '', { use: { buff: { attack: 2, who: 'self', lasts: 'thisPhase' } }, uses: 2 })
  const club = card('Club', 'at-will', '+2', '1')

  it('is used before a finishing blow that could miss, not before a sure one', () => {
    let state = start([[fan(1, 'battlemaster', ['fearless']), [club, heavy]]])
    state = place(state, hero(state, 0).id, [0, 6])
    state = withMonsters(state, [[0, 5]], 1)
    const step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'USE_POWER', powerId: powerId(state, 0, 'Heavy Hitter') })
    state = run(state, step)
    expect(allyStep(state, { roll }).action.type).toBe('HERO_ATTACK')
  })
})

describe('Fleetfooted', () => {
  it('takes a trap on the hero\'s tile away instead of rolling to disable it', () => {
    const fleet = card('Fleetfooted', 'utility', '', '', { use: { removeTrap: true }, shadow: 'leave', reusable: true })
    let state = start([[fan(3, 'assassin', ['shadowphage']), [jab, fleet]]])
    state = place(state, hero(state, 0).id, [0, 6])
    const area = boardGrid(state.board).get(key([0, 6])).area
    state = { ...state, traps: [{ id: 't1', name: 'Dart Trap', type: 'trap', tile: area, card: {} }] }
    const step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'USE_POWER', powerId: powerId(state, 0, 'Fleetfooted'), trapIds: ['t1'] })
    expect(run(state, step).traps).toEqual([])
  })
})

describe('on anyone\'s turn', () => {
  it('a computer monk rolls Mind Over Body for a new condition', () => {
    let state = start([[fan(1, 'monk', ['mind-over-body']), [jab]]])
    state = gameReducer(state, { type: 'TOGGLE_HERO_CONDITION', heroId: hero(state, 0).id, condition: 'Dazed' })
    const step = fanReaction(state, () => 12)
    expect(step.action).toMatchObject({ type: 'MIND_OVER_BODY', condition: 'Dazed', roll: 12 })
    state = run(state, step)
    expect(hero(state, 0).conditions).toEqual([])
    expect(fanReaction(state, () => 12)).toBeNull()
  })

  it("a computer bard sings for a computer hero's miss that would have finished a monster, but not a player's", () => {
    const BARD = fan(0, 'bard', ['bardic-song'])
    for (const ally of [true, false]) {
      let state = start([[BARD, [jab]], [HERO_TEMPLATES[1], [jab], ally]])
      state = place(state, hero(state, 0).id, [0, 7])
      state = place(state, hero(state, 1).id, [0, 6])
      state = withMonsters(state, [[0, 5]], 1)
      state = { ...state, turn: { ...state.turn, heroIndex: 1 } }
      state = gameReducer(state, { type: 'HERO_ATTACK', heroId: hero(state, 1).id, powerId: powerId(state, 1, 'Jab'), targets: [{ monsterId: 'm1', roll: 1 }] })
      expect(state.turn.lastAttack.rolls[0].hit).toBe(false)
      const step = fanReaction(state, () => 18)
      if (!ally) {
        expect(step).toBeNull()
        continue
      }
      expect(step.action).toMatchObject({ type: 'REROLL_ATTACK', helperId: hero(state, 0).id, bardicSong: true, monsterId: 'm1' })
      state = run(state, step)
      expect(state.monsters).toEqual([])
    }
  })
})
