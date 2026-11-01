import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import MonsterPeek, { peekTarget } from './MonsterPeek.jsx'

const imps = {
  id: 'm1', cardId: 'imp', name: 'Imp', ownerId: 'h1', ac: 13, xp: 1, hp: 3, maxHp: 4, conditions: ['Dazed'],
  card: { figures: 4, hp: 1, special: 'Flies over pits.', tactics: [{ text: 'If adjacent to a hero, attack.' }, { text: '' }] },
}
const state = { heroes: [{ id: 'h1', name: 'Colton' }], monsters: [imps], villains: [] }

describe('monster peek', () => {
  it('finds the monster behind any of its figure tokens', () => {
    expect(peekTarget(state, 'm1').monster.name).toBe('Imp')
    expect(peekTarget(state, 'm1#3').monster.name).toBe('Imp')
    expect(peekTarget(state, 'h1')).toBeNull()
  })

  it('shows name, owner, AC, HP left, conditions and tactics', () => {
    const html = renderToStaticMarkup(<MonsterPeek state={state} tokenId="m1#2" onClose={() => {}} />)
    for (const bit of ['Imp', 'Colton&#x27;s monster', 'AC 13', '3', '/ 4 HP left', '4 figures with 1 HP each', 'Dazed', 'Flies over pits.', 'If adjacent to a hero, attack.']) {
      expect(html).toContain(bit)
    }
  })
})
