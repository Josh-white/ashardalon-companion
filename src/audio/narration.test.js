import { describe, expect, it } from 'vitest'
import { allyLines, cardWords, momentLines, narrationFor as linesFor } from './narration.js'

// Most tests only care about the words; the cast has its own test below.
// Stage directions like [excited] are left out, as an older voice model would.
const words = (text) => text.replace(/\[[^\]]*\]\s*/g, '')
const momentLine = (moment, state) => {
  const line = momentLines(moment, state)[0]
  return line ? words(line.text) : null
}
const narrationFor = (...args) => linesFor(...args).map((line) => words(line.text))

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
    expect(momentLine({ kind: 'crit', heroId: 'h1', value: 20, title: 'NATURAL 20!' }, game())).toBe('A natural twenty for Keyleth!')
    expect(momentLine({ kind: 'crit', heroId: 'h1', rolls: [{ value: 20 }], title: 'Keyleth: Sun Strike!' }, game())).toBe(
      'A natural twenty for Keyleth!',
    )
    expect(momentLine({ kind: 'fumble', heroId: 'h2', value: 1, title: 'Oops… a 1' }, game())).toBe('Oh no… Tarak rolled a one.')
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
      "Tarak, it's your turn. What will you do?",
    ])
    expect(narrationFor(game({ status: 'setup' }), game({ adventure: { card: { title: 'Into the Mountain' } } }), NOW)).toEqual([
      'The adventure begins: Into the Mountain!',
      'Heroes, enter the dungeon!',
    ])
  })

  it('reads the whole story in a Read aloud box', () => {
    const adventure = (story) => ({ card: { title: 'Into the Mountain' }, story })
    const exit = { id: 's2', title: 'The Tunnel Exit!', text: 'Ahead, you see light streaming in from above.' }
    expect(narrationFor(game({ adventure: adventure(null) }), game({ adventure: adventure(exit) }), NOW)).toEqual([
      'The Tunnel Exit! Ahead, you see light streaming in from above.',
    ])
    expect(narrationFor(game({ adventure: adventure(exit) }), game({ adventure: adventure(exit) }), NOW)).toEqual([])
    // A new game reads like its opening screen: the name, the story, then the call into the dungeon.
    const intro = { id: 's1', title: 'Into the Mountain', text: 'The mountain rumbles.' }
    expect(narrationFor(game({ status: 'setup' }), game({ adventure: adventure(intro) }), NOW)).toEqual([
      'The adventure begins: Into the Mountain!',
      'The mountain rumbles.',
      'Heroes, enter the dungeon!',
    ])
    // The briefing's goal comes just before the call into the dungeon.
    const clans = { card: { title: 'Campaign Against the Clans', goal: 'Defeat the leaders of the Monster clans.' }, story: intro }
    expect(narrationFor(game({ status: 'setup' }), game({ adventure: clans }), NOW).slice(-2)).toEqual([
      'Your quest: Defeat the leaders of the Monster clans.',
      'Heroes, enter the dungeon!',
    ])
    const won = { id: 's3', title: 'Victory!', text: 'You escaped the dungeon!' }
    expect(narrationFor(game({ adventure: adventure(exit) }), game({ status: 'won', adventure: adventure(won) }), NOW)).toEqual(['You escaped the dungeon!'])
  })

  it('gives each kind of line its own voice', () => {
    const villains = [
      { id: 'v1', name: 'Kobold Dragonlord', fullName: 'Meerak, Kobold Dragonlord' },
      { id: 'v2', name: 'Rage Drake', fullName: 'Rage Drake' },
    ]
    const voices = (moment, state = game()) => momentLines(moment, state).map((line) => line.voice)
    expect(voices({ kind: 'crit', heroId: 'h1', value: 20, title: 'NATURAL 20!' })).toEqual(['herald'])
    expect(voices({ kind: 'treasure', title: 'Potion of Healing' })).toEqual(['herald'])
    expect(voices({ kind: 'spawn', title: 'A Kobold appears!' })).toEqual(['danger'])
    expect(voices({ kind: 'down', title: 'Keyleth is down!' })).toEqual(['danger'])
    expect(voices({ kind: 'encounter', title: 'Hall of Spiders' })).toEqual(['narrator'])
    // A villain is announced, then speaks for itself.
    expect(voices({ kind: 'spawn', title: 'Meerak, Kobold Dragonlord appears!' }, game({ villains }))).toEqual(['narrator', 'meerak'])
    expect(momentLines({ kind: 'spawn', title: 'Meerak, Kobold Dragonlord appears!' }, game({ villains }))[1].text).toMatch(/^\[shouting\] Intruders/)
    // A villain's last words come before the cheer.
    expect(voices({ kind: 'defeat', title: 'Kobold Dragonlord defeated!' }, game({ villains }))).toEqual(['meerak', 'herald'])
    // Beasts don't talk: the danger voice describes them.
    expect(voices({ kind: 'spawn', title: 'Rage Drake appears!' }, game({ villains }))).toEqual(['narrator', 'danger'])
    expect(voices({ kind: 'spawn', title: 'The Rage Drake is enraged!' }, game({ villains }))).toEqual(['danger'])
  })

  it('cheers a win', () => {
    expect(narrationFor(game(), game({ status: 'won' }), NOW)[0]).toMatch(/^Victory!/)
  })
})

