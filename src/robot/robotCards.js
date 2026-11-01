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
  // A made-up chamber: an Entrance and four chamber tiles, for the made-up clans campaign.
  {
    id: 'dire-chamber-entrance', name: 'Dire Chamber Entrance', kind: 'chamber', triangle: 'red',
    rows: ['....', '....', '.S..', '#..#'], exits: { N: 'oooo', S: 'xoox', W: 'ooox', E: 'ooox' },
  },
  ...[1, 2, 3, 4].map((n) => ({
    id: `dire-chamber-${n}`, name: 'Dire Chamber', kind: 'chamber', triangle: 'white',
    rows: ['####', '....', n % 2 ? '.S..' : '..S.', '....'], exits: { N: 'xxxx', S: 'oooo', W: 'xooo', E: 'xooo' },
  })),
]

// Heroes have two utility slots or two daily slots; the example file has one of each per hero.
const POWERS = ['cleric', 'fighter', 'paladin', 'rogue', 'wizard'].flatMap((hero) => [
  { id: `robot-${hero}-utility`, hero, type: 'utility', name: `Robot Utility (${hero})`, attack: '', damage: '', text: 'Made-up utility power.' },
  { id: `robot-${hero}-daily`, hero, type: 'daily', name: `Robot Daily (${hero})`, attack: '+8', damage: '2', text: 'Made-up daily power: attack one monster.' },
])
// Powers named like real ones (made-up text), picked first, so the computer heroes play the
// powers that put tokens down, hand out attacks, hide heroes or react on other turns.
const NAMED = [
  ['cleric', 'daily', 'Cause Fear'], ['cleric', 'utility', 'Astral Refuge'],
  ['wizard', 'daily', 'Flaming Sphere'], ['wizard', 'utility', 'Invisibility'],
  ['rogue', 'utility', 'Tumbling Escape'], ['fighter', 'utility', 'Inspiring Advice'],
  ['paladin', 'daily', 'Blade Barrier'],
].map(([hero, type, name]) => ({ id: `robot-${name.toLowerCase().replace(/\W+/g, '-')}`, hero, type, name, attack: '', damage: '', text: 'Made-up power.', suggested: true }))

// A made-up campaign, so the robot plays campaign games too: the same adventure again and
// again, with Treasure tokens for kills. No chambers, so beating it once ends the campaign.
const CAMPAIGN = {
  id: 'robot-campaign', title: 'Robot Campaign', players: '1-5', goal: 'Defeat 3 monsters.',
  blurb: 'Made-up campaign for the robot.', setup: [], story: { start: 'Made-up start.', victory: 'Made-up victory.' },
  win: { figures: 3 }, campaign: { secondChance: true },
}
// A made-up campaign with chambers, shaped like the book's clan campaign: find the Chamber
// Entrance, beat the villain (or every monster) in the chamber card's chamber, and go on to the
// next chamber with the same heroes. Beating both chambers wins it.
const CLANS = {
  id: 'robot-clans', title: 'Robot Clans', players: '2-5', goal: 'Beat both robot lairs.',
  blurb: 'Made-up chamber campaign for the robot.', setup: [], story: { start: 'Made-up start.', victory: 'Made-up victory.' },
  reveals: [{ tile: 'Dire Chamber Entrance', story: 'Made-up lair.', steps: ['Made-up step.'], actions: [{ type: 'chamber' }] }],
  win: { chamber: true },
  needs: ['chambers', 'villains', 'campaign'],
  campaign: { chambers: ['robot-lair', 'robot-nest'], boonsFor: { 'robot-lair': 'robot-boon-tile', 'robot-nest': 'robot-boon-discard' } },
}
const CHAMBERS = [
  {
    id: 'robot-lair', name: 'Robot Lair', setup: ['Made-up setup.'], goal: 'Beat Grak.', villain: 'Example Villain',
    monsters: { perPlayer: 1, types: [], redrawXp: [] }, win: { villain: true }, needs: [],
  },
  {
    id: 'robot-nest', name: 'Robot Nest', setup: ['Made-up setup.'], goal: 'Beat every monster in the nest.',
    monsters: { perPlayer: 1, types: ['Robot'], redrawXp: [] }, win: { chamberMonsters: true }, needs: [],
  },
]
const BOONS = [
  { id: 'robot-boon-tile', name: 'Robot Short Cut', text: 'Made-up boon: a free tile.', use: 'startTile' },
  { id: 'robot-boon-discard', name: 'Robot Scare', text: 'Made-up boon: discard a robot just drawn.', use: 'discardMonster', monsterTypes: ['Robot'] },
]
const TREASURE_TOKENS = [{ gold: 50, count: 4 }, { gold: 100, count: 2 }, { treasure: true, count: 2 }]

export const ROBOT_CARD_FILE = {
  ...EXAMPLE,
  adventures: [...EXAMPLE.adventures, CAMPAIGN, CLANS],
  chambers: CHAMBERS,
  boons: BOONS,
  // Shop prices, so the shop between campaign adventures has something to sell.
  treasures: EXAMPLE.treasures.map((t, i) => ({ ...t, cost: 100 * (i + 1) })),
  treasureTokens: TREASURE_TOKENS,
  powers: [...EXAMPLE.powers, ...POWERS, ...NAMED],
  monsters: [...EXAMPLE.monsters, ...MONSTERS],
  tiles: TILES,
}

// Easy mode, for the robot's play-to-win games (campaigns, chambers): the same cards, but
// every monster and villain falls to one or two hits and rarely hits back (traps and
// events rarely hit either), and the
// adventure's special tiles (the Chamber Entrance) turn up in the first few tiles drawn. The
// robot taps at random, so without this it almost never finds a chamber, let alone beats one.
const easier = (foe, hp) => ({
  ...foe,
  hp: Math.min(foe.hp ?? hp, hp),
  ac: Math.min(foe.ac ?? 10, 8),
  attacks: (foe.attacks ?? []).map((a) => ({ ...a, bonus: 0 })),
})
export function easyCards(file) {
  return {
    ...file,
    monsters: (file.monsters ?? []).map((m) => (m.objective ? m : easier(m, 1))),
    villains: (file.villains ?? []).map((v) => easier(v, 2)),
    // Traps and events that attack still come up, but rarely hit.
    encounters: (file.encounters ?? []).map((e) => ({
      ...e,
      ...(e.attack ? { attack: { ...e.attack, bonus: 0, miss: 0 } } : {}),
      ...(e.trap?.attack ? { trap: { ...e.trap, attack: { ...e.trap.attack, bonus: 0, miss: 0 } } } : {}),
    })),
    adventures: (file.adventures ?? []).map((a) => ({
      ...a,
      reveals: a.reveals?.map((r) => (r.door ? r : { ...r, drawn: [2, 4] })),
    })),
  }
}
