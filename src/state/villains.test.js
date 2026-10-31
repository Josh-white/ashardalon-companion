import { describe, expect, it } from 'vitest'
import { narrationFor } from '../audio/narration.js'
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

  it('stays in the villain list when defeated, worth XP equal to its level (official FAQ), with no treasure', () => {
    let state = place(start(), 'boss')
    state = hit(state, state.villains[0])
    expect(state.villains[0]).toMatchObject({ hp: 1 })
    state = hit(state, state.villains[0])
    expect(state.villains[0]).toMatchObject({ hp: 0, defeated: true })
    expect(state.xp).toBe(5)
    expect(state.turn.treasureDrawn).toBeFalsy()
    expect(foes(state)).toHaveLength(0)
    // A defeated villain can be placed again later, as a new one.
    expect(place(state, 'boss').villains).toHaveLength(2)
  })

  it("speaks when it flips and when it falls to a hero's attack, though the attack takes the screen", () => {
    const said = (before, after) => narrationFor(before, after, after.moment.at).map((l) => l.text)
    let state = place(start(), 'drake')
    const flipped = hit(state, state.villains[0])
    expect(flipped.moment.title).not.toMatch(/enraged/)
    expect(said(state, flipped)).toContain('[shouting] Enough! Now you will see my true power!')
    state = hit(flipped, flipped.villains[0])
    const beaten = hit(state, state.villains[0])
    expect(beaten.villains[0].defeated).toBe(true)
    const lines = said(state, beaten)
    expect(lines).toContain('[gasping, defeated] This… cannot be…')
    expect(lines.filter((t) => /cannot be/.test(t))).toHaveLength(1)
    // Placing it from the villain button says it once, not twice.
    const placed = place(start(), 'boss')
    expect(said(start(), placed).filter((t) => /my domain/.test(t))).toHaveLength(1)
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

describe('Ashardalon Breathes!', () => {
  const file = normalizeCardFile({
    powers: [],
    villains: [
      { id: 'ashardalon', name: 'Ashardalon', ac: 16, hp: 12, addEncounter: 'breathes', attacks: [{ id: 'bite', name: 'Bite', bonus: 10, damage: 1 }], tactics: [{ move: 'toward' }] },
    ],
    encounters: [
      { id: 'quiet', name: 'Quiet', type: 'event', copies: 6 },
      { id: 'breathes', name: 'Ashardalon Breathes!', type: 'event', adventure: true, noCancel: true, villain: 'ashardalon', returnToTop: 3, attack: { bonus: 9, damage: 3, miss: 1, targets: 'villainWithin1' } },
    ],
  })
  const drawCard = (state) => gameReducer(state, { type: 'DRAW_ENCOUNTER', heroId: state.heroes[0].id, cards: file.encounters, random: [] })

  it('stays out of the deck until Ashardalon arrives, then comes up within the next 4 draws', () => {
    expect(file.problems).toEqual([])
    let state = drawCard(start())
    expect(state.encounterDeck.draw).not.toContain('breathes')
    state = gameReducer(state, { type: 'RESOLVE_ENCOUNTER', random: [] })
    state = gameReducer(state, { type: 'PLACE_VILLAIN', name: 'Ashardalon', cards: file.villains })
    state = drawCard(state)
    expect(state.encounter.card.id).toBe('breathes')
    // It can't be canceled, attacks, then goes back into the top of the deck.
    expect(gameReducer({ ...state, xp: 10 }, { type: 'CANCEL_ENCOUNTER' }).encounter).not.toBeNull()
    state = gameReducer(state, { type: 'ENCOUNTER_ATTACK', targets: [{ heroId: state.heroes[1].id, roll: 1 }] })
    expect(state.heroes[1].hp).toBe(state.heroes[1].maxHp - 1)
    state = gameReducer(state, { type: 'RESOLVE_ENCOUNTER', random: [0.99] })
    expect(state.encounterDeck.draw.slice(0, 4)).toContain('breathes')
  })

  it('is discarded when Ashardalon is gone', () => {
    let state = gameReducer(start(), { type: 'PLACE_VILLAIN', name: 'Ashardalon', cards: file.villains })
    state = gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: state.villains[0].id })
    state = drawCard(state)
    expect(state.encounter.card.id).toBe('breathes')
    state = gameReducer(state, { type: 'RESOLVE_ENCOUNTER', random: [] })
    expect(state.encounterDeck.discard).toContain('breathes')
  })
})
