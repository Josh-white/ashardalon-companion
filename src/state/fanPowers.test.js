import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { createHero, gameReducer, initialState } from './game.js'
import { moveTargets } from '../board/powerMoves.js'
import { tokenTargets } from '../board/heroTokens.js'
import { outOfReach } from '../board/tactics.js'
import { statusesOf } from './monsterStatus.js'
import { pathKinds } from './fanPowers.js'
import { petsDue, petsOf } from './pets.js'
import { normalizeTiles } from '../board/tileDefs.js'
import { boardGrid } from '../board/play.js'

const TILES = normalizeTiles(
  [
    {
      id: 'start', kind: 'start', rows: ['...#', '...#', '...#', '...#', '...#', '...#', '...#', '...#'],
      exits: { N: 'ooox', S: 'ooox', W: 'oooooooo', E: 'xxxxxxxx' },
      features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
    },
    { id: 'room', name: 'Room', kind: 'regular', triangle: 'black', rows: ['....', '....', '....', '....'], exits: { N: 'oooo', S: 'oooo', W: 'oooo', E: 'oooo' } },
  ],
  [],
)

const rat = (id, extra = {}) => ({ id, name: 'Rat', hp: 3, maxHp: 3, ac: 12, xp: 1, ownerId: null, conditions: [], card: { hp: 3, figures: 1, attacks: [{ id: 'bite', name: 'Bite', bonus: 5, damage: 2 }], tactics: [], types: ['Animal'] }, ...extra })

// Two heroes at [0,2] and [1,2] on the Start tile, a room north of it with a rat on it.
function game() {
  const heroes = HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t))
  let state = gameReducer(initialState, { type: 'START_GAME', heroes, tileRandom: [], boardTiles: TILES })
  const tiles = [...state.board.tiles, { uid: 't1', tileId: 'room', at: [0, -4], turn: 0 }]
  state = { ...state, firstRoll: null, monsters: [rat('m1')], board: { ...state.board, tiles, tokens: { ...state.board.tokens, m1: [1, -2] } } }
  return state
}
// Hands hero i a power card (the utility slot by default) with these effects.
function give(state, i, effect, type = 'utility', name = 'Fan power') {
  const slot = state.heroes[i].powers.find((p) => p.type === type)
  const next = gameReducer(state, { type: 'SET_POWER_CARD', heroId: state.heroes[i].id, powerId: slot.id, card: { id: name, name, effect } })
  return { state: next, id: slot.id }
}
const use = (state, i, powerId, extra = {}) => gameReducer(state, { type: 'USE_POWER', heroId: state.heroes[i].id, powerId, ...extra })
const place = (state, kind, to) => {
  const item = state.board.items.find((x) => x.kind === kind && !x.at)
  return gameReducer(state, { type: 'PLACE_ITEM', id: item.id, to })
}

