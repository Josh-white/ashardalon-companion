import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { goalParts } from './adventure.js'
import { createHero, gameReducer, initialState, phaseChecks } from './game.js'

// Made-up cards in the card file's shape for villagers, time tokens, the Vast Gate and
// adventure encounter cards, so the tests don't need the real cards.
const file = normalizeCardFile({
  powers: [],
  monsters: [
    { id: 'rat', name: 'Rat', copies: 3, ac: 12, hp: 1, xp: 1, types: ['Animal'], attacks: [{ id: 'bite', name: 'Bite', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] },
    { id: 'ooze', name: 'Ooze', copies: 3, ac: 10, hp: 2, xp: 2, types: ['Aberrant'], attacks: [{ id: 'slap', name: 'Slap', bonus: 5, damage: 2, miss: 1 }], tactics: [{ move: 'toward' }] },
  ],
  villains: [
    { id: 'jailer', name: 'Jailer', ac: 12, hp: 4, attacks: [{ id: 'axe', name: 'Axe', bonus: 5, damage: 2 }], tactics: [{ move: 'toward' }] },
    { id: 'dragon', name: 'Dragon', ac: 15, hp: 9, addEncounter: 'breath', attacks: [{ id: 'claw', name: 'Claw', bonus: 9, damage: 3 }], tactics: [{ move: 'toward' }] },
    { id: 'drake', name: 'Drake', ac: 13, hp: 5, attacks: [{ id: 'bite', name: 'Bite', bonus: 7, damage: 2 }], tactics: [{ move: 'toward' }] },
  ],
  encounters: [
    { id: 'gloom', name: 'Gloom', type: 'event', text: 'Nothing much.' },
    { id: 'fog', name: 'Fog', type: 'event', text: 'Nothing much.' },
    { id: 'breath', name: 'Breath', type: 'event', adventure: true, noCancel: true, villain: 'dragon', returnToTop: 3 },
    { id: 'arrives', name: 'Arrives', type: 'event', adventure: true, noCancel: true, placeVillain: 'dragon', drawAnother: true },
    { id: 'ceremony', name: 'Ceremony', type: 'event', adventure: true, noCancel: true, objective: 'Gate', timeToken: true, drawAnother: true, afterDrawTop: true },
    { id: 'flares', name: 'Flares', type: 'event', adventure: true, noCancel: true, objective: 'Gate', drawMonsterType: 'Aberrant', returnToTop: 3 },
  ],
  villagers: [
    { id: 'ann', name: 'Ann', roll: [1, 10], ac: 15, hp: 2, attack: { name: 'Punch', bonus: 1, damage: 1 }, tactics: [{ ask: 'Next to a monster?', say: 'Punch it.', attack: true }, { say: 'Move.' }] },
    { id: 'bo', name: 'Bo', roll: [11, 20], ac: 13, hp: 1, tactics: [{ say: 'Move.' }] },
  ],
  chambers: [
    { id: 'prison', name: 'Prison', goal: 'Free them.', villain: 'Jailer', villagers: true, win: { chamberMonsters: true, villain: true, villagers: true } },
    { id: 'ceremony-room', name: 'Ceremony Room', goal: 'Smash the Gate.', objective: { name: 'Gate', hp: 5, ac: 12 }, timeTokens: 2, addEncounter: 'ceremony', encounterTop: true, win: { objective: true } },
    { id: 'overlord', name: 'Overlord', goal: 'Beat the villain.', villainFrom: ['Dragon', 'Drake'], win: { villain: true } },
    { id: 'lair', name: 'Lair', goal: 'Beat the dragon.', villain: 'Dragon', win: { villain: true } },
  ],
  adventures: [
    {
      id: 'captives', title: 'Captives', goal: 'Free them.', needs: ['villagers', 'chambers'],
      reveals: [{ tile: 'Dire Chamber Entrance', actions: [{ type: 'chamber', name: 'prison', villagers: 2 }] }],
      win: { chamber: true },
    },
    {
      id: 'ritual', title: 'Ritual', goal: 'Stop it.', needs: ['time-tokens', 'adventure-encounters'],
      reveals: [{ tile: 'Dire Chamber Entrance', actions: [{ type: 'chamber', name: 'ceremony-room' }] }],
      win: { chamber: true, chamberMonsters: true },
      story: { defeat: 'The gate opens!' },
    },
    {
      id: 'gate-opens', title: 'Gate Opens', goal: 'Run.', needs: ['vast-gate'],
      startObjective: { name: 'Gate', hp: 5, ac: 12 },
      startEncounters: ['flares'],
      checks: [{ phase: 'exploration', whileObjective: 'Gate', ask: 'Is a monster on the Start tile?', no: { drawMonster: true } }],
      reveals: [{ tile: 'Horrid Chamber Entrance', actions: [] }],
      win: { reveals: [{ tile: 'Horrid Chamber Entrance', label: 'Find the exit' }], escape: true },
    },
    {
      id: 'sneaky', title: 'Sneaky', goal: 'Steal it back.',
      reveals: [
        { tile: 'Vault', actions: [{ type: 'placeVillain', name: 'Drake' }, { type: 'chamberMonsters', count: 1 }, { type: 'placeToken', name: 'stolen treasure', ask: 'Who has it?', drawTreasure: true }] },
        { tile: 'Tunnel Exit', after: 'Vault', actions: [] },
      ],
      win: { tokens: ['stolen treasure'], escape: true },
    },
    {
      id: 'wrath', title: 'Wrath', goal: 'Beat the dragon.',
      reveals: [
        { tile: 'Dire Chamber Entrance', actions: [{ type: 'chamber', name: 'overlord', exclude: ['Dragon'] }] },
        { tile: 'Horrid Chamber Entrance', actions: [{ type: 'chamber', name: 'lair' }] },
      ],
      win: { villains: ['Dragon'] },
    },
  ],
  treasures: [{ id: 'coin', name: 'Coin', text: 'Shiny.' }],
})
const { adventures, chambers, monsters, villains, encounters, villagers: villagerCards } = file
const byId = (id) => adventures.find((a) => a.id === id)

const start = (adventure) => {
  const state = gameReducer({ ...initialState }, { type: 'CHOOSE_ADVENTURE', adventure })
  return gameReducer(state, { type: 'START_GAME', heroes: HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t)) })
}
const reveal = (state, tile, random = []) => gameReducer(state, { type: 'ADVENTURE_REVEAL', tile, cards: monsters, villains, chambers, villagerCards, random })
const draw = (state) => gameReducer(state, { type: 'DRAW_ENCOUNTER', heroId: state.heroes[state.turn.heroIndex].id, cards: encounters, random: [] })
const resolve = (state) => gameReducer(state, { type: 'RESOLVE_ENCOUNTER', monsterCards: monsters, villains, random: [] })
const toPhase = (state, key) => {
  const index = ['hero', 'exploration', 'villain'].indexOf(key)
  return { ...state, turn: { ...state.turn, phase: index } }
}

