import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from '../state/game.js'
import { normalizeTiles } from '../board/tileDefs.js'
import { key } from '../board/grid.js'
import { boardGrid } from '../board/play.js'
import { attackOptions, allyStep } from './brain.js'
import { fanReaction } from './fanPowers.js'
import { offTurnMove } from './brain.js'

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
    const oak = card('Longbow: Oak Arrow', 'at-will', '+11', '2', { range: 'within2', targetOnly: 'notOwnTile' })
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

describe('Fesud in the shadows (a fan Assassin)', () => {
  const ASSASSIN = { ...fan(3, 'assassin', ['shadowphage']), powerSlots: ['at-will', 'utility', 'utility', 'daily'] }
  const strike = card('Shadow Strike', 'at-will', '+7', '1', { shadow: 'leave', shadowBonus: 2 })
  const merge = card('Shadowmerge', 'utility', '', '', { use: {}, shadow: 'enter' })

  it('a hurt Fesud slips into the shadows instead of a so-so attack, then strikes from them', () => {
    let state = start([[ASSASSIN, [strike]]])
    state = place(state, hero(state, 0).id, [0, 6])
    state = withMonsters(state, [[0, 5]], 3)
    state = { ...state, heroes: state.heroes.map((h) => ({ ...h, hp: 2 })) }
    const step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'SET_SHADOW', on: true })
    state = run(state, step)
    expect(hero(state, 0).tokens.shadow).toBe(true)
    // In the shadows the attack counts the shadow bonus: a better chance than before.
    const before = attackOptions({ ...state, heroes: state.heroes.map((h) => ({ ...h, tokens: { ...h.tokens, shadow: false } })) }, { ...hero(state, 0), tokens: {} })[0]
    const after = attackOptions(state, hero(state, 0))
    expect(after).toEqual([])
    const fresh = { ...state, turn: { ...state.turn, attackSpent: null } }
    expect(attackOptions(fresh, hero(fresh, 0))[0].chance).toBeGreaterThan(before?.chance ?? 0)
  })

  it('a healthy Fesud just attacks', () => {
    let state = start([[ASSASSIN, [strike]]])
    state = place(state, hero(state, 0).id, [0, 6])
    state = withMonsters(state, [[0, 5]], 3)
    expect(allyStep(state, { roll }).action.type).toBe('HERO_ATTACK')
  })

  it("with nothing to attack and nowhere to go, he ends the Hero Phase in the shadows", () => {
    let state = start([[ASSASSIN, [strike]]])
    state = place(state, hero(state, 0).id, [0, 7])
    state = withMonsters(state, [[0, 0]], 3)
    state = { ...state, heroes: state.heroes.map((h) => ({ ...h, conditions: ['Immobilized'] })) }
    const step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'SET_SHADOW', on: true })
  })

  it('uses Shadowmerge before a finishing blow that could miss', () => {
    let state = start([[ASSASSIN, [card('Shadow Strike', 'at-will', '+1', '1', { shadow: 'leave', shadowBonus: 2 }), merge]]])
    state = place(state, hero(state, 0).id, [0, 6])
    state = withMonsters(state, [[0, 5]], 1)
    const step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'USE_POWER', powerId: powerId(state, 0, 'Shadowmerge') })
    state = run(state, step)
    expect(hero(state, 0).tokens.shadow).toBe(true)
    expect(allyStep(state, { roll }).action.type).toBe('HERO_ATTACK')
  })
})

