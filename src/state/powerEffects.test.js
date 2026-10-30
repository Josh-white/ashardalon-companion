import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { effectsOf, heroAc, maxRolls, POWER_EFFECT_NAMES } from '../data/powerEffects.js'
import { attackGone, canSpendAttack, createHero, gameReducer, initialState } from './game.js'
import { heroStats } from './stats.js'

// Quinn, Vistra, Keyleth, Tarak, Heskan, in turn order.
const start = () =>
  gameReducer(initialState, { type: 'START_GAME', heroes: HERO_TEMPLATES.map((t) => createHero(t)) })

// Made-up monster cards, so the tests don't need the real ones.
const ogre = {
  id: 'ogre', name: 'Ogre', copies: 1, ac: 10, hp: 3, xp: 2,
  attacks: [{ id: 'club', name: 'Club', bonus: 5, damage: 2, miss: 1, conditions: ['Dazed'] }],
  tactics: [{ move: 'toward' }],
}
const imp = { ...ogre, id: 'imp', name: 'Imp', hp: 1, xp: 1 }

const heroAt = (state, i) => state.heroes[i]
const slot = (state, i, type) => heroAt(state, i).powers.find((p) => p.type === type)

// Gives hero i a card in its first slot of that type.
function give(state, i, card, type = 'at-will') {
  const hero = heroAt(state, i)
  return gameReducer(state, { type: 'SET_POWER_CARD', heroId: hero.id, powerId: slot(state, i, type).id, card: { id: card.name, ...card } })
}

function withMonsters(state, cards = [ogre, imp], owner = 1) {
  for (let n = 0; n < cards.length; n++) {
    state = gameReducer(state, { type: 'DRAW_MONSTER', heroId: heroAt(state, owner).id, cards, random: [] })
  }
  return state
}

const attack = (state, i, type, rolls, extra = {}) =>
  gameReducer(state, {
    type: 'HERO_ATTACK',
    heroId: heroAt(state, i).id,
    powerId: slot(state, i, type).id,
    targets: rolls.map(([monster, roll]) => ({ monsterId: monster.id, roll })),
    ...extra,
  })

const hurt = (state, i, amount) => gameReducer(state, { type: 'ADJUST_HP', heroId: heroAt(state, i).id, amount: -amount })

describe('power effects data', () => {
  it('knows Arcing Smite by its old name too', () => {
    expect(effectsOf({ name: 'Arcing Strike' })).toEqual(effectsOf({ name: 'Arcing Smite' }))
    expect(effectsOf({ card: { name: "virtue's touch" } }).use.endCondition).toBe(true)
  })

  it('limits rolls for known powers and leaves unknown cards alone', () => {
    expect(maxRolls({ name: 'Sure Strike' })).toBe(1)
    expect(maxRolls({ name: 'Tornado Strike' })).toBe(4)
    expect(maxRolls({ name: 'Shock Sphere' })).toBe(Infinity)
    expect(maxRolls({ name: 'Homebrew Blast' })).toBe(Infinity)
  })

  it('covers all 50 powers from the box', () => {
    expect(POWER_EFFECT_NAMES).toHaveLength(50)
  })
})

