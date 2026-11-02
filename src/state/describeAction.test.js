import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { describeAction } from './describeAction.js'
import { createHero, gameReducer, initialState } from './game.js'

describe('undo labels', () => {
  it('names the hero, monster, and amount', () => {
    let state = gameReducer(initialState, { type: 'START_GAME', heroes: [createHero(HERO_TEMPLATES[3])] })
    const hero = state.heroes[0]
    state = gameReducer(state, { type: 'ADD_MONSTER', name: 'Grell', hp: 3, xp: 2, ownerId: hero.id })
    const monster = state.monsters[0]
    expect(describeAction(state, { type: 'ADJUST_HP', heroId: hero.id, amount: -1 })).toBe('Tarak −1 HP')
    expect(describeAction(state, { type: 'ADJUST_HP', heroId: hero.id, amount: 2 })).toBe('Tarak +2 HP')
    expect(describeAction(state, { type: 'DEFEAT_MONSTER', monsterId: monster.id })).toBe('Defeating Grell')
    expect(describeAction(state, { type: 'NEW_GAME' })).toBe('New game')
    expect(describeAction(state, { type: 'SOMETHING_NEW' })).toBe('Last change')
  })
})

describe('every undoable action has its own label', () => {
  it('names board moves, doors, villains and setup', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const dirs = ['src/state', 'src/board']
    const handled = new Set()
    for (const dir of dirs) {
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.js') || file.includes('.test.') || file === 'describeAction.js') continue
        for (const m of fs.readFileSync(path.join(dir, file), 'utf8').matchAll(/case '([A-Z_]+)'/g)) handled.add(m[1])
      }
    }
    const server = fs.readFileSync('server/server.js', 'utf8')
    const notUndoable = new Set([...server.match(/NOT_UNDOABLE = new Set\(\[([^\]]*)\]/)[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]))
    const state = initialState
    const missing = [...handled].filter((type) => !notUndoable.has(type) && describeAction(state, { type }) === 'Last change')
    expect(missing).toEqual([])
  })
})