describe('menu and quick fan utilities', () => {
  it("Nature's Gifts: pick an option; heal up to 2 heroes on the tile", () => {
    let state = game()
    state = { ...state, heroes: state.heroes.map((h) => ({ ...h, hp: h.maxHp - 2 })) }
    const gifts = { use: { choose: [{ label: 'Heal', pick: 'any', heal: 1, count: 2, reach: 'sameTile' }, { label: 'End a condition', pick: 'any', endCondition: true }] } }
    const { state: s, id } = give(state, 0, gifts)
    expect(use(s, 0, id, { heroIds: [s.heroes[0].id] })).toBe(s)
    const healed = use(s, 0, id, { option: 0, heroIds: s.heroes.map((h) => h.id) })
    expect(healed.heroes.map((h) => h.maxHp - h.hp)).toEqual([1, 1])
    const dazed = gameReducer(s, { type: 'TOGGLE_HERO_CONDITION', heroId: s.heroes[0].id, condition: 'Dazed' })
    const cleared = use(dazed, 0, id, { option: 1, heroIds: [s.heroes[0].id], condition: 'Dazed' })
    expect(cleared.heroes[0].conditions).toEqual([])
  })

  it('Improvise: only after a miss; lose 1 HP, 1 damage to a monster next to you', () => {
    let state = game()
    state = { ...state, board: { ...state.board, tokens: { ...state.board.tokens, m1: [0, 1] } } }
    const strike = give(state, 0, {}, 'at-will', 'Strike')
    state = gameReducer(strike.state, { type: 'SET_POWER_CARD', heroId: state.heroes[0].id, powerId: strike.id, card: { id: 'Strike', name: 'Strike', attack: '+5', damage: '1' } })
    const { state: s, id } = give(state, 0, { use: { afterMiss: true, selfHurt: 1, hurt: 1, hurtReach: 'adjacent' } })
    expect(use(s, 0, id, { monsterIds: ['m1'] })).toBe(s)
    const missed = gameReducer(s, { type: 'HERO_ATTACK', heroId: s.heroes[0].id, powerId: strike.id, targets: [{ monsterId: 'm1', roll: 2 }] })
    const next = use(missed, 0, id, { monsterIds: ['m1'] })
    expect(next.heroes[0].hp).toBe(missed.heroes[0].hp - 1)
    expect(next.monsters[0].hp).toBe(2)
  })

  it('Experienced: spend 3 XP, jump to a tile within 2 with 3+ monsters', () => {
    let state = game()
    state = { ...state, xp: 2, monsters: [rat('m1'), rat('m2'), rat('m3')], board: { ...state.board, tokens: { ...state.board.tokens, m2: [2, -2], m3: [3, -3] } } }
    const { state: s, id } = give(state, 0, { use: { xpCost: 3, board: [{ pick: 'self', to: 'crowdedTile', n: 2, min: 3 }] } })
    expect(use(s, 0, id)).toBe(s)
    const next = use({ ...s, xp: 4 }, 0, id)
    expect(next.xp).toBe(1)
    const spots = moveTargets(next, next.heroes[0].id)
    expect(spots).toContain('0,-4')
    expect(spots.every((k) => Number(k.split(',')[1]) < 0)).toBe(true)
  })

  it('Come and Get It: next to the newest monster', () => {
    const state = game()
    const { state: s, id } = give(state, 0, { use: { board: [{ pick: 'self', to: 'nextToNewMonster' }] } })
    const next = use(s, 0, id)
    expect(moveTargets(next, next.heroes[0].id)).toContain('1,-1')
  })
})