describe('healing powers', () => {
  it('Healing Hymn heals Quinn and one other hero 2 HP each', () => {
    let state = hurt(hurt(start(), 0, 3), 1, 3)
    state = give(state, 0, { name: 'Healing Hymn' }, 'utility')
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroAt(state, 0).id, powerId: slot(state, 0, 'utility').id, heroIds: [heroAt(state, 1).id] })
    expect(heroAt(state, 0).hp).toBe(7)
    expect(heroAt(state, 1).hp).toBe(7)
    expect(slot(state, 0, 'utility').used).toBe(true)
  })

  it('Lay on Hands needs another hero', () => {
    let state = give(hurt(start(), 0, 4), 2, { name: 'Lay On Hands' }, 'utility')
    const use = (heroId) => gameReducer(state, { type: 'USE_POWER', heroId: heroAt(state, 2).id, powerId: slot(state, 2, 'utility').id, heroIds: [heroId] })
    expect(use(heroAt(state, 2).id)).toBe(state)
    expect(heroAt(use(heroAt(state, 0).id), 0).hp).toBe(6)
  })

  it('Sacred Flame lets Quinn give 1 HP after a hit', () => {
    let state = withMonsters(give(hurt(start(), 3, 2), 0, { name: 'Sacred Flame', attack: '+6', damage: '1' }))
    const missed = attack(state, 0, 'at-will', [[state.monsters[0], 2]])
    const follow = (s) => gameReducer(s, { type: 'ATTACK_FOLLOW_UP', heroId: heroAt(s, 0).id, powerId: slot(s, 0, 'at-will').id, heroIds: [heroAt(s, 3).id] })
    expect(heroAt(follow(missed), 3).hp).toBe(6)
    state = follow(attack(state, 0, 'at-will', [[state.monsters[0], 10]]))
    expect(heroAt(state, 3).hp).toBe(7)
    // Only once per attack.
    expect(follow(state)).toBe(state)
  })

  it('Righteous Smite heals every hero on the tile, hit or miss', () => {
    let state = withMonsters(give(hurt(hurt(start(), 0, 2), 2, 2), 2, { name: 'Righteous Smite', attack: '+5', damage: '3 (Miss: 1)' }, 'daily'))
    state = attack(state, 2, 'daily', [[state.monsters[0], 1]])
    expect(state.monsters[0].hp).toBe(2)
    state = gameReducer(state, { type: 'ATTACK_FOLLOW_UP', heroId: heroAt(state, 2).id, powerId: slot(state, 2, 'daily').id, heroIds: [heroAt(state, 0).id, heroAt(state, 2).id] })
    expect(heroAt(state, 0).hp).toBe(7)
    expect(heroAt(state, 2).hp).toBe(7)
  })

  it("Comeback Strike heals on a hit and isn't used up on a miss", () => {
    let state = withMonsters(give(hurt(start(), 1, 4), 1, { name: 'Comeback Strike', attack: '+7', damage: '2' }, 'daily'), [ogre], 2)
    const missed = attack(state, 1, 'daily', [[state.monsters[0], 1]])
    expect(slot(missed, 1, 'daily').used).toBe(false)
    state = attack(state, 1, 'daily', [[state.monsters[0], 10]])
    expect(slot(state, 1, 'daily').used).toBe(true)
    expect(heroAt(state, 1).hp).toBe(6)
  })

  it('Dwarven Resilience heals Vistra 4', () => {
    let state = give(hurt(start(), 1, 5), 1, { name: 'Dwarven Resilience' }, 'daily')
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroAt(state, 1).id, powerId: slot(state, 1, 'daily').id })
    expect(heroAt(state, 1).hp).toBe(7)
  })

  it("Virtue's Touch ends a condition on another hero", () => {
    let state = start()
    state = { ...state, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, conditions: ['Poisoned'] } : h)) }
    state = give(state, 2, { name: "Virtue's Touch" }, 'utility')
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroAt(state, 2).id, powerId: slot(state, 2, 'utility').id, heroIds: [heroAt(state, 0).id], condition: 'Poisoned' })
    expect(heroAt(state, 0).conditions).toEqual([])
  })
})

