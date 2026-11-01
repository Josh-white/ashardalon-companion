// The hero coach: a veteran for each hero in the box who tells a player new to that hero
// what the hero is good at, in a minute or less. Our own words, not card text. Each coach
// has a voice of their own on the Pi (server/narrator.js DEFAULT_VOICES, coach_<hero>),
// and the whole speech is one recorded line, so it plays without ElevenLabs once recorded.
export const COACHES = {
  cleric: {
    // The one tip on the hero cheat card (HeroCheatCard.jsx).
    tip: 'Stay close to your friends. Your healing only reaches heroes on your tile.',
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
    tip: 'Walk in first. Your tough armor is made for the front of the party.',
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
    tip: 'Stand next to the scariest monster so it fights you, not your friends.',
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
    tip: "Hit and run. Attack, then move away before the monster's turn.",
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
    tip: 'Stay a tile back. Your spells reach far, and you have the fewest hit points.',
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

const plain = (s) => s.toLowerCase().replace(/[^a-z]/g, '')

// A power in the coach's own plain words, for the hero cheat card: the coach's tip that
// names the power, or null when the coach doesn't talk about it (homebrew heroes and
// powers the coach skips show the card text instead).
export function coachPowerHint(heroKey, powerName) {
  const name = plain(powerName ?? '')
  if (!name) return null
  return coachFor(heroKey)?.tips.find((tip) => plain(tip).includes(name)) ?? null
}

// What each coach says while the computer plays their hero (src/ally/): taking the hero
// over, handing it back, asking the players for a hand, and cheering a monster defeated.
// Set lines with the hero's name, so the Pi records each once (audio/script.js).
export const ALLY_LINES = {
  cleric: {
    take: '[warm] Rest now, child. I will guide Quinn for a while.',
    back: '[warm] Quinn is yours again, child. Walk in the light.',
    help: '[gentle] Child, Quinn needs your help with this one. Tap for Quinn, please.',
    defeat: '[warm, proud] Well done, Quinn! The light is with you.',
  },
  fighter: {
    take: '[gruff] Take a breather, recruit! Sergeant Brumm has Vistra from here.',
    back: '[gruff] Back on your feet, recruit! Vistra is all yours.',
    help: '[gruff] Recruit! Vistra needs a hand with this step. Tap it!',
    defeat: "[gruff, proud] That's how it's done, Vistra! Next!",
  },
  paladin: {
    take: '[noble] Rest, friend. I will stand with Keyleth until you return.',
    back: '[noble] Keyleth answers to you again. Be brave.',
    help: '[noble] Friend, Keyleth needs your help here. Choose for us.',
    defeat: '[noble, triumphant] For the silver order! Well struck, Keyleth!',
  },
  rogue: {
    take: "[sly] Psst. Go grab a snack. I'll keep Tarak out of trouble.",
    back: "[sly] Tarak's back in your hands. Don't tell anyone I helped.",
    help: "[sly, whispering] Psst! Tarak's stuck. Give this step a tap for me?",
    defeat: '[sly, delighted] Ha! They never saw Tarak coming.',
  },
  wizard: {
    take: "[wise] Rest your mind. I shall guide Heskan's spells a while.",
    back: "[wise] Heskan's magic returns to you. Use it well.",
    help: '[wise, curious] Hmm. Heskan needs a wiser head for this step. Tap for us, please.',
    defeat: "[wise, pleased] Splendid! Heskan's magic prevails.",
  },
}

// One of those lines in the coach's voice, or null (a homebrew hero has no coach).
export const allyLine = (heroKey, when) => {
  const text = ALLY_LINES[heroKey]?.[when]
  return text ? { voice: `coach_${heroKey}`, text } : null
}
