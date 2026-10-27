import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { normalizeCardFile } from '../data/cards.js'
import { goalParts } from './adventure.js'
import { createHero, gameReducer, initialState } from './game.js'

// Made-up adventures and monsters in the card file's shape, so the tests don't need the book.
const { adventures, monsters, problems } = normalizeCardFile({
  powers: [],
  monsters: [
    { id: 'rat', name: 'Rat', copies: 3, ac: 12, hp: 1, xp: 1, attacks: [{ id: 'bite', name: 'Bite', bonus: 5, damage: 1 }], tactics: [{ move: 'toward' }] },
    { id: 'imps', name: 'Imp', copies: 2, ac: 14, hp: 1, xp: 2, figures: 3, attacks: [{ id: 'claw', name: 'Claw', bonus: 6, damage: 1 }], tactics: [{ move: 'toward' }] },
  ],
  adventures: [
    { id: 'hunt', number: 2, title: 'Hunt', goal: 'Defeat 4 monsters.', win: { figures: 4 }, onceOnly: ['Imp'], story: { start: 'Off you go.', victory: 'Hooray.' } },
    {
      id: 'gear', title: 'Gear', goal: 'Get the bag.',
      reveals: [{ tile: 'Vault', story: 'A vault!', steps: ['Put the bag on the desk.'], actions: [{ type: 'placeToken', name: 'Bag' }, { type: 'drawGuardians', count: 2 }, { type: 'extraEncounters', count: 1 }] }],
      win: { guardians: true, tokens: ['Bag'] },
    },
    { id: 'big', title: 'Big', goal: 'Later.', needs: ['villagers'] },
  ],
})

const lobbyGame = (adventure, surges) => {
  let state = { ...initialState, lobbyAdventure: null }
  state = gameReducer(state, { type: 'CHOOSE_ADVENTURE', adventure })
  if (surges) state = gameReducer(state, { type: 'SET_LOBBY_SURGES', surges })
  return gameReducer(state, { type: 'START_GAME', heroes: HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t)) })
}
const draw = (state, heroIndex = 0) => gameReducer(state, { type: 'DRAW_MONSTER', heroId: state.heroes[heroIndex].id, cards: monsters, random: [] })
const defeat = (state, monster) => gameReducer(state, { type: 'DEFEAT_MONSTER', monsterId: monster.id })

describe('adventures', () => {
  it('reads adventures from the card file', () => {
    expect(problems).toEqual([])
    expect(adventures.map((a) => a.id)).toEqual(['hunt', 'gear', 'big'])
  })

  it('starts the chosen adventure with its surges and start story', () => {
    const state = lobbyGame(adventures[0], 3)
    expect(state.surges).toBe(3)
    expect(state.adventure.card.id).toBe('hunt')
    expect(state.adventure.story).toMatchObject({ title: 'Hunt', text: 'Off you go.' })
    expect(gameReducer(state, { type: 'ADVENTURE_STORY_DONE', storyId: state.adventure.story.id }).adventure.story).toBeNull()
  })

  it("won't pick an adventure that needs features the app doesn't have", () => {
    const state = gameReducer(initialState, { type: 'CHOOSE_ADVENTURE', adventure: adventures[2] })
    expect(state.lobbyAdventure).toBeNull()
  })

  it('counts every figure toward Monster Hunt and wins at the target', () => {
    let state = draw(lobbyGame(adventures[0])) // a Rat
    state = draw(state, 1) // a Rat for the other hero
    state = draw(state) // the first hero's next card: the Imps (three figures)
    const imps = state.monsters.find((m) => m.name === 'Imp')
    state = defeat(state, imps)
    expect(state.adventure.figuresDefeated).toBe(3)
    expect(state.status).toBe('playing')
    state = defeat(state, state.monsters[0])
    expect(state.status).toBe('won')
    expect(state.adventure.story.text).toBe('Hooray.')
    // Back to the game after the victory doesn't call it again.
    state = gameReducer(state, { type: 'RESUME' })
    expect(state.status).toBe('playing')
    expect(draw(state).status).toBe('playing')
  })

  it('counts a group figure as soon as an attack takes it down', () => {
    let state = draw(draw(lobbyGame(adventures[0])))
    const hero = state.heroes[0]
    const power = hero.powers.find((p) => p.type === 'at-will')
    state = gameReducer(state, { type: 'SET_POWER_CARD', heroId: hero.id, powerId: power.id, card: { id: 'hit', name: 'Hit', attack: '+9', damage: '1' } })
    const imps = state.monsters.find((m) => m.name === 'Imp')
    state = gameReducer(state, { type: 'HERO_ATTACK', heroId: hero.id, powerId: power.id, targets: [{ monsterId: imps.id, roll: 10 }] })
    expect(state.monsters.find((m) => m.id === imps.id).hp).toBe(2)
    expect(state.adventure.figuresDefeated).toBe(1)
  })

  it('discards a second copy of a once-only monster without a replacement', () => {
    let state = lobbyGame(adventures[0])
    // Rats first, then the two Imp cards, in file order.
    state = draw(draw(draw(state), 1), 0)
    expect(state.monsters.filter((m) => m.name === 'Imp')).toHaveLength(1)
    const before = state.monsters.length
    state = draw(state, 1)
    expect(state.monsters).toHaveLength(before)
    expect(state.log[0].text).toMatch(/just one/)
    expect(state.monsterDeck.discard).not.toContain('imps')
  })

  it('reveals the Vault: guardians, the token, extra encounters, then victory', () => {
    let state = lobbyGame(adventures[1])
    expect(goalParts(state).map((p) => p.done)).toEqual([false, false])
    state = gameReducer(state, { type: 'ADVENTURE_REVEAL', tile: 'Vault', cards: monsters, random: [] })
    expect(state.adventure.revealed).toEqual(['Vault'])
    expect(state.adventure.story).toMatchObject({ text: 'A vault!', steps: ['Put the bag on the desk.'] })
    expect(state.monsters.filter((m) => m.guardian)).toHaveLength(2)
    expect(state.adventure.extraEncounters).toBe(1)
    // A second tap does nothing.
    expect(gameReducer(state, { type: 'ADVENTURE_REVEAL', tile: 'Vault', cards: monsters, random: [] })).toBe(state)

    state = gameReducer(state, { type: 'ADVENTURE_TAKE_TOKEN', name: 'Bag', heroId: state.heroes[1].id })
    for (const guardian of state.monsters.filter((m) => m.guardian)) state = defeat(state, guardian)
    expect(state.status).toBe('won')
  })
})