describe('attack modifiers', () => {
  it('Reaping Strike rolls twice at one monster', () => {
    let state = withMonsters(give(start(), 1, { name: 'Reaping Strike', attack: '+4', damage: '1' }), [ogre], 2)
    const ogreInPlay = state.monsters[0]
    state = attack(state, 1, 'at-will', [[ogreInPlay, 10], [ogreInPlay, 10], [ogreInPlay, 10]])
    expect(state.monsters[0].hp).toBe(1)
  })

  it('a plain power hits only one monster', () => {
    let state = withMonsters(give(start(), 1, { name: 'Sure Strike', attack: '+11', damage: '1' }))
    state = attack(state, 1, 'at-will', [[state.monsters[0], 10], [state.monsters[1], 10]])
    expect(state.monsters).toHaveLength(2)
    expect(state.monsters[0].hp).toBe(2)
  })

  it('Lucky Strike adds 1 damage on an even die', () => {
    const state = withMonsters(give(start(), 3, { name: 'Lucky Strike', attack: '+7', damage: '1' }), [ogre])
    expect(attack(state, 3, 'at-will', [[state.monsters[0], 9]]).monsters[0].hp).toBe(2)
    expect(attack(state, 3, 'at-will', [[state.monsters[0], 10]]).monsters[0].hp).toBe(1)
  })

  it('Holy Strike and Valiant Strike use the answers to their questions', () => {
    let state = withMonsters(give(start(), 2, { name: 'Holy Strike', attack: '+8', damage: '1' }), [ogre])
    expect(attack(state, 2, 'at-will', [[state.monsters[0], 5]], { startedAdjacent: true }).monsters[0].hp).toBe(1)
    state = withMonsters(give(start(), 2, { name: 'Valiant Strike', attack: '+1', damage: '1' }), [ogre])
    // 5 + 1 + 3 monsters adjacent = 9: still a miss against AC 10. With 4 adjacent, a hit.
    expect(attack(state, 2, 'at-will', [[state.monsters[0], 5]], { adjacentCount: 3 }).monsters[0].hp).toBe(3)
    expect(attack(state, 2, 'at-will', [[state.monsters[0], 5]], { adjacentCount: 4 }).monsters[0].hp).toBe(2)
  })

  it('Inspiring Advice rerolls a miss and is only used up on a hit', () => {
    let state = withMonsters(give(give(start(), 2, { name: 'Holy Strike', attack: '+8', damage: '2 (Miss: 1)' }), 1, { name: 'Inspiring Advice' }, 'utility'), [ogre])
    state = attack(state, 2, 'at-will', [[state.monsters[0], 1]])
    expect(state.monsters[0].hp).toBe(2)
    const reroll = (s, roll) => gameReducer(s, { type: 'REROLL_ATTACK', helperId: heroAt(s, 1).id, helperPowerId: slot(s, 1, 'utility').id, monsterId: s.monsters[0].id, roll })
    const again = reroll(state, 1)
    expect(slot(again, 1, 'utility').used).toBe(false)
    expect(again.monsters[0].hp).toBe(2)
    state = reroll(state, 5)
    expect(slot(state, 1, 'utility').used).toBe(true)
    expect(state.monsters[0].hp).toBe(1) // the miss damage came back, then 2 damage
  })

  it('Furious Assault adds 1 damage to a monster Tarak just hit', () => {
    let state = withMonsters(give(give(start(), 3, { name: 'Lucky Strike', attack: '+7', damage: '1' }), 3, { name: 'Furious Assault' }, 'utility'), [ogre])
    state = attack(state, 3, 'at-will', [[state.monsters[0], 9]])
    state = gameReducer(state, { type: 'POWER_DAMAGE', source: 'furious', heroId: heroAt(state, 3).id, powerId: slot(state, 3, 'utility').id, monsterIds: [state.monsters[0].id] })
    expect(state.monsters[0].hp).toBe(1)
    expect(slot(state, 3, 'utility').used).toBe(true)
  })

  it("Cause Fear gives allies an at-will attack at +2", () => {
    let state = withMonsters(give(give(start(), 0, { name: 'Cause Fear' }, 'daily'), 1, { name: 'Sure Strike', attack: '+1', damage: '1' }), [ogre])
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroAt(state, 0).id, powerId: slot(state, 0, 'daily').id, heroIds: [heroAt(state, 1).id] })
    expect(state.turn.bonusAttacks).toEqual([{ heroId: heroAt(state, 1).id, bonus: 2, source: 'Cause Fear' }])
    // 7 + 1 + 2 = 10 hits AC 10.
    state = attack(state, 1, 'at-will', [[state.monsters[0], 7]], { bonusAttack: true })
    expect(state.monsters[0].hp).toBe(2)
    expect(state.turn.bonusAttacks).toEqual([])
  })

  it('Wrathful Thunder passes a monster to the player on the right', () => {
    let state = withMonsters(give(start(), 0, { name: 'Wrathful Thunder', attack: '+6', damage: '3 (Miss: 1)' }, 'daily'), [ogre], 0)
    state = attack(state, 0, 'daily', [[state.monsters[0], 1]])
    state = gameReducer(state, { type: 'ATTACK_FOLLOW_UP', heroId: heroAt(state, 0).id, powerId: slot(state, 0, 'daily').id, monsterId: state.monsters[0].id })
    expect(state.monsters[0].ownerId).toBe(heroAt(state, 4).id)
  })
})

