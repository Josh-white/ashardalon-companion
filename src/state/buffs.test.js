import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { heroAc } from '../data/powerEffects.js'
import { acParts, attackParts } from '../data/statParts.js'
import { attackNumbers } from './heroAttacks.js'
import { createHero, gameReducer, initialState } from './game.js'

// Fan Bard (hero 0) and Monk-style powers as cards.json would give them.
const song = { name: 'Song of Courage', text: 'All Heroes +2 to attack.', effect: { use: { buff: { attack: 2, who: 'all', lasts: 'heroPhaseEnd' } } } }
const centered = { name: 'Centered Defense', text: '+3 AC.', effect: { use: { buff: { ac: 3, who: 'self', lasts: 'turnStart' } } } }

const start = () => gameReducer(initialState, { type: 'START_GAME', heroes: HERO_TEMPLATES.slice(0, 2).map((t) => createHero(t)) })
function give(state, card) {
  const hero = state.heroes[0]
  const slot = hero.powers.find((p) => p.type === 'utility')
  return { state: gameReducer(state, { type: 'SET_POWER_CARD', heroId: hero.id, powerId: slot.id, card: { id: card.name, ...card } }), id: slot.id }
}
const use = (state, id) => gameReducer(state, { type: 'USE_POWER', heroId: state.heroes[0].id, powerId: id, heroIds: [] })
// Ends phases until the given hero's Hero Phase has ended `times` times.
function endHeroPhases(state, times) {
  let ends = 0
  for (let i = 0; i < 40 && ends < times; i++) {
    const wasHero = state.turn.phase === 0 && state.turn.heroIndex === 0
    state = gameReducer(state, { type: 'NEXT_PHASE', roll: 15, rolls: [] })
    if (wasHero && state.turn.phase !== 0) ends++
  }
  return state
}

describe('party and self bonuses from powers', () => {
  it('Song of Courage: every hero +2 to attack until the end of the bard\'s next Hero Phase', () => {
    let { state, id } = give(start(), song)
    state = use(state, id)
    for (const hero of state.heroes) {
      const power = hero.powers.find((p) => p.type === 'at-will')
      expect(attackNumbers(hero, { power }).parts.bonus.some((p) => p.label === 'Song of Courage' && p.value === 2)).toBe(true)
      expect(attackParts(hero).parts.some((p) => p.label === 'Song of Courage')).toBe(true)
    }
    state = endHeroPhases(state, 1)
    expect(state.heroes[1].buffs).toHaveLength(1)
    state = endHeroPhases(state, 1)
    expect(state.heroes.every((h) => (h.buffs ?? []).length === 0)).toBe(true)
    expect(state.log.some((l) => /Song of Courage wears off/.test(l.text ?? l))).toBe(true)
  })

  it('Centered Defense: +3 AC for the monk until the start of the next turn', () => {
    let { state, id } = give(start(), centered)
    const ac = heroAc(state.heroes[0])
    state = use(state, id)
    expect(heroAc(state.heroes[0])).toBe(ac + 3)
    expect(acParts(state.heroes[0]).parts.some((p) => p.label === 'Centered Defense')).toBe(true)
    expect(state.heroes[1].buffs ?? []).toHaveLength(0)
    // Through the other hero's turn, then gone when hero 0's turn starts again.
    for (let i = 0; i < 40 && !(state.turn.heroIndex === 1 && state.turn.phase === 0); i++) state = gameReducer(state, { type: 'NEXT_PHASE', roll: 15, rolls: [] })
    expect(heroAc(state.heroes[0])).toBe(ac + 3)
    for (let i = 0; i < 40 && state.turn.heroIndex !== 0; i++) state = gameReducer(state, { type: 'NEXT_PHASE', roll: 15, rolls: [] })
    expect(heroAc(state.heroes[0])).toBe(ac)
  })
})