describe('villagers', () => {
  it('reads villager cards, and the adventure that needs them is playable', () => {
    expect(file.problems).toEqual([])
    expect(villagerCards.map((v) => v.roll)).toEqual([[1, 10], [11, 20]])
    expect(chambers[0].villagers).toBe(true)
  })

  it('puts villagers in the chamber, and the goal needs one alive', () => {
    let state = reveal(start(byId('captives')), 'Dire Chamber Entrance')
    expect(state.villagers.map((v) => v.name).sort()).toEqual(['Ann', 'Bo'])
    expect(state.adventure.story.steps.join(' ')).toMatch(/villager tokens/)
    expect(goalParts(state).find((p) => p.key === 'villagers')).toMatchObject({ done: true, progress: '2 of 2 still in play' })
  })

  it('rolls for a villager at the end of the Hero Phase, before the phase can end', () => {
    let state = reveal(start(byId('captives')), 'Dire Chamber Entrance')
    expect(gameReducer(state, { type: 'NEXT_PHASE' }).turn.phase).toBe(0)
    state = gameReducer(state, { type: 'VILLAGER_ROLL', roll: 4 })
    const ann = state.villagers.find((v) => v.name === 'Ann')
    expect(state.turn.villagerRoll).toMatchObject({ roll: 4, villagerId: ann.id })
    // Ann punches a monster: 19 + 1 beats any AC here.
    const target = state.monsters.find((m) => m.chamber)
    const punched = gameReducer(state, { type: 'VILLAGER_ATTACK', villagerId: ann.id, monsterId: target.id, roll: 19 })
    expect(punched.monsters.find((m) => m.id === target.id)?.hp ?? 0).toBe(Math.max(0, target.hp - 1))
    // Only one punch a turn.
    expect(gameReducer(punched, { type: 'VILLAGER_ATTACK', villagerId: ann.id, monsterId: target.id, roll: 19 })).toBe(punched)
    expect(gameReducer(state, { type: 'NEXT_PHASE' }).turn.phase).toBe(1)
  })

  it('lets monsters attack villagers, and the heroes lose when the last one is gone', () => {
    let state = reveal(start(byId('captives')), 'Dire Chamber Entrance')
    const monster = state.monsters.find((m) => m.chamber)
    const attack = monster.card.attacks[0]
    for (const villager of state.villagers) {
      // A natural 20 always beats a villager's AC here; damage until it's gone.
      for (let i = 0; i < villager.hp; i++) {
        state = gameReducer(state, { type: 'MONSTER_ATTACK', monsterId: monster.id, attackId: attack.id, targets: [{ heroId: villager.id, roll: 20 }] })
      }
    }
    expect(state.villagers.every((v) => v.removed)).toBe(true)
    expect(state.status).toBe('lost')
  })

  it('activates no one when the roll is for a villager who is gone', () => {
    let state = reveal(start(byId('captives')), 'Dire Chamber Entrance')
    const bo = state.villagers.find((v) => v.name === 'Bo')
    state = gameReducer(state, { type: 'ADJUST_VILLAGER_HP', villagerId: bo.id, amount: -5 })
    state = gameReducer(state, { type: 'VILLAGER_ROLL', roll: 15 })
    expect(state.turn.villagerRoll.villagerId).toBeNull()
  })
})