describe('fan board tokens', () => {
  it('Boobytraps: a monster moving onto its tile is Trapped and the token goes', () => {
    const { state: s, id } = give(game(), 0, { use: { tokens: { boobytraps: 2 } } }, 'daily')
    let state = use(s, 0, id)
    const item = state.board.items.find((i) => i.kind === 'boobytrap')
    // Two different tiles within 1 tile.
    expect(tokenTargets(state, item)).toContain('2,-1')
    state = place(state, 'boobytrap', [3, -1])
    const other = state.board.items.find((i) => i.kind === 'boobytrap' && !i.at)
    expect(tokenTargets(state, other).some((k) => Number(k.split(',')[1]) < 0)).toBe(false)
    state = place(state, 'boobytrap', [0, 3])
    // The rat moves within its own tile: nothing. Onto the Start tile's half: Trapped.
    state = gameReducer(state, { type: 'MOVE_TOKEN', id: 'm1', to: [2, -2] })
    expect(statusesOf(state.monsters[0])).toEqual([])
    state = gameReducer(state, { type: 'MOVE_TOKEN', id: 'm1', to: [2, 1] })
    expect(statusesOf(state.monsters[0])[0]?.kind).toBe('trapped')
    expect(state.board.items.filter((i) => i.kind === 'boobytrap')).toHaveLength(1)
    expect(state.heroes[0].tokens.boobytraps).toBe(1)
  })

  it('Shadow Seekers: one goes out on entering the shadows, and hurts the monster when it moves', () => {
    let state = game()
    state = { ...state, board: { ...state.board, tokens: { ...state.board.tokens, m1: [2, 0] } } }
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, abilityEffects: ['shadowphage'] } : h)) }
    // Shadow Seekers is a Daily, so it was used on an earlier turn (it took that turn's attack).
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, tokens: { ...h.tokens, seekersLeft: 5 } } : h)) }
    state = gameReducer(state, { type: 'SET_SHADOW', heroId: state.heroes[0].id, on: true })
    expect(state.heroes[0].tokens.seekersLeft).toBe(4)
    const seeker = state.board.items.find((i) => i.kind === 'seeker')
    expect(tokenTargets(state, seeker)).toContain('1,0')
    state = place(state, 'seeker', [1, 0])
    expect(state.board.items.find((i) => i.kind === 'seeker').target).toBe('m1')
    state = gameReducer(state, { type: 'MOVE_TOKEN', id: 'm1', to: [2, -1] })
    expect(state.monsters[0].hp).toBe(2)
    expect(state.board.items.some((i) => i.kind === 'seeker')).toBe(false)
  })

  it('Secret Paths: a hero by one token can use a move to come out at the other', () => {
    const { state: s, id } = give(game(), 0, { use: { tokens: { secretPaths: 2 } } })
    let state = use(s, 0, id)
    state = place(state, 'secret', [0, 3])
    state = place(state, 'secret', [3, -4])
    const hero = state.heroes[0]
    expect(pathKinds(state, hero)).toEqual(['secret'])
    state = gameReducer(state, { type: 'TAKE_PATH', heroId: hero.id, kind: 'secret' })
    expect(moveTargets(state, hero.id)).toEqual(['3,-4'])
    expect(state.turn.boardMoves).toBe(1)
  })

  it('Trapping Attack: traps on the tile hurt the monsters where they go, at the start of the Villain Phase', () => {
    let state = game()
    state = { ...state, board: { ...state.board, tokens: { ...state.board.tokens, m1: [2, 0] } } }
    const grid = boardGrid(state.board)
    const heroTile = grid.get('0,2').area
    const ratTile = grid.get('2,0').area
    const trap = { id: 'tr1', cardId: 'pit', name: 'Pit', type: 'trap', ownerId: state.heroes[1].id, card: {}, tile: heroTile }
    state = { ...state, traps: [trap] }
    const { state: s, id } = give(state, 0, { use: { moveTraps: 2 }, shadow: 'leave' }, 'daily')
    state = use(s, 0, id, { trapIds: ['tr1'] })
    expect(state.traps[0]).toMatchObject({ tile: ratTile, armedBy: state.heroes[0].id })
    state = gameReducer(state, { type: 'NEXT_PHASE' })
    expect(state.monsters[0].hp).toBe(3)
    state = gameReducer(state, { type: 'NEXT_PHASE' })
    expect(state.monsters[0].hp).toBe(2)
    expect(state.traps).toEqual([])
  })

  it('Fleetfooted: takes a trap off the hero\'s tile', () => {
    let state = game()
    const trap = { id: 'tr1', cardId: 'pit', name: 'Pit', type: 'trap', card: {}, tile: boardGrid(state.board).get('0,2').area }
    const { state: s, id } = give({ ...state, traps: [trap] }, 0, { use: { removeTrap: true } })
    expect(use(s, 0, id, { trapIds: ['tr1'] }).traps).toEqual([])
  })
})