describe('defense powers', () => {
  const monsterAttack = (state, heroIndexes, roll, extra = {}) =>
    gameReducer(state, {
      type: 'MONSTER_ATTACK',
      monsterId: state.monsters[0].id,
      attackId: 'club',
      targets: heroIndexes.map((i) => ({ heroId: heroAt(state, i).id, roll })),
      ...extra,
    })

  it("Cleric's Shield gives one hero +2 AC until Quinn uses it again", () => {
    let state = withMonsters(give(start(), 0, { name: "Cleric's Shield", attack: '+6', damage: '1' }), [ogre])
    const shield = (s, i) => gameReducer(attack(s, 0, 'at-will', [[s.monsters[0], 1]]), { type: 'ATTACK_FOLLOW_UP', heroId: heroAt(s, 0).id, powerId: slot(s, 0, 'at-will').id, heroIds: [heroAt(s, i).id] })
    state = shield(state, 3)
    expect(heroAc(heroAt(state, 3))).toBe(16)
    // 10 + 5 = 15 misses Tarak's shielded AC 16.
    expect(heroAt(monsterAttack(state, [3], 10), 3).hp).toBe(7)
    state = shield(state, 1)
    expect(heroAc(heroAt(state, 3))).toBe(14)
    expect(heroAc(heroAt(state, 1))).toBe(19)
  })

  it('Mirror Image adds 2 AC per image and loses one on each miss', () => {
    let state = withMonsters(give(start(), 4, { name: 'Mirror Image' }, 'utility'), [ogre])
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroAt(state, 4).id, powerId: slot(state, 4, 'utility').id })
    expect(heroAc(heroAt(state, 4))).toBe(20)
    state = monsterAttack(state, [4], 10)
    expect(heroAt(state, 4).tokens.mirrorImage).toBe(2)
  })

  it('Tumbling Escape turns a hit into a miss', () => {
    let state = withMonsters(give(start(), 3, { name: 'Tumbling Escape' }, 'utility'), [ogre])
    state = monsterAttack(state, [3], 15)
    expect(heroAt(state, 3)).toMatchObject({ hp: 6, conditions: ['Dazed'] })
    state = gameReducer(state, { type: 'DODGE_HIT', heroId: heroAt(state, 3).id, powerId: slot(state, 3, 'utility').id })
    expect(heroAt(state, 3)).toMatchObject({ hp: 7, conditions: [] }) // the miss damage still lands
    expect(heroStats(state, heroAt(state, 3).id).damageTaken).toBe(1) // and only it counts for the recap
  })

  it('Noble Shield makes Keyleth the only target, at a roll of 20', () => {
    let state = withMonsters(give(start(), 2, { name: 'Noble Shield' }, 'utility'), [ogre])
    state = monsterAttack(state, [0, 2], 1, { nobleShield: { heroId: heroAt(state, 2).id, powerId: slot(state, 2, 'utility').id } })
    expect(heroAt(state, 0).hp).toBe(8)
    expect(heroAt(state, 2).hp).toBe(6)
    expect(slot(state, 2, 'utility').used).toBe(true)
  })

  it('Perseverance makes cancelling an encounter cheaper', () => {
    let state = { ...give(start(), 0, { name: 'Perseverance' }, 'utility'), xp: 2 }
    state = gameReducer(state, { type: 'CANCEL_ENCOUNTER', perseverance: { heroId: heroAt(state, 0).id, powerId: slot(state, 0, 'utility').id, heroesOnTile: 3 } })
    expect(state.xp).toBe(0)
    expect(slot(state, 0, 'utility').used).toBe(true)
  })
})