describe("where a fan power's move takes a figure", () => {
  const MONK = fan(1, 'monk', ['mind-over-body'])
  const flurry = card('Flurry of Blows', 'at-will', '+6', '1', { board: { after: [{ pick: 'attacked', to: 'ownTile', hit: true }] } })

  it('Flurry of Blows drags the monster away from a hurt friend', () => {
    let state = start([[MONK, [flurry]], [HERO_TEMPLATES[0], [jab], false]])
    state = place(state, hero(state, 0).id, [1, 6])
    state = place(state, hero(state, 1).id, [1, 4])
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 1 ? { ...h, hp: 2 } : h)) }
    state = withMonsters(state, [[1, 5]], 3)
    state = run(state, allyStep(state, { roll }))
    expect(state.turn.boardMove).toBeTruthy()
    const step = allyStep(state, { roll })
    expect(step.action.type).toBe('BOARD_MOVE')
    const [x, y] = step.action.to
    // Farther from the hurt friend at [1,4] than where it was.
    expect(Math.abs(x - 1) + Math.abs(y - 4)).toBeGreaterThan(1)
  })

  it('a hurt hero dodging with Swift Evasion on a player\'s turn jumps away from the monster', () => {
    const swift = card('Swift Evasion', 'utility', '', '', { reaction: 'dodge', board: { dodge: [{ pick: 'self', to: 'tileWithin', n: 1 }] } })
    let state = start([[HERO_TEMPLATES[1], [jab], false], [{ ...fan(3, 'assassin', ['shadowphage']), powerSlots: ['at-will', 'utility'] }, [jab, swift]]])
    state = place(state, hero(state, 0).id, [3, 0])
    state = place(state, hero(state, 1).id, [0, 1])
    state = withMonsters(state, [[0, 0]], 3)
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 1 ? { ...h, hp: 2 } : h)) }
    state = { ...state, turn: { ...state.turn, boardMove: { heroId: hero(state, 1).id, source: 'Swift Evasion', attacked: [], steps: [{ pick: 'self', to: 'tileWithin', n: 1 }] } } }
    const step = offTurnMove(state)
    expect(step.action).toMatchObject({ type: 'BOARD_MOVE', id: hero(state, 1).id })
    // Onto the Start tile's other half, a tile away from the monster.
    expect(step.action.to[1]).toBeGreaterThanOrEqual(4)
  })

  it('Psionic Stride swaps a hurt friend out from next to a monster', () => {
    const stride = card('Psionic Stride', 'utility', '', '', { use: { board: [{ pick: 'otherHero', to: 'swap' }] } })
    let state = start([[MONK, [jab, stride]], [HERO_TEMPLATES[0], [jab], false]])
    state = place(state, hero(state, 0).id, [0, 7])
    state = place(state, hero(state, 1).id, [0, 1])
    state = withMonsters(state, [[0, 0]], 3)
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 1 ? { ...h, hp: 2 } : h)) }
    let step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'USE_POWER', powerId: powerId(state, 0, 'Psionic Stride') })
    state = run(state, step)
    step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'BOARD_MOVE', id: hero(state, 1).id })
    state = run(state, step)
    expect(state.board.tokens[hero(state, 0).id]).toEqual([0, 1])
    expect(state.board.tokens[hero(state, 1).id]).toEqual([0, 7])
  })
})

describe('Whirling Mantis Step (a fan Monk)', () => {
  it('walks over to two monsters to hit both', () => {
    const mantis = card('Whirling Mantis Step', 'daily', '+7', '1', { targets: 'any', before: 'First move your speed.', board: { before: [{ pick: 'self', to: 'squares', n: 'speed' }] } })
    let state = start([[fan(1, 'monk', ['mind-over-body']), [jab, mantis]]])
    state = place(state, hero(state, 0).id, [0, 7])
    state = withMonsters(state, [[1, 2], [1, 4]], 3)
    const step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'START_BOARD_MOVE', powerId: powerId(state, 0, 'Whirling Mantis Step') })
  })
})

describe('Hjalmir (a fan Battlemaster)', () => {
  const BATTLEMASTER = { ...fan(1, 'battlemaster', ['fearless']), powerSlots: ['at-will', 'utility', 'utility', 'daily'] }
  const improviseCard = card('Improvise', 'utility', '', '', { use: { afterMiss: true, selfHurt: 1, hurt: 1, hurtReach: 'adjacent' }, reusable: true })
  const comeCard = card('Come and Get It', 'utility', '', '', { use: { board: [{ pick: 'self', to: 'nextToNewMonster' }] } })
  const lead = card('Follow My Lead', 'daily', '+10', '2', { follower: true, onHit: { status: 'cowardly' } })

  it('Improvise finishes a 1 HP monster right after his own miss', () => {
    let state = start([[BATTLEMASTER, [jab, improviseCard]]])
    state = place(state, hero(state, 0).id, [0, 6])
    state = withMonsters(state, [[0, 5]], 1)
    state = gameReducer(state, { type: 'HERO_ATTACK', heroId: hero(state, 0).id, powerId: powerId(state, 0, 'Jab'), targets: [{ monsterId: 'm1', roll: 1 }] })
    const step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'USE_POWER', powerId: powerId(state, 0, 'Improvise'), monsterIds: ['m1'] })
    state = run(state, step)
    expect(state.monsters).toEqual([])
    expect(hero(state, 0).hp).toBe(hero(state, 0).maxHp - 1)
  })

  it("Improvise isn't used on a monster it wouldn't finish", () => {
    let state = start([[BATTLEMASTER, [jab, improviseCard]]])
    state = place(state, hero(state, 0).id, [0, 6])
    state = withMonsters(state, [[0, 5]], 3)
    state = gameReducer(state, { type: 'HERO_ATTACK', heroId: hero(state, 0).id, powerId: powerId(state, 0, 'Jab'), targets: [{ monsterId: 'm1', roll: 1 }] })
    expect(allyStep(state, { roll })?.action.type).not.toBe('USE_POWER')
  })

  it('Fearless: with the attack done he steps next to a monster for next turn', () => {
    let state = start([[BATTLEMASTER, [jab]]])
    state = place(state, hero(state, 0).id, [0, 7])
    state = withMonsters(state, [[0, 4]], 3)
    state = { ...state, turn: { ...state.turn, attackSpent: 'Jab' } }
    const step = allyStep(state, { roll })
    expect(step.action.type).toBe('MOVE_HERO')
    const [x, y] = step.action.to
    expect(Math.max(Math.abs(x), Math.abs(y - 4))).toBe(1)
  })

  it('Come and Get It: jumps next to a new monster by a hurt friend, on a player\'s turn', () => {
    let state = start([[HERO_TEMPLATES[0], [jab], false], [BATTLEMASTER, [jab, comeCard]]])
    state = place(state, hero(state, 0).id, [0, 1])
    state = place(state, hero(state, 1).id, [2, 7])
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, hp: 2 } : h)) }
    state = withMonsters(state, [[0, 0]], 3)
    const step = fanReaction(state, () => 10)
    expect(step.action).toMatchObject({ type: 'USE_POWER', heroId: hero(state, 1).id, powerId: powerId(state, 1, 'Come and Get It') })
    state = run(state, step)
    const move = offTurnMove(state)
    expect(move.action.type).toBe('BOARD_MOVE')
    state = run(state, move)
    const [x, y] = state.board.tokens[hero(state, 1).id]
    expect(Math.max(Math.abs(x), Math.abs(y))).toBe(1)
    // Not again for the same monster once he's next to it.
    expect(fanReaction(state, () => 10)).toBeNull()
  })

  it('Follow My Lead sends the friend nearest a monster next to it', () => {
    let state = start([[BATTLEMASTER, [jab, lead]], [HERO_TEMPLATES[0], [jab]]])
    state = place(state, hero(state, 0).id, [0, 6])
    state = place(state, hero(state, 1).id, [2, 2])
    state = withMonsters(state, [[0, 5], [0, 1]], 5)
    state = gameReducer(state, { type: 'HERO_ATTACK', heroId: hero(state, 0).id, powerId: powerId(state, 0, 'Follow My Lead'), followerId: hero(state, 1).id, targets: [{ monsterId: 'm1', roll: 18 }] })
    expect(state.turn.boardMove?.tokens).toEqual([hero(state, 1).id])
    const step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'BOARD_MOVE', id: hero(state, 1).id })
    const [x, y] = step.action.to
    expect([[0, 5], [0, 1]].some(([mx, my]) => Math.max(Math.abs(x - mx), Math.abs(y - my)) === 1)).toBe(true)
  })
})

