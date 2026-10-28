import { describe, expect, it } from 'vitest'
import { momentLines, narrationFor as linesFor } from './narration.js'

// Most tests only care about the words; the cast has its own test below.
const momentLine = (moment, state) => momentLines(moment, state)[0]?.text ?? null
const narrationFor = (...args) => linesFor(...args).map((line) => line.text)

const heroes = [
  { id: 'h1', name: 'Keyleth', player: 'Sam' },
  { id: 'h2', name: 'Tarak', player: 'Max' },
]
const game = (change = {}) => ({ status: 'playing', heroes, turn: { heroIndex: 0, phase: 0, round: 1 }, moment: null, encounter: null, ...change })
const NOW = 1_000_000

describe('narrator lines', () => {
  it('says nothing for the first state a screen sees', () => {
    expect(narrationFor(null, game())).toEqual([])
  })

  it('announces a monster, a natural 20 and a 1', () => {
    expect(momentLine({ kind: 'spawn', title: 'A Kobold appears!' }, game())).toMatch(/A Kobold appears!$/)
    expect(momentLine({ kind: 'crit', heroId: 'h1', value: 20, title: 'NATURAL 20!' }, game())).toBe('A natural twenty for Sam!')
    expect(momentLine({ kind: 'crit', heroId: 'h1', rolls: [{ value: 20 }], title: 'Keyleth: Sun Strike!' }, game())).toBe(
      'A natural twenty for Sam! Keyleth: Sun Strike!',
    )
    expect(momentLine({ kind: 'fumble', heroId: 'h2', value: 1, title: 'Oops… a 1' }, game())).toBe('Oh no… Max rolled a one.')
  })

  it('reads an encounter card with its story line', () => {
    const card = { name: 'Hall of Spiders', flavor: 'Spiders drop from the ceiling!' }
    const state = game({ encounter: { card } })
    expect(momentLine({ kind: 'encounter', title: 'Hall of Spiders' }, state)).toBe('Encounter! Hall of Spiders. Spiders drop from the ceiling!')
  })

  it('stays quiet for ordinary rolls and monster attacks', () => {
    expect(momentLine({ kind: 'roll', value: 12, title: 'Sam rolled 12' }, game())).toBeNull()
    expect(momentLine({ kind: 'monster', title: 'Kobold: Spear!' }, game())).toBeNull()
  })

  it('speaks a new moment once, and not an old one from a reconnect', () => {
    const moment = { id: 'm1', at: NOW, kind: 'defeat', title: 'Kobold defeated!' }
    expect(narrationFor(game(), game({ moment }), NOW)).toEqual(['Kobold defeated!'])
    expect(narrationFor(game({ moment }), game({ moment }), NOW)).toEqual([])
    expect(narrationFor(game(), game({ moment }), NOW + 60_000)).toEqual([])
  })

  it('announces a new tile, the next turn and the start of the adventure', () => {
    const exploring = game({ turn: { heroIndex: 0, phase: 1, round: 1 } })
    const explored = game({ turn: { heroIndex: 0, phase: 1, round: 1, explored: true } })
    expect(narrationFor(exploring, explored, NOW)).toHaveLength(1)
    expect(narrationFor(game({ turn: { heroIndex: 0, phase: 2, round: 1 } }), game({ turn: { heroIndex: 1, phase: 0, round: 1 } }), NOW)).toEqual([
      "Max, it's your turn. What will Tarak do?",
    ])
    expect(narrationFor(game({ status: 'setup' }), game({ adventure: { card: { title: 'Into the Mountain' } } }), NOW)[0]).toBe(
      'The adventure begins: Into the Mountain! Heroes, enter the dungeon.',
    )
  })

  it('reads the whole story in a Read aloud box', () => {
    const adventure = (story) => ({ card: { title: 'Into the Mountain' }, story })
    const exit = { id: 's2', title: 'The Tunnel Exit!', text: 'Ahead, you see light streaming in from above.' }
    expect(narrationFor(game({ adventure: adventure(null) }), game({ adventure: adventure(exit) }), NOW)).toEqual([
      'The Tunnel Exit! Ahead, you see light streaming in from above.',
    ])
    expect(narrationFor(game({ adventure: adventure(exit) }), game({ adventure: adventure(exit) }), NOW)).toEqual([])
    const won = { id: 's3', title: 'Victory!', text: 'You escaped the dungeon!' }
    expect(narrationFor(game({ adventure: adventure(exit) }), game({ status: 'won', adventure: adventure(won) }), NOW)).toEqual(['You escaped the dungeon!'])
  })

  it('gives each kind of line its own voice', () => {
    const villains = [{ id: 'v1', name: 'Meerak', fullName: 'Meerak the Kobold Dragonlord' }]
    const voices = (moment, state = game()) => momentLines(moment, state).map((line) => line.voice)
    expect(voices({ kind: 'crit', heroId: 'h1', value: 20, title: 'NATURAL 20!' })).toEqual(['herald'])
    expect(voices({ kind: 'treasure', title: 'Potion of Healing' })).toEqual(['herald'])
    expect(voices({ kind: 'spawn', title: 'A Kobold appears!' })).toEqual(['danger'])
    expect(voices({ kind: 'down', title: 'Keyleth is down!' })).toEqual(['danger'])
    expect(voices({ kind: 'encounter', title: 'Hall of Spiders' })).toEqual(['narrator'])
    // A villain is announced, then speaks for itself.
    expect(voices({ kind: 'spawn', title: 'Meerak the Kobold Dragonlord appears!' }, game({ villains }))).toEqual(['narrator', 'villain'])
    expect(voices({ kind: 'spawn', title: 'The Meerak is enraged!' }, game({ villains }))).toEqual(['narrator', 'villain'])
  })

  it('cheers a win', () => {
    expect(narrationFor(game(), game({ status: 'won' }), NOW)[0]).toMatch(/^Victory!/)
  })
})
