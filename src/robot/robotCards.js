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
  ['paladin', 'daily', 'Blade Barrier'], ['cleric', 'utility', 'Perseverance'],
  ['fighter', 'at-will', 'Charge', '+6', '1'], ['fighter', 'at-will', 'Taunting Advance', '+6', '1'],
  ['paladin', 'at-will', 'Divine Challenge', '+6', '1'], ['paladin', 'daily', 'Benign Transposition', '+7', '2'],
  ['rogue', 'daily', "King's Castle", '+7', '2'], ['wizard', 'at-will', 'Hypnotism', '+5', '1'],
  ['cleric', 'utility', 'Command'], ['rogue', 'utility', 'Distant Diversion'], ['fighter', 'utility', 'To Arms!'],
  ['fighter', 'utility', 'One for the Team'], ['wizard', 'utility', 'Wizard Eye'], ['paladin', 'utility', 'Bravery'],
  ['paladin', 'utility', 'Noble Shield'],
].map(([hero, type, name, attack = '', damage = '']) => ({ id: `robot-${name.toLowerCase().replace(/\W+/g, '-')}`, hero, type, name, attack, damage, text: 'Made-up power.', suggested: true }))

// Made-up fan heroes (like the six on the test copy), so the computer plays their abilities
// and powers in the robot's games too. Names and effects only; the text is made up.
const FAN_HEROES = [
  ['bard', 'Robot Bard', 'bardic-song', 6, 14, 3, 5, ['at-will', 'at-will', 'utility', 'utility', 'daily']],
  ['monk', 'Robot Monk', 'mind-over-body', 8, 15, 4, 6, ['daily', 'utility', 'at-will', 'at-will', 'daily']],
  ['assassin', 'Robot Assassin', 'shadowphage', 8, 14, 4, 7, ['at-will', 'at-will', 'utility', 'utility', 'daily']],
  ['ranger', 'Robot Ranger', null, 8, 14, 4, 6, ['at-will', 'at-will', 'utility', 'utility', 'daily']],
  ['battlemaster', 'Robot Battlemaster', 'fearless', 10, 17, 5, 5, ['at-will', 'at-will', 'utility', 'utility', 'daily']],
  ['druid', 'Robot Druid', 'natures-healing', 8, 14, 4, 6, ['at-will', 'at-will', 'utility', 'utility', 'daily']],
].map(([hero, name, effect, hp, ac, surge, speed, powerSlots]) => ({
  hero, name, className: 'Robot', homebrew: true, powerSlots,
  levels: [{ level: 1, hp, ac, surge, speed }, { level: 2, hp: hp + 2, ac: ac + 1, surge: surge + 1, addSlot: 'daily' }],
  abilities: effect ? [{ name: `Robot ${effect}`, text: 'Made-up ability.', effect }] : [],
}))
// [hero, type, name, attack, damage, effect, suggested]
const FAN_POWERS = [
  ['bard', 'at-will', 'Guiding Strike', '', '1', { autoHit: true, targetOnly: 'nextToHero' }, true],
  ['bard', 'at-will', 'Vicious Mockery', '+6', '1', { range: 'within2', board: { after: [{ pick: 'attacked', to: 'tileCloser', miss: true, minApart: 2 }] } }, true],
  ['bard', 'utility', 'Ballad of Life', '', '', { use: { heal: 2, pick: 'other' } }, true, 'Made-up power: a hero at 0 HP gets 2 HP.'],
  ['bard', 'utility', 'Song of Courage', '', '', { use: { buff: { attack: 2, who: 'all', lasts: 'heroPhaseEnd' } } }, true],
  ['bard', 'utility', 'Melody of Defense', '', '', { use: { buff: { ac: 2, who: 'all', lasts: 'heroPhaseEnd' } } }],
  ['bard', 'daily', 'Song of Storms', '+6', '2', { targets: 3, range: 'within2' }, true],
  ['monk', 'at-will', 'Five Storms', '+4', '1', { targets: 'any' }, true],
  ['monk', 'at-will', 'Flurry of Blows', '+6', '1', { board: { after: [{ pick: 'attacked', to: 'ownTile', hit: true }] } }, true],
  ['monk', 'daily', 'Cobra Strike', '+8', '3', null, true],
  ['monk', 'daily', 'One Hundred Leaves', '+7', '1', { targets: 'any', range: 'sameTile', board: { after: [{ each: 'monsterOnTile', to: 'tileWithin', n: 1 }] } }],
  ['monk', 'utility', 'Centered Defense', '', '', { use: { buff: { ac: 3, who: 'self', lasts: 'turnStart' } } }, true],
  ['monk', 'at-will', "Crane's Wings", '+7', '1', { range: 'within1', board: { after: [{ pick: 'self', to: 'nextToAttacked', miss: true }] } }],
  ['monk', 'daily', 'Whirling Mantis Step', '+7', '1', { targets: 'any', before: 'First move your speed.', board: { before: [{ pick: 'self', to: 'squares', n: 'speed' }] } }, true],
  ['monk', 'daily', 'Comet Strike', '+6', '2', { targets: 'any', before: 'First move your speed.', board: { before: [{ pick: 'self', to: 'squares', n: 'speed' }] } }],
  ['monk', 'utility', 'Psionic Stride', '', '', { use: { board: [{ pick: 'otherHero', to: 'swap' }] } }, true],
  ['assassin', 'at-will', 'Alshabbah', '+7', '1', { shadow: 'leave', board: { after: [{ pick: 'self', to: 'squares', n: 3, ifShadow: true }] } }],
  ['assassin', 'daily', 'Shadow Seekers', '', '', { use: { tokens: { seekersLeft: 5 } } }],
  ['assassin', 'daily', 'Trapping Attack', '', '', { use: { moveTraps: 2 }, shadow: 'leave' }],
  ['assassin', 'utility', 'Shadowmerge', '', '', { use: {}, shadow: 'enter' }, true],
  ['assassin', 'utility', 'Swift Evasion', '', '', { reaction: 'dodge', dodgeAttack: 'shadow', board: { dodge: [{ pick: 'self', to: 'tileWithin', n: 1 }] } }, true],
  ['assassin', 'at-will', 'Shadow Strike', '+7', '1', { shadow: 'leave', shadowBonus: 2 }, true],
  ['assassin', 'at-will', 'Dagger Barrage', '+6', '1', { shadow: 'leave', shadowBonus: 4, range: 'within1' }, true],
  ['assassin', 'daily', 'Into Darkness', '+7', '3', { shadow: 'enter', shadowKeep: true }, true],
  ['assassin', 'utility', 'Fleetfooted', '', '', { use: { removeTrap: true }, shadow: 'leave', reusable: true }],
  ['assassin', 'utility', 'Out of Darkness', '', '', { use: { healSelf: 3 }, shadow: 'leave' }],
  ['ranger', 'at-will', 'Longbow: Oak Arrow', '+11', '1', { range: 'within2', targetOnly: 'notOwnTile' }, true],
  ['ranger', 'at-will', 'Shortsword', '+8', '1', null, true],
  ['ranger', 'daily', 'Longbow: Cedarwood Arrow', '+9', '1', { targets: 4, range: 'within2', targetOnly: 'notOwnTile', oneTile: true, onHit: { status: 'trapped' } }, true],
  ['ranger', 'utility', 'Power of Earth', '', '', { use: { buff: { attack: 2, who: 'self', lasts: 'thisPhase', only: 'Longbow' } }, uses: 2 }, true],
  ['ranger', 'utility', 'Reviving Roots', '', '', { use: { heal: 2, pick: 'any', reach: 'adjacent' }, uses: 2 }, true],
  ['battlemaster', 'at-will', 'Double Whammy', '+4', '1', { targets: 2 }, true],
  ['battlemaster', 'at-will', 'Willbreaker', '+7', '1', { board: { after: [{ pick: 'self', to: 'nextToMonsterWithin1', hit: true }] } }, true],
  ['battlemaster', 'daily', 'Concussive Blow', '+11', '3', { targetOnly: 'villain', onHit: { status: 'immobilized' } }],
  ['battlemaster', 'daily', 'Battle Worthy', '+9', '2', { targets: 3 }, true],
  ['battlemaster', 'utility', 'Heavy Hitter', '', '', { use: { buff: { attack: 2, who: 'self', lasts: 'thisPhase' } }, uses: 2 }, true],
  ['battlemaster', 'utility', 'Dwarven Ale', '', '', { use: { healSelf: 3 } }, true],
  ['druid', 'at-will', 'Wolf Form', '+9', '1', { wolf: true }, true],
  ['druid', 'at-will', 'Piercing Thorn', '+7', '1', { critFrom: 18, range: 'within1' }, true],
  ['druid', 'at-will', 'Flaming Staff', '+8', '1', { board: { after: [{ pick: 'attacked', to: 'adjacentTile', hit: true }] } }],
  ['druid', 'daily', 'Thorn Strike', '+8', '3', { targets: 3, range: 'within1' }, true],
  ['druid', 'utility', 'Healing Herbs', '', '', { use: { heal: 1, pick: 'any', reach: 'adjacent' }, uses: 3 }, true],
  ['druid', 'utility', 'Lupine Lore', '', '', { wolfOnly: true, reaction: 'dodge', uses: 2 }, true],
].map(([hero, type, name, attack, damage, effect, suggested = false, text = 'Made-up power.']) => ({
  id: `robot-fan-${name.toLowerCase().replace(/\W+/g, '-')}`, hero, type, name, attack, damage, text, ...(effect ? { effect } : {}), suggested,
}))

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
  heroes: [...(EXAMPLE.heroes ?? []), ...FAN_HEROES],
  powers: [...EXAMPLE.powers, ...POWERS, ...NAMED, ...FAN_POWERS],
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
