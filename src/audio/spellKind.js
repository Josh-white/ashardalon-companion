// Which kind of magic (or plain weapon) a hero's attack is, from the power's name. Kept
// apart from sfx.js so the game's rules (and the Pi's server) can use it without audio.
import { heroTemplates } from '../data/heroes.js'

// The sound a power makes as it's cast, from words in its name, or failing that from
// the hero who used it (Heskan's powers are magic, Quinn's are holy). Null for a plain
// weapon swing, which keeps the sword clang.
const SPELL_WORDS = [
  ['fire', /flam|fire|burn|scorch|breath|blaze/],
  ['frost', /frost|ice\b|icy|cold|freez/],
  ['zap', /lightning|shock|spark/],
  ['boom', /thunder/],
  ['psychic', /fear|hypno|daze|dread|mind/],
  ['holy', /holy|sacred|smite|divine|radiant|righteous|hymn|bless/],
  ['arcane', /missile|spectral|arcane|magic|force|ray\b/],
  ['arrow', /shot|arrow|bow\b|sling/],
]
// Powers whose sound JJ picked by name, where the words alone would pick another.
export const POWER_SPELLS = {
  'blade barrier': 'arcane',
  'spectral ram': 'arcane',
  'cause fear': 'psychic',
  hypnotism: 'psychic',
  'clerics shield': 'holy',
  'divine challenge': 'holy',
  'righteous advance': 'holy',
}
export const powerKey = (name = '') => name.toLowerCase().replace(/[^a-z ]/g, '').trim()

export function spellKind(title = '') {
  // A hero attack's title is "Hero: Power name!".
  const [heroName, power = ''] = title.split(': ')
  const lower = power.toLowerCase()
  if (POWER_SPELLS[powerKey(power)]) return POWER_SPELLS[powerKey(power)]
  const match = SPELL_WORDS.find(([, words]) => words.test(lower))
  if (match) return match[0]
  // Otherwise the hero's own kind of magic (Heskan's arcane, Quinn's holy), from their template.
  return heroTemplates().find((h) => h.name === heroName)?.spellSound ?? null
}
