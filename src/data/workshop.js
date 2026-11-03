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
//   loved    the player loves it, and can turn on "Use it in the game"
//   inGame   it's their hero's figure on the 3D board
export function workshopStatus(request) {
  if (request.inGame) return 'inGame'
  const rounds = request.rounds ?? []
  if (!rounds.length) return 'waiting'
  const answer = (request.answers ?? []).find((a) => a.round === rounds.length)
  if (!answer) return 'look'
  if (!answer.love) return 'fixing'
  return request.useInGame && lovedRound(request)?.model ? 'inGame' : 'loved'
}

// The round of pictures the player loved (its 3D model is the one that goes in the game).
export function lovedRound(request) {
  const loved = (request.answers ?? []).filter((a) => a.love).at(-1)
  return loved ? (request.rounds ?? [])[loved.round - 1] ?? null : null
}

// The name a figure follows: whoever plays with that name gets it as their hero.
export const playerKey = (name) => (typeof name === 'string' ? name.trim().toLowerCase() : '')

// Each player's own figure, for the 3D board: { "colton": { url, tweaks } }, from the
// workshop's requests (newest first, as /workshop.json lists them). Only loved models the
// player turned on, and only one per player (the newest).
export function playerFigures(requests = []) {
  const out = {}
  for (const r of requests) {
    const key = playerKey(r.from)
    const round = lovedRound(r)
    if (!key || out[key] || !r.useInGame || !round?.model) continue
    out[key] = { url: `/workshop/${r.id}/${round.model}`, tweaks: cleanTweaks(r.tweaks) }
  }
  return out
}

export const STATUS_TEXT = {
  waiting: { badge: '⏳ Sent, being built', line: 'Sent! Building it takes time (it can take a day or two). The pictures will show up here.' },
  look: { badge: '📸 Pictures!', line: 'Your model is ready to look at. Do you love it?' },
  fixing: { badge: '🔨 Fixing', line: 'Claude is making your changes. New pictures come here.' },
  loved: { badge: '❤️ Loved', line: 'You love it! Turn on "Use it in the game" to play with it.' },
  inGame: { badge: '🎉 In the game', line: "It's your hero's figure on the 3D board!" },
}

// The 🎨 Tweak panel: changes a player makes to their own figure in the browser, with no
// new build. Saved with the request, so Claude bakes them in when it goes in the game.
export const TWEAK_SLIDERS = [
  { key: 'size', label: 'Size', min: 0.8, max: 1.25, step: 0.05 },
  { key: 'head', label: 'Head', min: 0.8, max: 1.3, step: 0.05 },
  { key: 'body', label: 'Body', min: 0.8, max: 1.2, step: 0.05 },
]
export const NO_TWEAKS = { size: 1, head: 1, body: 1, colors: {} }
const HEX = /^#[0-9a-f]{6}$/

// Tweaks a screen sent, tidied: sliders kept in range, colours as { paletteSlot: "#rrggbb" }.
export function cleanTweaks(t = {}) {
  const out = { ...NO_TWEAKS, colors: {} }
  for (const { key, min, max } of TWEAK_SLIDERS) {
    const n = Number(t?.[key])
    if (Number.isFinite(n)) out[key] = Math.round(Math.min(max, Math.max(min, n)) * 100) / 100
  }
  const colors = t?.colors && typeof t.colors === 'object' ? t.colors : {}
  for (const [slot, hex] of Object.entries(colors).slice(0, 64)) {
    const i = Number(slot)
    if (Number.isInteger(i) && i >= 0 && i < 256 && typeof hex === 'string' && HEX.test(hex.toLowerCase())) out.colors[i] = hex.toLowerCase()
  }
  return out
}

// The palette slots a figure's mesh really uses, most-used first: each part's colour comes
// from one square of a strip of colour squares (scripts/models/make-monsters.py), picked by
// its texture's u. `uvs` is the mesh's uv numbers (u, v, u, v, …), `slots` how many squares.
export function usedSlots(uvs, slots) {
  const counts = new Map()
  for (let i = 0; i < uvs.length; i += 2) {
    const slot = Math.min(slots - 1, Math.max(0, Math.floor(uvs[i] * slots)))
    counts.set(slot, (counts.get(slot) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([slot]) => slot)
}

// How big to make each bone for the sliders. The head hangs off the body, so it's divided by
// the body's size to grow on its own.
export function boneScales(tweaks) {
  const t = { ...NO_TWEAKS, ...tweaks }
  return { body: t.body, head: t.head / t.body }
}