describe('Treetop', () => {
  it('a perched hero is out of reach of adjacent attacks, then has Advantage', () => {
    const { state: s, id } = give(game(), 0, { use: { perch: true } })
    let state = use(s, 0, id)
    const hero = state.heroes[0]
    expect(outOfReach(hero, { when: 'adjacent' })).toBe(true)
    expect(outOfReach(hero, { when: 'within1' })).toBe(false)
    expect(state.turn.advantage).toBeUndefined()
    for (let i = 0; i < 12 && !(state.turn.heroIndex === 0 && state.turn.round === 2); i++) state = gameReducer(state, { type: 'NEXT_PHASE' })
    expect(state.turn.round).toBe(2)
    expect(state.turn.advantage).toBe(hero.id)
    expect(state.heroes[0].tokens.treetop).toBe(false)
    // Drops down to any square of the tile.
    expect(state.turn.boardMove?.steps[0]).toMatchObject({ pick: 'self', to: 'ownTile' })
    state = gameReducer(state, { type: 'SKIP_BOARD_MOVE' })
    const strike = give(state, 0, {}, 'at-will', 'Strike')
    state = gameReducer(strike.state, { type: 'SET_POWER_CARD', heroId: hero.id, powerId: strike.id, card: { id: 'Strike', name: 'Strike', attack: '+5', damage: '1' } })
    state = gameReducer(state, { type: 'HERO_ATTACK', heroId: hero.id, powerId: strike.id, targets: [{ monsterId: 'm1', roll: 2, roll2: 18 }] })
    expect(state.turn.lastAttack.rolls[0]).toMatchObject({ value: 18, hit: true })
  })
})

describe('Charm Beast', () => {
  it('discards a drawn monster that is not a beast; a beast attacks the nearest monster', () => {
    let state = game()
    state = { ...state, monsters: [rat('m1'), rat('m2', { name: 'Bear' })], board: { ...state.board, tokens: { ...state.board.tokens, m2: [2, -2] } } }
    const { state: s, id } = give(state, 0, { use: { charm: { types: ['Animal', 'Reptile'] } } })
    const beast = use(s, 0, id, { monsterIds: ['m2'], targetId: 'm1', roll: 15 })
    expect(beast.monsters.find((m) => m.id === 'm1').hp).toBe(1)
    expect(beast.turn.acted).toContain('m2')
    const orc = { ...s, monsters: [rat('m1'), rat('m2', { name: 'Orc', card: { ...rat('m2').card, types: ['Orc'] } })] }
    const gone = use(orc, 0, id, { monsterIds: ['m2'] })
    expect(gone.monsters.map((m) => m.id)).toEqual(['m1'])
  })
})

describe('Lizard & Lace', () => {
  const summon = [
    { name: 'Lace', hp: 2, ac: 11, strong: { name: 'Fang', bonus: 7, damage: 1 }, weak: { name: 'Claw', bonus: 6, damage: 0, status: 'stunned' } },
    { name: 'Lizard', hp: 2, ac: 11, strong: { name: 'Bite', bonus: 5, damage: 2 }, weak: { name: 'Tail', bonus: 6, damage: 2, push: 1 } },
  ]
  it('go on the hero\'s tile, attack a monster within 1 tile, and can be hurt', () => {
    let state = game()
    state = { ...state, board: { ...state.board, tokens: { ...state.board.tokens, m1: [2, 0] } } }
    const { state: s, id } = give(state, 0, { use: { summon } }, 'daily')
    state = use(s, 0, id)
    const pets = petsOf(state, state.heroes[0].id)
    expect(pets.map((p) => p.name)).toEqual(['Lace', 'Lizard'])
    expect(petsDue(state, state.heroes[0])).toBe(true)
    // Lace's Claw stuns the rat; then the Lizard sees a Stunned monster and Bites.
    state = gameReducer(state, { type: 'PETS_ACT', heroId: state.heroes[0].id, rolls: [15, 15] })
    expect(state.monsters[0].hp).toBe(1)
    expect(statusesOf(state.monsters[0])[0]?.kind).toBe('stunned')
    expect(petsDue(state, state.heroes[0])).toBe(false)
    const lace = petsOf(state, state.heroes[0].id)[0]
    state = gameReducer(state, { type: 'PET_HURT', id: lace.id, amount: 2 })
    expect(petsOf(state, state.heroes[0].id).map((p) => p.name)).toEqual(['Lizard'])
  })
})