describe('token powers', () => {
  it('the Flaming Sphere burns monsters on its tile once per turn', () => {
    let state = withMonsters(give(start(), 4, { name: 'Flaming Sphere' }, 'daily'))
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroAt(state, 4).id, powerId: slot(state, 4, 'daily').id })
    const burn = (s) => gameReducer(s, { type: 'POWER_DAMAGE', source: 'flamingSphere', heroId: heroAt(s, 4).id, monsterIds: s.monsters.map((m) => m.id) })
    state = burn(state)
    expect(state.monsters.map((m) => m.name)).toEqual(['Ogre'])
    expect(state.xp).toBe(1)
    expect(heroAt(state, 4).tokens.flamingSphere).toBe(2)
    expect(burn(state)).toBe(state)
  })

  it('Invisibility and the Astral Refuge end at the start of the next turn', () => {
    let state = give(give(start(), 4, { name: 'Invisibility' }, 'utility'), 0, { name: 'Astral Refuge' }, 'utility')
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroAt(state, 4).id, powerId: slot(state, 4, 'utility').id })
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroAt(state, 0).id, powerId: slot(state, 0, 'utility').id, heroIds: [heroAt(state, 1).id] })
    expect(heroAt(state, 4).tokens.invisible).toBe(true)
    expect(heroAt(state, 1).tokens.refuge).toBe(true)
    for (let i = 0; i < 3; i++) state = gameReducer(state, { type: 'NEXT_PHASE' })
    expect(heroAt(state, 1).tokens.refuge).toBe(false)
    expect(state.moment.title).toMatch(/Vistra returns/)
  })
})

describe('Hypnotism', () => {
  it('attacks the monster next to the moved one, never the moved one', () => {
    let state = withMonsters(give(start(), 4, { name: 'Hypnotism', attack: '+9', damage: '1' }))
    const [moved, other] = state.monsters
    const hit = (target) => attack(state, 4, 'at-will', [[target, 10]], { movedId: moved.id })
    expect(hit(moved)).toBe(state)
    expect(hit(other).monsters.map((m) => m.name)).toEqual(['Ogre'])
  })
})

describe('hero card abilities', () => {
  const withCondition = (state, i, condition) => ({
    ...state,
    heroes: state.heroes.map((h, n) => (n === i ? { ...h, conditions: [condition] } : h)),
  })

  it("Vistra's Cast-Iron Stomach adds 5 to the poison roll", () => {
    const poisoned = (i) => ({ ...withCondition(start(), i, 'Poisoned'), turn: { heroIndex: i, phase: 0, round: 1 } })
    expect(heroAt(gameReducer(poisoned(1), { type: 'NEXT_PHASE', roll: 6 }), 1).conditions).toEqual([])
    expect(heroAt(gameReducer(poisoned(0), { type: 'NEXT_PHASE', roll: 6 }), 0).conditions).toEqual(['Poisoned'])
  })

  it("Quinn's Saving Grace lets a healed hero end a condition", () => {
    let state = give(withCondition(hurt(start(), 1, 3), 1, 'Dazed'), 2, { name: 'Lay On Hands' }, 'utility')
    const grace = (s) => gameReducer(s, { type: 'SAVING_GRACE', heroId: heroAt(s, 1).id, condition: 'Dazed' })
    expect(grace(state)).toBe(state)
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroAt(state, 2).id, powerId: slot(state, 2, 'utility').id, heroIds: [heroAt(state, 1).id] })
    state = grace(state)
    expect(heroAt(state, 1).conditions).toEqual([])
    expect(state.turn.abilityOffers.savingGrace).toEqual([])
  })

  it("Keyleth's Healing Hands adds 1 HP to a healing surge", () => {
    const down = (s, i) => ({ ...s, heroes: s.heroes.map((h, n) => (n === i ? { ...h, hp: 0 } : h)) })
    let state = down(start(), 2)
    state = gameReducer(state, { type: 'USE_SURGE', heroId: heroAt(state, 2).id })
    expect(heroAt(state, 2).hp).toBe(5)
    state = gameReducer(down(state, 0), { type: 'USE_SURGE', heroId: heroAt(state, 0).id })
    expect(heroAt(state, 0).hp).toBe(4)
    state = gameReducer(state, { type: 'HEALING_HANDS', heroId: heroAt(state, 0).id })
    expect(heroAt(state, 0).hp).toBe(5)
    expect(gameReducer(state, { type: 'HEALING_HANDS', heroId: heroAt(state, 0).id })).toBe(state)
  })

  it("Tarak's Brutal Recovery flips Furious Assault back after a natural 20", () => {
    let state = withMonsters(give(give(start(), 3, { name: 'Lucky Strike', attack: '+7', damage: '1' }), 3, { name: 'Furious Assault' }, 'utility'), [ogre])
    state = give(state, 0, { name: 'Sacred Flame', attack: '+6', damage: '1' })
    state = gameReducer(state, { type: 'TOGGLE_POWER', heroId: heroAt(state, 3).id, powerId: slot(state, 3, 'utility').id })
    expect(gameReducer(attack(state, 0, 'at-will', [[state.monsters[0], 19]]), { type: 'BRUTAL_RECOVERY' }).heroes[3]).toEqual(heroAt(state, 3))
    state = gameReducer(attack(state, 0, 'at-will', [[state.monsters[0], 20]]), { type: 'BRUTAL_RECOVERY' })
    expect(slot(state, 3, 'utility').used).toBe(false)
  })

  it("Hurled Breath doesn't use up Heskan's attack", () => {
    let state = withMonsters({ ...start(), turn: { heroIndex: 4, phase: 0, round: 1 } }, [ogre])
    state = give(state, 4, { name: 'Hurled Breath', attack: '+5', damage: '1' }, 'daily')
    state = attack(state, 4, 'daily', [[state.monsters[0], 2]])
    expect(state.turn.lastAttack.free).toBe(true)
    expect(canSpendAttack(state, heroAt(state, 4))).toBe(true)
  })
})