describe('time tokens and Ceremony Progresses!', () => {
  it('puts the ceremony card on top, takes a token each time, and comes back after the extra draw', () => {
    let state = reveal(start(byId('ritual')), 'Dire Chamber Entrance')
    expect(state.adventure.timeTokens).toBe(2)
    expect(goalParts(state).map((p) => p.key)).toEqual(['chamber-monsters', 'chamber-objective'])
    state = toPhase(state, 'villain')
    state = draw(state)
    expect(state.encounter.card.id).toBe('ceremony')
    state = resolve(state)
    expect(state.adventure.timeTokens).toBe(1)
    expect(state.turn.encountersOwed).toBe(1)
    // The extra card is a normal one; then the ceremony is back on top.
    state = draw(state)
    expect(state.encounter.card.id).not.toBe('ceremony')
    expect(state.encounterDeck.draw[0]).toBe('ceremony')
    state = resolve(state)
    state = resolve(draw(state))
    expect(state.adventure.timeTokens).toBe(0)
    expect(state.status).toBe('lost')
    expect(state.adventure.story.text).toBe('The gate opens!')
  })

  it('discards the ceremony card once the gate is destroyed', () => {
    let state = reveal(start(byId('ritual')), 'Dire Chamber Entrance')
    const gate = state.monsters.find((m) => m.objective)
    state = gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: gate.id })
    state = resolve(draw(toPhase(state, 'villain')))
    expect(state.adventure.timeTokens).toBe(2)
    expect(state.encounterDeck.discard).toContain('ceremony')
  })
})