describe('the lobby', () => {
  const lobby = (...keys) => ({ status: 'setup', heroes: [], lobby: keys.map((heroKey) => ({ heroKey })) })

  it('has the herald call out each hero as an iPad picks them', () => {
    expect(narrationFor(lobby('rogue'), lobby('rogue', 'paladin'))).toEqual(['Keyleth the Elf Paladin has arrived!'])
    expect(linesFor(lobby(), lobby('wizard'))[0].voice).toBe('herald')
  })

  it('stays quiet when a hero is let go, or for the first state a screen sees', () => {
    expect(narrationFor(lobby('rogue', 'paladin'), lobby('rogue'))).toEqual([])
    expect(narrationFor(null, lobby('rogue'))).toEqual([])
  })
})

describe('the first turn and the chronicle', () => {
  it('names who won the roll for first turn', () => {
    const before = { ...game(), firstRoll: { winner: null } }
    const after = { ...game(), firstRoll: { winner: 'h2' } }
    expect(narrationFor(before, after)).toContain('Tarak wins the roll and goes first!')
    expect(narrationFor(after, after)).toEqual([])
  })

  it('looks back at the last adventure when a campaign comes back to the lobby', () => {
    const lobby = (last) => ({ status: 'setup', heroes: [], lobby: [], campaign: { last } })
    expect(narrationFor(game({ status: 'won' }), lobby({ won: true, chamber: 'Orc Clan Lair' }))).toEqual([
      'Previously… the heroes conquered the Orc Clan Lair. But greater dangers still wait below.',
    ])
    expect(narrationFor(game({ status: 'lost' }), lobby({ won: false, chamber: "Ashardalon's Lair" }))).toEqual([
      "Previously… the heroes were driven back from Ashardalon's Lair. They return, wiser and warier.",
    ])
  })
})


describe('opening lines', () => {
  it('marks the lines that open a game, so the roll for first turn waits for them', () => {
    const before = { status: 'setup', heroes: [], lobby: [] }
    const after = { status: 'playing', heroes: [], turn: { heroIndex: 0, round: 1, phase: 0 }, adventure: { card: { title: 'Lost' }, story: { id: 's1', title: 'Lost', text: 'Once upon a time.' } } }
    const lines = linesFor(before, after, 0)
    expect(lines.length).toBe(3)
    expect(lines.every((l) => l.hold === 'opening')).toBe(true)
  })
})

describe('roll for first turn lines', () => {
  const heroes = [{ id: 'h1', name: 'Quinn' }, { id: 'h2', name: 'Tarak' }]
  const turn = (heroIndex) => ({ heroIndex, round: 1, phase: 0 })
  it('cheers a natural 20 before the winner, and waits with "your turn" until the treasure is out', () => {
    const before = { status: 'playing', heroes, turn: turn(0), firstRoll: { count: 1, winner: null, after: { kind: 'treasure' } } }
    const after = { status: 'playing', heroes, turn: turn(1), firstRoll: { count: 2, last: { heroId: 'h2', value: 20 }, winner: 'h2', after: { kind: 'treasure' } } }
    const lines = linesFor(before, after, 0)
    expect(lines.map((l) => l.text)).toEqual([expect.stringContaining('natural twenty for Tarak'), expect.stringContaining('Tarak wins the roll')])
    expect(lines.every((l) => l.hold === 'firstRoll')).toBe(true)
    const released = { ...after, firstRoll: { ...after.firstRoll, after: null } }
    expect(linesFor(after, released, 0).map((l) => l.text)).toEqual([expect.stringContaining("Tarak, it's your turn")])
  })
})

