import { itemAc } from './items.js'

// What each power does besides its attack roll, so the app can do it instead of the
// players. Matched to a card by its name. These are short reminders in our own words;
// the card's own text stays in cards.json.
//
// Attack powers:
//   targets     how many different monsters it can hit: a number, or 'any' (every monster on a tile). Default 1.
//   attacks     rolls in all, when one monster can be attacked more than once (Tornado Strike).
//   sameTarget  every roll is against the one monster (Reaping Strike).
//   before      a reminder shown before the roll.
//   ask         a question before the roll: 'started-adjacent' (+1 damage on a hit), 'adjacent-count' (+1 attack each),
//               or 'moved-monster' (Hypnotism: which monster was moved, so it can't be the one attacked).
//   evenBonus   extra damage on a hit when the die shows an even number.
//   onHit       { healSelf } or { heal, pick: 'tile' } (the attacker or one hero on their tile).
//   after       hit or miss: 'heal-tile' (1 HP to each hero on the tile), 'shield', 'pass-monster', 'at-will'.
//   note        a reminder shown after the roll.
//   hitNote, missNote  a reminder shown after the roll only when it hit, or only when it missed.
//   board       on the virtual board, figures it moves: { before, after, dodge } lists of steps (src/board/powerMoves.js).
//               A `use` can carry `board` too.
//   keepOnMiss  a daily that isn't used up when it misses.
//   free        doesn't use up the hero's attack (a trap can still be disabled after it).
//   shadow      a Shadowphage hero (Fesud) goes 'enter' or 'leave' the shadows after it.
//   shadowKeep  a daily that misses from the shadows isn't used up, and the hero leaves them instead.
//   shadowBonus more attack while the hero is in the shadows.
// Other powers have a `use`, done from the power's tile:
//   healSelf, heal + pick ('other': one other hero; reach: 'sameTile', 'adjacent' or 'within2' on the
//   virtual board), tokens, endCondition, refuge, invisible, causeFear, note,
//   takeEncounter (One for the Team: the hero takes another hero's encounter card, as if they drew it),
//   move (it takes the place of a move, so on the virtual board it uses one up),
//   buff { attack, ac, who: 'all' | 'self', lasts: 'heroPhaseEnd' | 'turnStart' }: a bonus that
//   lasts until the end of the caster's next Hero Phase, or until the start of their next turn
//   (a fan Bard's Song of Courage, a fan Monk's Centered Defense). Kept on each hero as hero.buffs.
// A card in cards.json can carry its own `effect` with these fields (a homebrew power);
// a power listed below by name always uses the entry here instead.
// `reaction` powers are offered where they happen: 'reroll', 'furious', 'dodge', 'evade', 'noble-shield', 'perseverance',
// 'bravery' (offered when a monster activates, and still usable from its tile).
const EFFECTS = {
  // Quinn, the cleric
  'Healing Hymn': { use: { healSelf: 2, heal: 2, pick: 'other', reach: 'sameTile', optional: true, prompt: 'Who else on your tile gets 2 HP?' } },
  "Cleric's Shield": { after: 'shield' },
  'Righteous Advance': { note: 'Hit or miss: move one hero on your tile 2 squares.', board: { after: [{ pick: 'heroOnTile', to: 'squares', n: 2 }] } },
  'Sacred Flame': { onHit: { heal: 1, pick: 'tile' } },
  'Blade Barrier': {
    use: { tokens: { bladeBarrier: 5 }, note: 'Put 5 Blade Barrier tokens on a tile within 2 tiles of you.' },
  },
  'Cause Fear': {
    use: { causeFear: true, note: 'Afterwards, put each monster that is left on a tile within 2 tiles of you.' },
  },
  'Wrathful Thunder': { after: 'pass-monster' },
  'Astral Refuge': { use: { refuge: true, pick: 'any', reach: 'within2', prompt: 'Which hero within 2 tiles goes to the Astral Refuge?' } },
  Command: { use: { note: 'Put one monster on your tile onto a tile within 2 tiles of you.', board: [{ pick: 'monsterOnTile', to: 'tileWithin', n: 2 }] } },
  Perseverance: { reaction: 'perseverance' },

  // Vistra, the fighter
  'Dwarven Resilience': { use: { healSelf: 4, move: true, note: "That's instead of moving this turn." } },
  Charge: { before: 'First move up to your speed.', board: { before: [{ pick: 'self', to: 'squares', n: 'speed' }] } },
  'Reaping Strike': { attacks: 2, sameTarget: true },
  'Sure Strike': {},
  'Comeback Strike': { onHit: { healSelf: 2 }, keepOnMiss: true },
  'Into the Fray': { before: 'First put your hero next to a hero within 2 tiles.', board: { before: [{ pick: 'self', to: 'nextToHeroWithin2' }] } },
  'Taunting Advance': {
    before: 'First move your speed, then pull a monster within 2 tiles next to you.',
    board: { before: [{ pick: 'self', to: 'squares', n: 'speed' }, { pick: 'monsterWithin2', to: 'nextToSelf' }] },
  },
  'Inspiring Advice': { reaction: 'reroll' },
  'One for the Team': { use: { takeEncounter: true, note: 'Take the encounter card and do it as if you drew it.' } },
  'To Arms!': {
    use: {
      note: 'You and one hero on your tile can each move your speed.',
      board: [{ pick: 'otherOnTile', to: 'squares', n: 'speed' }, { pick: 'self', to: 'squares', n: 'speed' }],
    },
  },

  // Keyleth, the paladin
  'Lay On Hands': { use: { heal: 2, pick: 'other', reach: 'adjacent', prompt: 'Who is next to you?' } },
  'Divine Challenge': { before: 'First pull a monster within 1 tile next to you.', board: { before: [{ pick: 'monsterWithin1', to: 'nextToSelf' }] } },
  'Holy Strike': { ask: 'started-adjacent' },
  'Valiant Strike': { ask: 'adjacent-count' },
  'Arcing Smite': { targets: 2 },
  'Benign Transposition': { before: 'First swap places with a hero within 2 tiles.', board: { before: [{ pick: 'heroWithin2', to: 'swap' }] } },
  'Righteous Smite': { after: 'heal-tile' },
  Bravery: { use: { healSelf: 1, note: 'Put your hero next to the monster.', board: [{ pick: 'self', to: 'nextToFoe' }] }, reaction: 'bravery' },
  'Noble Shield': { reaction: 'noble-shield' },
  "Virtue's Touch": { use: { endCondition: true, pick: 'other', reach: 'adjacent', prompt: 'Who is next to you?' } },

  // Tarak, the rogue
  'Furious Assault': { reaction: 'furious' },
  'Distracting Jab': {
    hitNote: 'Hit! Move the monster 1 square, then move your speed.',
    missNote: "A miss doesn't move the monster. You still move your speed.",
    board: { after: [{ pick: 'attacked', to: 'squares', n: 1, hit: true }, { pick: 'self', to: 'squares', n: 'speed' }] },
  },
  'Lucky Strike': { evenBonus: 1 },
  'Positioning Shot': {
    note: 'Hit or miss: put the monster on any square of your tile or a tile next to it.',
    board: { after: [{ pick: 'attacked', to: 'tileWithin', n: 1 }] },
  },
  'Acrobatic Onslaught': {
    after: 'at-will',
    note: 'Put your hero on a tile within 2 tiles of where you started.',
    board: { after: [{ pick: 'self', to: 'tileWithin', n: 2 }] },
  },
  "King's Castle": { before: 'First swap places with a hero within 1 tile.', board: { before: [{ pick: 'heroWithin1', to: 'swap' }] } },
  'Tornado Strike': { attacks: 4, targets: 4, note: 'Then put your hero on any square of your tile.', board: { after: [{ pick: 'self', to: 'ownTile' }] } },
  'Distant Diversion': { use: { note: 'Move a monster within 3 tiles onto a tile next to it.', board: [{ pick: 'monsterWithin3', to: 'adjacentTile' }] } },
  'Practiced Evasion': { reaction: 'evade' },
  'Tumbling Escape': { reaction: 'dodge', board: { dodge: [{ pick: 'self', to: 'tileWithin', n: 1 }] } },

  // Heskan, the wizard
  'Hurled Breath': { targets: 'any', free: true, note: "This doesn't count as your attack this turn." },
  'Arc Lightning': { targets: 2 },
  // The monster Heskan moves isn't hurt: the attack is against a monster it ends up next to.
  Hypnotism: {
    ask: 'moved-monster',
    before: 'First move a monster within 1 tile of you 1 tile. It attacks a monster it ends up next to.',
    board: { before: [{ pick: 'monsterWithin1', to: 'adjacentTile' }] },
  },
  'Ray of Frost': {},
  'Flaming Sphere': {
    use: { tokens: { flamingSphere: 3 }, note: 'Put the 3 Flaming Sphere tokens on a square within 1 tile of you.' },
  },
  'Shock Sphere': { targets: 'any' },
  'Spectral Ram': {
    note: 'Hit or miss: put the monster on any tile within 2 tiles of where it was.',
    board: { after: [{ pick: 'attacked', to: 'tileWithin', n: 2, ref: 'piece' }] },
  },
  Invisibility: { use: { invisible: true } },
  'Mirror Image': { use: { tokens: { mirrorImage: 3 } } },
  'Wizard Eye': { use: { tokens: { wizardEye: true }, note: 'Put the Wizard Eye on a tile within 1 tile of you.' } },
}

