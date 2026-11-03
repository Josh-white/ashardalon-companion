// The 🛠️ Hero Builder's saved figures. A figure is a small "recipe": which part sits in
// each slot, how each part's shape sliders are set, and the figure's colors. The iPad
// builds the 3D figure from it (src/forge/figure.js), so building costs nothing, and the
// Pi only keeps the recipes (server/forge.js, cards/workshop/figures.json).
//
// The Pi checks the recipe's shape, not the part names: a new part added to
// src/forge/parts.js works without changing the server, and an old recipe that names a
// part that's gone just leaves that slot empty.

export const MAX_FIGURES = 300
export const MAX_NAME_LENGTH = 40

// The colors every part paints with. `magic` glows.
export const COLOR_ROLES = [
  { key: 'skin', label: 'Skin' },
  { key: 'hair', label: 'Hair' },
  { key: 'outfit', label: 'Clothes' },
  { key: 'trim', label: 'Trim' },
  { key: 'metal', label: 'Metal' },
  { key: 'wood', label: 'Wood & leather' },
  { key: 'magic', label: 'Magic glow' },
  { key: 'eyes', label: 'Eyes' },
]

export const DEFAULT_COLORS = {
  skin: '#e0ac7e',
  hair: '#5b3716',
  outfit: '#2563eb',
  trim: '#eab308',
  metal: '#a1a1aa',
  wood: '#7c4a21',
  magic: '#38bdf8',
  eyes: '#18181b',
}

// Quick picks for the color tab; any color can be picked too.
export const SWATCHES = [
  '#f5d0b0', '#e0ac7e', '#a96f45', '#6b4226', '#7fbf5a', '#4d7c3a', '#8aa0b8',
  '#dc2626', '#f97316', '#eab308', '#16a34a', '#0d9488', '#2563eb', '#9333ea',
  '#ec4899', '#92400e', '#a1a1aa', '#52525b', '#18181b', '#f4f4f5', '#38bdf8', '#fb7185',
]

export const MIN_SIZE = 0.6
export const MAX_SIZE = 1.6
// How far any shape slider can go (1 is the part's normal shape).
export const MIN_SHAPE = 0
export const MAX_SHAPE = 10

const ID = /^[a-z0-9-]{1,40}$/
const KEY = /^[a-zA-Z0-9]{1,20}$/
const HEX = /^#[0-9a-fA-F]{6}$/
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '')

// A recipe tidied up for saving: unknown fields dropped, numbers kept in range.
export function cleanRecipe(body = {}) {
  const colors = {}
  for (const { key } of COLOR_ROLES) colors[key] = HEX.test(body.colors?.[key] ?? '') ? body.colors[key].toLowerCase() : DEFAULT_COLORS[key]
  const parts = {}
  for (const [slot, pick] of Object.entries(body.parts ?? {}).slice(0, 20)) {
    if (!KEY.test(slot) || !ID.test(pick?.id ?? '')) continue
    const shape = {}
    for (const [k, v] of Object.entries(pick.shape ?? {}).slice(0, 12)) {
      if (KEY.test(k) && typeof v === 'number' && Number.isFinite(v)) shape[k] = Math.round(clamp(v, MIN_SHAPE, MAX_SHAPE) * 100) / 100
    }
    parts[slot] = { id: pick.id, shape }
  }
  const size = typeof body.size === 'number' && Number.isFinite(body.size) ? clamp(body.size, MIN_SIZE, MAX_SIZE) : 1
  return {
    v: 1,
    name: text(body.name, MAX_NAME_LENGTH) || 'My hero',
    from: text(body.from, MAX_NAME_LENGTH),
    size: Math.round(size * 100) / 100,
    colors,
    parts,
  }
}

const playerKey = (name) => (typeof name === 'string' ? name.trim().toLowerCase() : '')

// Each player's Hero Builder figure that they turned on ("🎮 Use in the game"), for the 3D
// board: { "colton": { recipe } }, from /forge.json's list (newest first). One per player.
export function builderFigures(figures = []) {
  const out = {}
  for (const f of figures) {
    const key = playerKey(f.recipe?.from)
    if (!key || out[key] || !f.useInGame) continue
    out[key] = { recipe: f.recipe }
  }
  return out
}
