import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { createHero, foes, gameReducer, initialState } from './game.js'

const start = () => gameReducer(initialState, { type: 'START_GAME', heroes: HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t)) })

// Made-up villain cards, so the tests don't need the real ones.
const { villains, problems } = normalizeCardFile({
  powers: [],
  villains: [
    {
      id: 'boss', name: 'Big Boss', fullName: 'Grak, Big Boss', level: 5, ac: 12, hp: 4,
      attacks: [{ id: 'axe', name: 'Axe', bonus: 30, damage: 2, effect: 'Push the hero.' }],
      tactics: [{ when: 'adjacent', attack: 'axe', then: 'within1' }, { move: 'toward', toward: 'mostHp' }],
    },
    {
      id: 'drake', name: 'Drake', ac: 10, hp: 2,
      attacks: [{ id: 'bite', name: 'Bite', bonus: 5, damage: 1 }],
      tactics: [{ move: 'toward' }],
      enraged: { ac: 14, hp: 5, attacks: [{ id: 'claws', name: 'Claws', bonus: 9, damage: 2 }], tactics: [{ move: 'toward', tiles: 2 }] },
    },
    {
      id: 'eye', name: 'Eye', ac: 15, hp: 6,
      attacks: [
        { id: 'low', name: 'Low Ray', group: 'ray', roll: [1, 10], bonus: 30, damage: 1, conditions: ['Dazed'] },
        { id: 'high', name: 'High Ray', group: 'ray', roll: [11, 20], bonus: 30, damage: 2, conditions: ['Poisoned'] },
      ],
      tactics: [{ when: 'within3', attack: 'ray', target: 'mostHp' }, { move: 'toward' }],
    },
  ],
})

const place = (state, name) => gameReducer(state, { type: 'PLACE_VILLAIN', name, cards: villains })
const hit = (state, villain, roll = 20) =>
  gameReducer(
    { ...state, heroes: state.heroes.map((h, i) => (i === 0 ? { ...h, powers: h.powers.map((p, j) => (j === 0 ? { ...p, card: { attack: '+30', damage: '3' } } : p)) } : h)) },
    { type: 'HERO_ATTACK', heroId: state.heroes[0].id, powerId: state.heroes[0].powers[0].id, targets: [{ monsterId: villain.id, roll }] },
  )

describe('villains', () => {
  it('reads villain cards, with the enraged side and attack tables', () => {
    expect(problems).toEqual([])
    expect(villains.map((v) => v.id)).toEqual(['boss', 'drake', 'eye'])
    expect(villains[1].enraged).toMatchObject({ name: 'Enraged Drake', ac: 14, hp: 5 })
    expect(villains[2].attacks[0]).toMatchObject({ group: 'ray', roll: [1, 10] })
    expect(villains[0].tactics[0]).toMatchObject({ then: 'within1' })
  })

  it('is placed by name, once, and shows up as something heroes can attack', () => {
    let state = place(start(), 'big boss')
    expect(state.villains).toHaveLength(1)
    expect(state.villains[0]).toMatchObject({ name: 'Big Boss', fullName: 'Grak, Big Boss', hp: 4, ac: 12, defeated: false })
    expect(place(state, 'Big Boss').villains).toHaveLength(1)
    expect(foes(state).map((m) => m.name)).toEqual(['Big Boss'])
    expect(place(state, 'Nobody').villains).toHaveLength(1)
  })

  it('stays in the villain list when defeated, with no XP and no treasure', () => {
    let state = place(start(), 'boss')
    state = hit(state, state.villains[0])
    expect(state.villains[0]).toMatchObject({ hp: 1 })
    state = hit(state, state.villains[0])
    expect(state.villains[0]).toMatchObject({ hp: 0, defeated: true })
    expect(state.xp).toBe(0)
    expect(state.turn.treasureDrawn).toBeFalsy()
    expect(foes(state)).toHaveLength(0)
    // A defeated villain can be placed again later, as a new one.
    expect(place(state, 'boss').villains).toHaveLength(2)
  })

  it('flips to its enraged side the first time it drops to 0 HP', () => {
    let state = place(start(), 'drake')
    state = hit(state, state.villains[0])
    expect(state.villains[0]).toMatchObject({ enraged: true, hp: 5, maxHp: 5, ac: 14, defeated: false })
    expect(state.villains[0].card.attacks[0].name).toBe('Claws')
    state = gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: state.villains[0].id })
    expect(state.villains[0]).toMatchObject({ defeated: true })
  })

  it('attacks heroes, picking from an attack table with its own roll', () => {
    let state = place(start(), 'eye')
    const villain = state.villains[0]
    const heroId = state.heroes[1].id
    state = gameReducer(state, { type: 'MONSTER_ATTACK', monsterId: villain.id, attackId: 'ray', tableRoll: 15, targets: [{ heroId, roll: 10 }] })
    const hero = state.heroes[1]
    expect(hero.hp).toBe(hero.maxHp - 2)
    expect(hero.conditions).toContain('Poisoned')
    expect(state.turn.lastMonsterAttack).toMatchObject({ attackId: 'high', tableRoll: 15 })
  })

  it('can be taken off the board when placed by mistake', () => {
    let state = place(start(), 'boss')
    state = gameReducer(state, { type: 'REMOVE_VILLAIN', villainId: state.villains[0].id })
    expect(state.villains).toEqual([])
  })
})

describe('Adventure 1 with a villain', () => {
  const { adventures } = normalizeCardFile({
    powers: [],
    adventures: [
      {
        id: 'escape', title: 'Escape', goal: 'Beat the boss and get out.', needs: ['villains'],
        reveals: [{ tile: 'Exit', story: 'The boss!', actions: [{ type: 'placeVillain', name: 'Big Boss' }] }],
        win: { villains: ['Big Boss'], escape: true },
      },
    ],
  })
  const game = () => {
    let state = gameReducer(initialState, { type: 'CHOOSE_ADVENTURE', adventure: adventures[0] })
    state = gameReducer(state, { type: 'START_GAME', heroes: HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t)) })
    return gameReducer(state, { type: 'ADVENTURE_REVEAL', tile: 'Exit', cards: [], villains, random: [] })
  }

  it('places the villain on the reveal, and only lets the heroes escape once it is defeated', () => {
    let state = game()
    expect(state.villains.map((v) => v.name)).toEqual(['Big Boss'])
    expect(gameReducer(state, { type: 'ADVENTURE_ESCAPED', escaped: true }).adventure.escaped).toBe(false)
    state = gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: state.villains[0].id })
    state = gameReducer(state, { type: 'ADVENTURE_ESCAPED', escaped: true })
    expect(state.adventure.escaped).toBe(true)
    expect(state.status).toBe('won')
  })
})