const key = (name) => String(name ?? '').toLowerCase().replace(/[^a-z]/g, '')
const BY_KEY = Object.fromEntries(Object.entries(EFFECTS).map(([name, effect]) => [key(name), effect]))
// The old card list calls Arcing Smite "Arcing Strike".
BY_KEY.arcingstrike = BY_KEY.arcingsmite

// The fields an effect can have, for checking a card's own `effect` in cards.json.
export const EFFECT_FIELDS = [
  'targets', 'attacks', 'sameTarget', 'before', 'ask', 'evenBonus', 'onHit', 'after',
  'note', 'hitNote', 'missNote', 'keepOnMiss', 'free', 'use', 'reaction', 'shadow', 'shadowBonus', 'shadowKeep', 'board',
]

const cardOf = (powerOrCard) => powerOrCard?.card ?? powerOrCard
const entryFor = (powerOrCard) => BY_KEY[key(cardOf(powerOrCard)?.name)] ?? cardOf(powerOrCard)?.effect

// The effects of a power slot (or a card), or {} for a plain power.
export const effectsOf = (powerOrCard) => entryFor(powerOrCard) ?? {}

// How many rolls one use of an attack power gets. A card the app doesn't know
// (someone's own cards.json) can hit as many monsters as the player taps.
export function maxRolls(power) {
  const effects = entryFor(power)
  if (!effects) return Infinity
  if (effects.attacks) return effects.attacks
  if (effects.targets === 'any') return Infinity
  return effects.targets ?? 1
}

