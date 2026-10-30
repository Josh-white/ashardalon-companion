// The hero coach: a veteran for each hero in the box who tells a player new to that hero
// what the hero is good at, in a minute or less. Our own words, not card text. Each coach
// has a voice of their own on the Pi (server/narrator.js DEFAULT_VOICES, coach_<hero>),
// and the whole speech is one recorded line, so it plays without ElevenLabs once recorded.
export const COACHES = {
  cleric: {
    coach: 'Mother Ardra',
    role: 'High priestess of the temple',
    cue: '[warm, encouraging]',
    tips: [
      'So you will walk as Quinn. Listen well, child.',
      'You are the healer, so stay close to your friends.',
      'Healing Hymn heals you and one friend on your tile. Save it for when someone is really hurting.',
      'Sacred Flame hits a monster up to a tile away, and when it hits, someone on your tile heals too.',
      "Cleric's Shield makes a friend harder to hit.",
      'Your armor is not the thickest, so let the fighters stand in front. Go in light.',
    ],
  },
  fighter: {
    coach: 'Sergeant Brumm',
    role: 'Dwarf drill sergeant',
    cue: '[gruff, commanding]',
    tips: [
      'Vistra, eh? Good choice, recruit!',
      'You are the wall. Stand in front and let the monsters come to you. Your armor can take it.',
      'Reaping Strike attacks twice, so use it when you really need a hit.',
      'Beaten up? Dwarven Resilience heals you four, but you give up your move that turn.',
      'Inspiring Advice lets a friend roll again after they miss.',
      'Now get in there and hold the line!',
    ],
  },
  paladin: {
    coach: 'Sir Edric',
    role: 'Knight of the silver order',
    cue: '[noble, steady]',
    tips: [
      'Keyleth answers your call. A paladin protects the others.',
      'Divine Challenge pulls a monster next to you, away from your friends, and then you strike it.',
      'Holy Strike hits harder when you started your turn next to that monster, so stand your ground.',
      'Lay On Hands heals the hero next to you, and your Healing Hands makes healing surges stronger.',
      'Be brave, and keep your friends safe.',
    ],
  },
  rogue: {
    coach: 'Whisper',
    role: 'Retired thief',
    cue: '[sly, playful]',
    tips: [
      'Psst. Tarak, is it? Sneaky choice.',
      'You are quick, but your armor is thin. Hit, then get out of reach.',
      'Distracting Jab attacks and then lets you move away.',
      'Lucky Strike does extra damage when your roll is an even number.',
      'When a monster hits you, Tumbling Escape can make it miss. Save it for a big hit.',
      'Roll a natural twenty and Brutal Recovery lets you use Furious Assault again. Stay in the shadows, friend.',
    ],
  },
  wizard: {
    coach: 'Master Thessaly',
    role: 'Old wizard of the tower',
    cue: '[wise, mysterious]',
    tips: [
      'Ah, Heskan. A dragonborn wizard, with fire in his blood.',
      'You have the fewest hit points, so stay back and let your spells fly.',
      'Arc Lightning hits two monsters at once, and Ray of Frost reaches two tiles away.',
      "Hurled Breath blasts every monster on a tile, and it doesn't use up your attack.",
      'Mage Hand opens doors anywhere on your tile.',
      'Keep your distance, and the dungeon is yours.',
    ],
  },
}

export const coachFor = (heroKey) => COACHES[heroKey] ?? null

// The coach's whole speech as one narrator line, in the coach's own voice.
export const coachLine = (heroKey) => {
  const coach = coachFor(heroKey)
  return coach ? { voice: `coach_${heroKey}`, text: `${coach.cue} ${coach.tips.join(' ')}` } : null
}
