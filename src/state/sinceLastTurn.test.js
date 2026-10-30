import { describe, expect, it } from 'vitest'
import { mentions, sinceLastTurn } from './sinceLastTurn.js'
import { LOG_LIMIT, withLog } from './gameHelpers.js'

const heroes = [
  { id: 'h1', name: 'Quinn', player: 'Colton' },
  { id: 'h2', name: 'Keyleth', player: 'JJ' },
]

// Logs each line during the given turn, newest first like the real log.
const play = (lines) =>
  lines.reduce((state, [round, heroIndex, text]) => withLog({ ...state, turn: { round, heroIndex, phase: 0 } }, text), { heroes, turn: { round: 1, heroIndex: 0, phase: 0 }, log: [] })

const at = (state, round, heroIndex) => ({ ...state, turn: { round, heroIndex, phase: 0 } })

describe('since your last turn', () => {
  const state = play([
    [1, 0, 'Quinn drew the encounter Bulette.'],
    [1, 1, 'Keyleth explored a new tile.'],
    [1, 1, 'The Orc Archer attacked Quinn: rolled 15 + 6 = 21 against AC 17. Hit for 2 damage.'],
    [1, 1, 'The Snake attacked Keyleth: rolled 3 + 5 = 8 against AC 18. Miss.'],
    [2, 0, 'Quinn used Healing Word.'],
  ])

  it('shows what happened during the other heroes turns, about you first', () => {
    const card = sinceLastTurn(at(state, 2, 0), 'h1')
    expect(card.about.map((e) => e.text)).toEqual(['The Orc Archer attacked Quinn: rolled 15 + 6 = 21 against AC 17. Hit for 2 damage.'])
    expect(card.others.map((e) => e.text)).toEqual(['Keyleth explored a new tile.', 'The Snake attacked Keyleth: rolled 3 + 5 = 8 against AC 18. Miss.'])
    expect(card.moreOthers).toBe(0)
  })

  it('leaves out your own last turn and this one', () => {
    const card = sinceLastTurn(at(state, 2, 1), 'h2')
    expect(card.about).toEqual([])
    expect(card.others.map((e) => e.text)).toEqual(['Quinn used Healing Word.'])
  })

  it('shows nothing in round 1, off your turn, or alone', () => {
    expect(sinceLastTurn(at(state, 1, 1), 'h2')).toBeNull()
    expect(sinceLastTurn(at(state, 2, 0), 'h2')).toBeNull()
    expect(sinceLastTurn({ ...at(state, 3, 0), heroes: [heroes[0]] }, 'h1')).toBeNull()
  })

  it('shows nothing when nothing was logged since', () => {
    expect(sinceLastTurn(at(play([[1, 0, 'Quinn moved.']]), 2, 0), 'h1')).toBeNull()
  })

  it('keeps the newest few lines about the others', () => {
    const many = play(Array.from({ length: 9 }, (_, i) => [2, 1, `Keyleth did thing ${i}.`]))
    const card = sinceLastTurn(at(many, 3, 0), 'h1')
    expect(card.others).toHaveLength(6)
    expect(card.others.at(-1).text).toBe('Keyleth did thing 8.')
    expect(card.moreOthers).toBe(3)
  })

  it('skips old log entries that do not say whose turn it was', () => {
    const old = { ...at(state, 2, 0), log: [{ id: 'x', round: 1, text: 'The Orc Archer attacked Quinn.' }] }
    expect(sinceLastTurn(old, 'h1')).toBeNull()
  })

  it('matches the hero or player name as a whole word', () => {
    expect(mentions('Colton rolled a 20.', heroes[0])).toBe(true)
    expect(mentions('Quinnton waved.', heroes[0])).toBe(false)
  })

  it('keeps a long round in the log', () => {
    const long = play(Array.from({ length: LOG_LIMIT + 5 }, (_, i) => [1, 0, `Line ${i}`]))
    expect(long.log).toHaveLength(LOG_LIMIT)
    expect(LOG_LIMIT).toBeGreaterThanOrEqual(200)
  })
})