describe('the coach of a hero the computer plays', () => {
  const base = { status: 'playing', heroes: [{ id: 'h1', key: 'rogue', name: 'Tarak' }], villains: [], turn: { heroIndex: 0, phase: 0, round: 2 }, moment: null }
  const ally = { ...base, heroes: [{ ...base.heroes[0], ally: true }] }

  it('takes the hero over, and hands it back, in the coach voice', () => {
    expect(allyLines(base, ally)).toEqual([{ voice: 'coach_rogue', text: expect.stringMatching(/keep Tarak out of trouble/) }])
    expect(allyLines(ally, base)[0].text).toMatch(/back in your hands/)
  })

  it('asks for a hand, and cheers a monster defeated', () => {
    const help = { ...ally, turn: { ...ally.turn, allyHelp: 'Tarak needs a hand with this step.' } }
    expect(allyLines(ally, help)[0].text).toMatch(/Tarak's stuck/)
    const won = { ...ally, moment: { id: 'm1', kind: 'defeat', at: 1000, title: 'Kobold defeated!' } }
    expect(linesFor(ally, won, 1000).map((l) => l.voice)).toEqual(['herald', 'coach_rogue'])
    // A player's own hero: the coach stays quiet.
    expect(allyLines(base, { ...base, moment: won.moment }, 1000)).toEqual([])
  })
})

describe('heroes reading cards out loud', () => {
  const party = [
    { id: 'h1', key: 'paladin', name: 'Keyleth' },
    { id: 'h2', key: 'rogue', name: 'Tarak' },
  ]
  const play = (change = {}) => ({ status: 'playing', heroes: party, turn: { heroIndex: 1, phase: 1, round: 2 }, moment: null, ...change })
  const readLines = (before, after) => linesFor(before, after, NOW).filter((l) => l.read)

  it('turns card text into one spoken line', () => {
    expect(cardWords('You are cursed!\n• Take 1 damage\nThen discard this card.')).toBe('You are cursed! Take 1 damage. Then discard this card.')
    expect(cardWords('OPEN THE CAGE: Roll 10+ against AC.')).toBe('Open The Cage: Roll 10+ against AC.')
  })

  it('has the hero who drew an encounter read what happens, after the narrator names it', () => {
    const card = { name: 'Bloodlust', flavor: 'A red haze.', text: 'You are cursed!\nTake 1 damage.' }
    const lines = momentLines({ kind: 'encounter', heroId: 'h1', title: 'Bloodlust' }, play({ encounter: { card } }))
    expect(lines.map((l) => l.voice)).toEqual(['narrator', 'hero_paladin'])
    expect(words(lines[1].text)).toBe('You are cursed! Take 1 damage.')
    expect(lines[1]).toMatchObject({ read: true, heroId: 'h1' })
  })

  it('has the hero who found a treasure read what it does, but not the starting treasure', () => {
    const card = { name: 'Potion of Healing', text: 'Regain 2 HP.' }
    const lines = momentLines({ kind: 'treasure', heroId: 'h2', title: 'Potion of Healing' }, play({ treasure: { card } }))
    expect(lines.map((l) => l.voice)).toEqual(['herald', 'hero_rogue'])
    expect(momentLines({ kind: 'treasure', title: 'Starting treasure!' }, play()).map((l) => l.voice)).toEqual(['herald'])
  })

  it('reads a chamber card, its villagers and a tile event in the active hero\'s voice', () => {
    const chamber = { id: 'c1', name: 'Hall', goal: 'Save them.', setup: ['Place the villagers.'] }
    const villagers = [{ id: 'v1', name: 'Alek', card: { text: '• Alek moves adjacent.' } }]
    const after = play({ adventure: { chamber: { card: chamber } }, villagers, turn: { heroIndex: 1, phase: 1, round: 2, tileEvent: { id: 'rat', text: 'A rat squeaks.' } }, tileEventsSeen: ['rat'] })
    const lines = readLines(play(), after)
    expect(lines.map((l) => [l.voice, words(l.text)])).toEqual([
      ['hero_rogue', 'Save them. Place the villagers.'],
      ['hero_rogue', 'Alek. Alek moves adjacent.'],
      ['hero_rogue', 'A rat squeaks.'],
    ])
    // On the virtual board the app places the figures, so only the goal is read.
    expect(words(readLines(play({ board: {} }), { ...after, board: {} })[0].text)).toBe('Save them.')
    expect(readLines(after, after)).toEqual([])
  })

  it('reads a boon when it is used', () => {
    const lines = momentLines({ kind: 'roll', title: 'Bypassed Guards', read: 'Draw the top tile.' }, play())
    expect(lines.map((l) => [l.voice, words(l.text)])).toEqual([['hero_rogue', 'Draw the top tile.']])
  })

  it('reads nothing for a hero with no key', () => {
    const card = { name: 'Bloodlust', text: 'Ouch.' }
    expect(momentLines({ kind: 'encounter', heroId: 'h1', title: 'Bloodlust' }, game({ encounter: { card } })).map((l) => l.voice)).toEqual(['narrator'])
  })
})