describe("the hero's one attack each Hero Phase", () => {
  const quinnsTurn = () => withMonsters({ ...start(), turn: { heroIndex: 0, phase: 0, round: 1 } }, [ogre])

  it('is gone after an attack, and only for the hero whose turn it is', () => {
    let state = give(quinnsTurn(), 0, { name: 'Sure Strike', attack: '+1', damage: '1' })
    expect(attackGone(state, heroAt(state, 0))).toBeNull()
    state = attack(state, 0, 'at-will', [[state.monsters[0], 2]])
    expect(attackGone(state, heroAt(state, 0))).toBe('Quinn already attacked this turn.')
    expect(attackGone(state, heroAt(state, 1))).toBeNull()
  })

  it('is used up by a Daily power without a roll, like Cause Fear', () => {
    let state = give(quinnsTurn(), 0, { name: 'Cause Fear' }, 'daily')
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroAt(state, 0).id, powerId: slot(state, 0, 'daily').id, heroIds: [] })
    expect(state.turn.attackSpent).toEqual({ heroId: heroAt(state, 0).id, on: 'Cause Fear' })
    expect(attackGone(state, heroAt(state, 0))).toBe("Quinn used this turn's attack on Cause Fear.")
    expect(canSpendAttack(state, heroAt(state, 0))).toBe(false)
  })

  it("isn't used up by a utility power, or by a power used outside the hero's own Hero Phase", () => {
    let state = give(quinnsTurn(), 0, { name: 'Healing Hymn' }, 'utility')
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroAt(state, 0).id, powerId: slot(state, 0, 'utility').id, heroIds: [] })
    expect(attackGone(state, heroAt(state, 0))).toBeNull()
    state = give(state, 1, { name: 'Blade Barrier' }, 'daily')
    state = gameReducer(state, { type: 'USE_POWER', heroId: heroAt(state, 1).id, powerId: slot(state, 1, 'daily').id })
    expect(state.turn.attackSpent).toBeUndefined()
  })

  it('is gone after two moves on the virtual board, or one when Dazed', () => {
    let state = { ...quinnsTurn(), board: { tiles: [], tokens: {} } }
    state = { ...state, turn: { ...state.turn, boardMoves: 1 } }
    expect(attackGone(state, heroAt(state, 0))).toBeNull()
    expect(attackGone(state, { ...heroAt(state, 0), conditions: ['Dazed'] })).toMatch(/Dazed and already moved/)
    state = { ...state, turn: { ...state.turn, boardMoves: 2 } }
    expect(attackGone(state, heroAt(state, 0))).toBe("Quinn moved twice, so there's no attack this turn.")
  })
})
