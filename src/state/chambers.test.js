import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { goalParts } from './adventure.js'
import { createHero, foes, gameReducer, initialState } from './game.js'

// Made-up chamber cards, monsters and villains in the card file's shape, so the tests don't need the real cards.
const { adventures, chambers, monsters, villains, problems } = normalizeCardFile({
  powers: [],
  monsters: [
    { id: 'rat', name: 'Rat', copies: 3, ac: 12, hp: 1, xp: 1, types: ['Animal'], attacks: [{ id: 'bite', name: 'Bite', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] },
    { id: 'ooze', name: 'Ooze', copies: 3, ac: 10, hp: 2, xp: 2, types: ['Aberrant'], attacks: [{ id: 'slap', name: 'Slap', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] },
  ],
  villains: [{ id: 'boss', name: 'Big Boss', ac: 12, hp: 4, attacks: [{ id: 'axe', name: 'Axe', bonus: 5, damage: 2 }], tactics: [{ move: 'toward' }] }],
  chambers: [
    { id: 'regiment', name: 'Regiment', setup: ['Fill it.'], goal: 'Destroy all of the Monsters in this chamber!', monsters: { redrawXp: [1] }, win: { chamberMonsters: true } },
    { id: 'lair', name: 'Lair', goal: 'Destroy the Big Boss!', villain: 'Big Boss', monsters: { types: ['Aberrant'] }, win: { villain: true } },
    { id: 'altar', name: 'Altar Room', goal: 'Destroy the Altar!', objective: { name: 'Altar', hp: 2, ac: 5 }, win: { objective: true } },
    { id: 'prison', name: 'Prison', goal: 'Later.', win: { chamberMonsters: true }, needs: ['villagers'] },
  ],
  adventures: [
    {
      id: 'tunnel', title: 'Tunnel', goal: 'Clear the chamber and escape.',
      reveals: [{ tile: 'Horrid Chamber Entrance', story: 'Guards!', steps: ['Place the chamber tiles.'], actions: [{ type: 'chamber', name: 'Regiment' }] }],
      win: { chamber: true, escape: true },
    },
    {
      id: 'mystery', title: 'Mystery', goal: 'Do what the chamber card says.',
      reveals: [{ tile: 'Dire Chamber Entrance', actions: [{ type: 'chamber' }] }],
      win: { chamber: true },
    },
    {
      id: 'doors', title: 'Doors', goal: 'Open the secret door.', needs: ['doors'],
      reveals: [
        { tile: 'Entrance', actions: [] },
        { tile: 'Secret door', door: true, after: 'Entrance', story: 'Eyes!', actions: [{ type: 'chamber', name: 'Lair' }] },
      ],
      win: { chamber: true },
    },
  ],
})

const start = (adventure) => {
  let state = gameReducer({ ...initialState }, { type: 'CHOOSE_ADVENTURE', adventure })
  return gameReducer(state, { type: 'START_GAME', heroes: HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t)) })
}
const reveal = (state, tile, random = []) => gameReducer(state, { type: 'ADVENTURE_REVEAL', tile, cards: monsters, villains, chambers, random })
const defeat = (state, monster) => gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: monster.id })

