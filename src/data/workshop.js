// The Model Workshop: a player describes a 3D figure they want in the game, Claude builds
// it in Blender (scripts/models/make-monsters.py) and sends pictures back, and the player
// taps "Love it" or asks for changes. The requests live on the Pi in cards/workshop
// (server/workshop.js); scripts/models/WORKSHOP.md says how a build gets answered.

export const MAX_IDEA_LENGTH = 1000
export const MAX_CHANGE_LENGTH = 1000
export const MAX_FROM_LENGTH = 40
// Plenty for years of models; stops a stuck button filling the Pi's disk.
export const MAX_REQUESTS = 300

export const KINDS = [
  { key: 'hero', label: '🛡️ My hero', about: "Your hero's figure on the 3D board" },
  { key: 'monster', label: '👹 A monster', about: 'Something for the heroes to fight' },
  { key: 'pet', label: '🐾 A pet or sidekick', about: 'Follows your hero around' },
]

export const COLORS = [
  { key: 'red', hex: '#dc2626' },
  { key: 'orange', hex: '#f97316' },
  { key: 'gold', hex: '#eab308' },
  { key: 'green', hex: '#16a34a' },
  { key: 'teal', hex: '#0d9488' },
  { key: 'blue', hex: '#2563eb' },
  { key: 'purple', hex: '#9333ea' },
  { key: 'pink', hex: '#ec4899' },
  { key: 'brown', hex: '#92400e' },
  { key: 'silver', hex: '#a1a1aa' },
  { key: 'black', hex: '#18181b' },
  { key: 'white', hex: '#f4f4f5' },
]
export const MAX_COLORS = 3

export const SIZES = [
  { key: 'tiny', label: 'Tiny' },
  { key: 'hero', label: 'Hero-size' },
  { key: 'big', label: 'Big' },
  { key: 'huge', label: 'HUGE' },
]

export const HOLDS = ['Sword', 'Axe', 'Hammer', 'Bow', 'Staff', 'Shield', 'Spear', 'Claws', 'Nothing']
export const ATTACKS = [
  { key: 'swing', label: '⚔️ Swings it' },
  { key: 'shoot', label: '🏹 Shoots' },
  { key: 'magic', label: '✨ Magic' },
  { key: 'bite', label: '🦷 Bites or claws' },
  { key: 'breath', label: '🔥 Breathes fire' },
]

const pick = (value, keys) => (keys.includes(value) ? value : null)
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

// What a sent request looks like once it's tidied up, or null when there's no idea in it.
export function cleanRequest(body = {}) {
  const idea = text(body.idea, MAX_IDEA_LENGTH)
  if (!idea) return null
  const colorKeys = COLORS.map((c) => c.key)
  const colors = Array.isArray(body.colors) ? [...new Set(body.colors.filter((c) => colorKeys.includes(c)))].slice(0, MAX_COLORS) : []
  return {
    idea,
    from: text(body.from, MAX_FROM_LENGTH) || null,
    kind: pick(body.kind, KINDS.map((k) => k.key)) ?? 'hero',
    colors,
    size: pick(body.size, SIZES.map((s) => s.key)),
    holds: text(body.holds, 40) || null,
    attack: pick(body.attack, ATTACKS.map((a) => a.key)),
  }
}

// Where a request is up to, from its rounds of pictures and the player's answers:
//   waiting  sent, Claude hasn't sent pictures yet
//   look     new pictures to look at
//   fixing   the player asked for changes, Claude is on it
//   loved    the player loves it; Claude puts it in the game
//   inGame   it's in the game
export function workshopStatus(request) {
  if (request.inGame) return 'inGame'
  const rounds = request.rounds ?? []
  if (!rounds.length) return 'waiting'
  const answer = (request.answers ?? []).find((a) => a.round === rounds.length)
  if (!answer) return 'look'
  return answer.love ? 'loved' : 'fixing'
}

export const STATUS_TEXT = {
  waiting: { badge: '⏳ Sent, being built', line: 'Sent! Building it takes time (it can take a day or two). The pictures will show up here.' },
  look: { badge: '📸 Pictures!', line: 'Your model is ready to look at. Do you love it?' },
  fixing: { badge: '🔨 Fixing', line: 'Claude is making your changes. New pictures come here.' },
  loved: { badge: '❤️ Loved', line: 'You love it! Claude is putting it in the game.' },
  inGame: { badge: '🎉 In the game', line: "It's in the game! Look for it on the 3D board." },
}