export const POWER_EFFECT_NAMES = Object.keys(EFFECTS)

// An unused power with this reaction, on any hero: [{ hero, power }].
export function reactionsFor(heroes, reaction) {
  return heroes.flatMap((hero) =>
    hero.powers.filter((p) => !p.used && effectsOf(p).reaction === reaction).map((power) => ({ hero, power })),
  )
}

// Shadowphage (a fan hero's ability): +2 AC while in the shadows.
export const SHADOW_AC = 2

// After a power, a Shadowphage hero enters or leaves the shadows ({ shadow } in its effect).
// Into Darkness (shadowKeep) leaves them instead when it misses from the shadows.
export const shadowKept = (hero, effects, missed) => Boolean(effects.shadowKeep && missed && hero?.tokens?.shadow)
export function shadowAfter(hero, effects, missed = false) {
  if (effects.shadow === 'leave' || shadowKept(hero, effects, missed)) return false
  if (effects.shadow === 'enter') return true
  return Boolean(hero?.tokens?.shadow)
}

// A hero's AC with Cleric's Shield, Mirror Image and treasure items counted.
// Curses (encounter cards) can lower a hero's AC or attack rolls while they last.
const curseTotal = (hero, field) => (hero.curses ?? []).reduce((sum, curse) => sum + (curse.card?.[field] ?? 0), 0)
export const heroAttackPenalty = (hero) => curseTotal(hero, 'attackPenalty')

// Song of Courage, Melody of Defense, Centered Defense...: [{ source, casterId, attack, ac, ... }].
export const buffTotal = (hero, field) => (hero.buffs ?? []).reduce((sum, b) => sum + (b[field] ?? 0), 0)

export function heroAc(hero) {
  const tokens = hero.tokens ?? {}
  return hero.ac + buffTotal(hero, 'ac') + (hero.shieldedBy ? 2 : 0) + 2 * (tokens.mirrorImage ?? 0) + (tokens.shadow ? SHADOW_AC : 0) + itemAc(hero) - curseTotal(hero, 'acPenalty')
}

// The hit a hero could still turn into a miss: Tumbling Escape (a monster's attack) or
// Practiced Evasion (an encounter card's or trap's attack). Returns the action, or null.
export function pendingDodge(state, hero, power) {
  const reaction = effectsOf(power).reaction
  if (power.used || (reaction !== 'dodge' && reaction !== 'evade')) return null
  const last = reaction === 'dodge' ? state.turn.lastMonsterAttack : state.turn.lastEventAttack
  const flag = reaction === 'dodge' ? 'dodged' : 'evaded'
  if (!last?.results.some((r) => r.heroId === hero.id && r.hit && !r[flag])) return null
  return { type: reaction === 'dodge' ? 'DODGE_HIT' : 'EVADE_HIT', heroId: hero.id, powerId: power.id }
}