describe('chambers', () => {
  it('reads chamber cards from the card file', () => {
    expect(problems).toEqual([])
    expect(chambers.map((c) => c.id)).toEqual(['regiment', 'lair', 'altar', 'prison'])
    expect(chambers[0].monsters).toEqual({ perPlayer: 1, types: [], redrawXp: [1] })
  })

  it("isn't won before the chamber turns up", () => {
    const state = start(adventures[0])
    expect(goalParts(state)[0]).toMatchObject({ key: 'chamber', done: false })
  })

  it('fills the named chamber with one monster per player, redrawing misfits once, then wins', () => {
    let state = start(adventures[0])
    state = reveal(state, 'Horrid Chamber Entrance')
    expect(state.adventure.chamber.card.id).toBe('regiment')
    // Rats are worth 1 XP, so a Rat is discarded once and the next card kept, whatever it is.
    const inChamber = state.monsters.filter((m) => m.chamber)
    expect(inChamber.map((m) => m.name)).toEqual(['Rat', 'Ooze'])
    expect(inChamber.map((m) => m.ownerId)).toEqual(state.heroes.map((h) => h.id))
    expect(state.monsterDeck.discard).toHaveLength(2)
    expect(state.turn.monsterDrawn).toBeFalsy()
    expect(state.adventure.story.steps[0]).toBe('Place the chamber tiles.')
    expect(state.adventure.story.steps.join(' ')).toMatch(/Regiment/)

    for (const monster of inChamber) state = defeat(state, monster)
    expect(state.status).toBe('playing') // still has to escape
    state = gameReducer(state, { type: 'ADVENTURE_ESCAPED', escaped: true })
    expect(state.status).toBe('won')
  })

  it("draws a chamber card the app can run and puts its villain in the chamber", () => {
    // 0.4 of the three playable cards picks the second: the Lair.
    let state = reveal(start(adventures[1]), 'Dire Chamber Entrance', [0.4])
    expect(state.adventure.chamber.card.id).toBe('lair')
    expect(state.villains.map((v) => v.name)).toEqual(['Big Boss'])
    expect(state.monsters.filter((m) => m.chamber)).toHaveLength(2)
    expect(state.log.some((l) => /Rat doesn't belong in this chamber/.test(l.text))).toBe(true)
    const boss = state.villains[0]
    state = defeat(state, boss)
    expect(state.status).toBe('won')
  })

  it('never draws a chamber card the app cannot run', () => {
    const state = reveal(start(adventures[1]), 'Dire Chamber Entrance', [0.99])
    expect(state.adventure.chamber.card.id).toBe('altar')
  })

  it('puts an Altar in the chamber that heroes can attack, with no XP or treasure', () => {
    let state = reveal(start(adventures[1]), 'Dire Chamber Entrance', [0.99])
    const altar = state.monsters.find((m) => m.objective)
    expect(altar).toMatchObject({ name: 'Altar', hp: 2, ac: 5, ownerId: null })
    expect(foes(state).some((f) => f.id === altar.id)).toBe(true)
    const xp = state.xp
    state = defeat(state, altar)
    expect(state.xp).toBe(xp)
    expect(state.turn.treasureOwed ?? null).toBeNull()
    expect(state.status).toBe('won')
  })
})

describe('doors', () => {
  const game = () => start(adventures[2])

  it('a Trapped Door does 1 damage to each hero next to it', () => {
    const state = game()
    const [a, b] = state.heroes
    const next = gameReducer(state, { type: 'DOOR_REVEALED', kind: 'trapped', heroId: a.id, heroIds: [a.id, b.id] })
    expect(next.heroes.map((h) => h.hp)).toEqual([a.hp - 1, b.hp - 1])
  })

  it('a Locked Door stays until a hero rolls 10 or more', () => {
    let state = gameReducer(game(), { type: 'DOOR_REVEALED', kind: 'locked' })
    const [door] = state.adventure.lockedDoors
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'DOOR_UNLOCK', doorId: door.id, heroId: hero.id, roll: 9 })
    expect(state.adventure.lockedDoors).toHaveLength(1)
    state = gameReducer(state, { type: 'DOOR_UNLOCK', doorId: door.id, heroId: hero.id, roll: 10 })
    expect(state.adventure.lockedDoors).toHaveLength(0)
  })

  it('an Unlocked Door just opens', () => {
    const state = gameReducer(game(), { type: 'DOOR_REVEALED', kind: 'unlocked' })
    expect(state.adventure.lockedDoors).toHaveLength(0)
    expect(state.moment.title).toMatch(/open/)
  })
  it("opens the secret door only after its entrance, from the Hero Phase's door box", () => {
    let state = game()
    const open = (s) => gameReducer(s, { type: 'ADVENTURE_REVEAL', tile: 'Secret door', door: true, cards: monsters, villains, chambers, random: [] })
    expect(open(state)).toBe(state)
    // The exploration button can't open a door reveal.
    state = gameReducer(state, { type: 'ADVENTURE_REVEAL', tile: 'Entrance', cards: monsters, random: [] })
    expect(gameReducer(state, { type: 'ADVENTURE_REVEAL', tile: 'Secret door', cards: monsters, villains, chambers, random: [] })).toBe(state)
    state = open(state)
    expect(state.adventure.chamber.card.id).toBe('lair')
    expect(state.adventure.story.text).toBe('Eyes!')
  })
})