describe('Savryna (a fan Ranger)', () => {
  const RANGER = { ...fan(2, 'ranger'), powerSlots: ['at-will', 'at-will', 'utility', 'utility'] }
  const oak = card('Longbow: Oak Arrow', 'at-will', '+11', '2', { range: 'within2', targetOnly: 'notOwnTile' })
  const pacify = card('Longbow: Pacifying Shot', 'at-will', '+8', '1', { range: 'within2', targetOnly: 'notOwnTile', onHit: { status: 'pacified' } })
  const treetop = card('Treetop', 'utility', '', '', { use: { perch: true } })
  const tracker = card("Tracker's Instinct", 'utility', '', '', { use: { cancelEncounter: true }, uses: 2 })

  it('Pacifies a monster next to a hurt friend rather than plinking it', () => {
    let state = start([[RANGER, [oak, pacify]], [HERO_TEMPLATES[0], [jab], false]])
    state = place(state, hero(state, 0).id, [0, 7])
    state = place(state, hero(state, 1).id, [0, 1])
    state = withMonsters(state, [[0, 0]], 3)
    expect(attackOptions(state, hero(state, 0))[0].power.name).toBe('Longbow: Oak Arrow')
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 1 ? { ...h, hp: 2 } : h)) }
    expect(attackOptions(state, hero(state, 0))[0].power.name).toBe('Longbow: Pacifying Shot')
  })

  it('Treetop: a hurt ranger next to a monster climbs out of reach at the end of the Hero Phase', () => {
    let state = start([[RANGER, [oak, treetop]]])
    state = place(state, hero(state, 0).id, [0, 6])
    state = withMonsters(state, [[0, 5]], 3)
    state = { ...state, heroes: state.heroes.map((h) => ({ ...h, hp: 2 })), turn: { ...state.turn, attackSpent: 'Longbow: Oak Arrow' } }
    const step = allyStep(state, { roll })
    expect(step.action).toMatchObject({ type: 'USE_POWER', powerId: powerId(state, 0, 'Treetop') })
    state = run(state, step)
    expect(hero(state, 0).tokens.treetop).toBe(true)
  })

  it("Tracker's Instinct cancels a nasty encounter from a black-triangle tile, for free", () => {
    let state = start([[HERO_TEMPLATES[0], [jab], false], [RANGER, [oak, tracker]]])
    const encounter = { cardId: 'pit', heroId: hero(state, 0).id, attacked: false, card: { id: 'pit', name: 'Pit Trap', type: 'trap' } }
    state = { ...state, encounter }
    expect(fanReaction(state, () => 10)).toBeNull()
    state = { ...state, turn: { ...state.turn, triangle: true } }
    const step = fanReaction(state, () => 10)
    expect(step.action).toMatchObject({ type: 'USE_POWER', heroId: hero(state, 1).id, powerId: powerId(state, 1, "Tracker's Instinct") })
    const xp = state.xp
    state = run(state, step)
    expect(state.encounter).toBeNull()
    expect(state.xp).toBe(xp)
  })
})