describe('the Vast Gate', () => {
  it('starts with the gate on the board and Flares! in the top 3', () => {
    let state = start(byId('gate-opens'))
    expect(state.monsters).toMatchObject([{ name: 'Gate', objective: true, hp: 5, ac: 12 }])
    state = toPhase(state, 'villain')
    // Draw until Flares! comes up (it's in the top 3 + 1).
    for (let i = 0; i < 4 && state.encounter?.card.id !== 'flares'; i++) {
      if (state.encounter) state = resolve(state)
      state = draw(state)
    }
    expect(state.encounter.card.id).toBe('flares')
    const before = state.monsters.length
    state = resolve(state)
    expect(state.monsters).toHaveLength(before + 1)
    expect(state.monsters.at(-1).card.types).toContain('Aberrant')
    expect(state.encounterDeck.draw.slice(0, 4)).toContain('flares')
  })

  it('asks after exploring whether the gate spits out a monster, only while it stands', () => {
    let state = toPhase(start(byId('gate-opens')), 'exploration')
    const [check] = phaseChecks(state, 'exploration')
    expect(check.ask).toMatch(/Start tile/)
    state = gameReducer(state, { type: 'ANSWER_CHECK', key: check.key, answer: false, cards: monsters, random: [] })
    expect(state.monsters.filter((m) => !m.objective)).toHaveLength(1)
    expect(state.turn.monsterDrawn).toBeFalsy()

    let smashed = toPhase(start(byId('gate-opens')), 'exploration')
    smashed = gameReducer(smashed, { type: 'DEFEAT_MONSTER', monsterId: smashed.monsters[0].id })
    expect(phaseChecks(smashed, 'exploration')).toEqual([])
  })

  it('needs the exit found before escaping', () => {
    let state = start(byId('gate-opens'))
    expect(gameReducer(state, { type: 'ADVENTURE_ESCAPED', escaped: true }).status).toBe('playing')
    state = toPhase(state, 'exploration')
    state = reveal(state, 'Horrid Chamber Entrance')
    expect(goalParts(state)[0]).toMatchObject({ label: 'Find the exit', done: true })
    state = gameReducer(state, { type: 'ADVENTURE_ESCAPED', escaped: true })
    expect(state.status).toBe('won')
  })
})

describe('Ashardalon Arrives!', () => {
  it('puts the villain on the board, owes another card, and brings its breath card', () => {
    let state = toPhase(start(null), 'villain')
    state = { ...state, encounterAdds: [{ id: 'arrives', top: true }] }
    state = draw(state)
    expect(state.encounter.card.id).toBe('arrives')
    state = resolve(state)
    expect(state.villains.map((v) => v.name)).toEqual(['Dragon'])
    expect(state.turn.encountersOwed).toBe(1)
    expect(state.encounterAdds).toEqual(['breath'])
  })
})

describe('Sneaky Endeavor and Wrath of Ashardalon', () => {
  it('fills a chamber with no card, hands out a treasure card with the stolen item, then escapes', () => {
    let state = toPhase(start(byId('sneaky')), 'exploration')
    state = reveal(state, 'Vault')
    expect(state.villains.map((v) => v.name)).toEqual(['Drake'])
    expect(state.monsters.filter((m) => m.chamber)).toHaveLength(2)
    expect(state.adventure.story.steps.join(' ')).toMatch(/Place these monsters/)
    const hero = state.heroes[1]
    state = gameReducer(state, { type: 'ADVENTURE_TAKE_TOKEN', name: 'stolen treasure', heroId: hero.id })
    expect(state.turn.treasureOwed).toBe(hero.id)
    state = gameReducer(state, { type: 'ADVENTURE_ESCAPED', escaped: true })
    expect(state.status).toBe('won')
  })

  it('opens two chambers, keeps the dragon out of the first, and wins when the dragon falls', () => {
    let state = toPhase(start(byId('wrath')), 'exploration')
    state = reveal(state, 'Dire Chamber Entrance', [0.99, 0.0])
    expect(state.adventure.chamber.villain).toBe('Drake')
    state = reveal(state, 'Horrid Chamber Entrance')
    expect(state.adventure.chamber.card.id).toBe('lair')
    expect(state.adventure.story.steps.join(' ')).toMatch(/Lair/)
    const dragon = state.villains.find((v) => v.name === 'Dragon')
    state = gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: dragon.id })
    expect(state.status).toBe('won')
  })
})
