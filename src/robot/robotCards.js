import EXAMPLE from '../../cards/cards.example.json'

// The robot's card file: the repo's example cards, a few more made-up monsters so every kind
// of monster tactic comes up, and made-up dungeon tiles so it can play on the virtual board.
// Nothing here is real card text or a real tile layout; those stay on the Pi.

const MONSTERS = [
  {
    // Explores when it's alone by an open edge, like the sentries.
    id: 'robot-scout', name: 'Robot Scout', copies: 2, ac: 14, hp: 1, xp: 1,
    attacks: [{ id: 'poke', name: 'Poke', bonus: 7, damage: 1 }],
    tactics: [
      { when: 'adjacent', attack: 'poke', text: 'Attacks a hero next to it.' },
      { when: 'aloneByUnexploredEdge', explore: true, text: 'Alone by an unexplored edge: places a tile and a monster.' },
      { move: 'toward', text: 'Otherwise, moves 1 tile toward the closest hero.' },
    ],
    types: ['Robot'],
  },
  {
    // Hits every hero on its tile, or every hero within 1 tile.
    id: 'robot-blob', name: 'Robot Blob', copies: 2, ac: 12, hp: 2, xp: 2,
    attacks: [
      { id: 'splash', name: 'Splash', bonus: 6, damage: 1, conditions: ['Dazed'] },
      { id: 'squish', name: 'Squish', bonus: 7, damage: 2, conditions: ['Poisoned'], miss: 1 },
    ],
    tactics: [
      { when: 'sameTile', attack: 'splash', targets: 'all', text: 'Attacks every hero on its tile.' },
      { when: 'within1', attack: 'squish', targets: 'all', text: 'Attacks every hero within 1 tile.' },
      { move: 'toward', text: 'Otherwise, moves 1 tile toward the closest hero.' },
    ],
    types: ['Robot'],
  },
]

// Squares: "." floor, "#" wall, "S" scorch mark. Exits: "o" open, "x" wall, read left to
// right (north, south) and top to bottom (east, west).
const TILES = [
  {
    id: 'start', name: 'Start', kind: 'start',
    rows: ['....', '....', '....', '....', '....', '....', '....', '....'],
    exits: { N: 'oooo', S: 'oooo', W: 'oooooooo', E: 'oooooooo' },
    features: [{ type: 'stairs', at: [[1, 3], [2, 3], [1, 4], [2, 4]] }],
  },
  ...[
    ['....', '.S..', '....', '....', { N: 'oooo', S: 'oooo', W: 'oooo', E: 'oooo' }],
    ['#..#', '..S.', '....', '#..#', { N: 'xoox', S: 'xoox', W: 'xoox', E: 'xoox' }],
    ['....', '....', '.S..', '####', { N: 'oooo', S: 'xxxx', W: 'ooox', E: 'ooox' }],
    ['#...', '#.S.', '#...', '#...', { N: 'xooo', S: 'xooo', W: 'xxxx', E: 'oooo' }],
    ['.##.', '.S..', '....', '.##.', { N: 'oxxo', S: 'oxxo', W: 'oooo', E: 'oooo' }],
    ['....', '#S.#', '#..#', '....', { N: 'oooo', S: 'oooo', W: 'oxxo', E: 'oxxo' }],
    ['..##', '.S.#', '...#', '..##', { N: 'ooxx', S: 'ooxx', W: 'oooo', E: 'xxxx' }],
    ['....', '..S.', '#..#', '#..#', { N: 'oooo', S: 'xoox', W: 'ooxx', E: 'ooxx' }],
    ['....', '.S..', '....', '....', { N: 'oooo', S: 'oooo', W: 'xxxx', E: 'xxxx' }],
    ['....', '..S.', '....', '....', { N: 'xxxx', S: 'oooo', W: 'oooo', E: 'oooo' }],
  ].map(([a, b, c, d, exits], i) => ({
    id: `robot-tile-${i + 1}`, name: `Robot tile ${i + 1}`, kind: 'regular', triangle: i % 2 ? 'white' : 'black',
    rows: [a, b, c, d], exits,
  })),
]

// Heroes have two utility slots or two daily slots; the example file has one of each per hero.
const POWERS = ['cleric', 'fighter', 'paladin', 'rogue', 'wizard'].flatMap((hero) => [
  { id: `robot-${hero}-utility`, hero, type: 'utility', name: `Robot Utility (${hero})`, attack: '', damage: '', text: 'Made-up utility power.' },
  { id: `robot-${hero}-daily`, hero, type: 'daily', name: `Robot Daily (${hero})`, attack: '+8', damage: '2', text: 'Made-up daily power: attack one monster.' },
])

// A made-up campaign, so the robot plays campaign games too: the same adventure again and
// again, with Treasure tokens for kills. No chambers, so beating it once ends the campaign.
const CAMPAIGN = {
  id: 'robot-campaign', title: 'Robot Campaign', players: '1-5', goal: 'Defeat 3 monsters.',
  blurb: 'Made-up campaign for the robot.', setup: [], story: { start: 'Made-up start.', victory: 'Made-up victory.' },
  win: { figures: 3 }, campaign: { secondChance: true },
}
const TREASURE_TOKENS = [{ gold: 50, count: 4 }, { gold: 100, count: 2 }, { treasure: true, count: 2 }]

export const ROBOT_CARD_FILE = {
  ...EXAMPLE,
  adventures: [...EXAMPLE.adventures, CAMPAIGN],
  treasureTokens: TREASURE_TOKENS,
  powers: [...EXAMPLE.powers, ...POWERS],
  monsters: [...EXAMPLE.monsters, ...MONSTERS],
  tiles: TILES,
}
