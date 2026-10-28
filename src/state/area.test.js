import { describe, expect, it } from 'vitest'
import { AREAS, dungeonArea } from './area.js'

const game = (extra = {}) => ({ status: 'playing', monsters: [], villains: [], turn: {}, tileStack: { stack: [], drawn: 0 }, ...extra })
const drawn = (n) => ({ tileStack: { stack: [], drawn: n } })
const adventure = (revealed, setup = []) => ({ adventure: { revealed, card: { setup } } })
const key = (state) => dungeonArea(state)?.key

describe('dungeon area', () => {
  it('goes deeper as tiles come off the stack', () => {
    expect(key(game())).toBe('start')
    expect(key(game(drawn(1)))).toBe('halls')
    expect(key(game(drawn(7)))).toBe('tunnels')
    expect(key(game(drawn(14)))).toBe('depths')
  })

  it('starts on the Ancient Battlefield when the adventure does', () => {
    expect(key(game(adventure([], ['Place the Ancient Battlefield Start tile on the table.'])))).toBe('battlefield')
  })

  it('follows the last special tile revealed', () => {
    expect(key(game({ ...drawn(10), ...adventure(['Vault']) }))).toBe('vault')
    expect(key(game(adventure(['Vault', 'Horrid Chamber Entrance'])))).toBe('horrid-chamber')
    expect(key(game(adventure(['Dire Chamber Entrance'])))).toBe('dire-chamber')
    expect(key(game(adventure(['Secure Exit'])))).toBe('exit')
    expect(key(game(adventure(['Secret Chamber door'])))).toBe('chamber')
    expect(key(game({ ...drawn(3), ...adventure(['Something else']) }))).toBe('halls')
  })

  it('turns to the villain while one is on the board', () => {
    const area = dungeonArea(game({ ...adventure(['Dire Chamber Entrance']), villains: [{ name: 'Gauth' }] }))
    expect(area).toEqual({ key: 'villain', label: "Gauth's lair" })
    expect(key(game({ villains: [{ name: 'Ashardalon' }] }))).toBe('ashardalon')
    expect(key(game({ ...drawn(2), villains: [{ name: 'Gauth', defeated: true }] }))).toBe('halls')
  })

  it('copes with a game saved before the tile stack', () => {
    expect(key(game({ tileStack: null }))).toBe('start')
    expect(key(game({ tileStack: null, turn: { explored: true } }))).toBe('halls')
  })

  it('is plain outside a game', () => {
    expect(dungeonArea(game({ status: 'setup' }))).toBe(null)
    expect(dungeonArea(null)).toBe(null)
  })

  it('has a look for every area', () => {
    for (const look of Object.values(AREAS)) {
      expect(look.label).toBeTruthy()
      expect(look.glow).toMatch(/^\d+ \d+ \d+$/)
    }
  })
})
