import { DEFAULT_COLORS, SWATCHES } from '../data/forge.js'
import { PARTS, SLOTS } from './parts.js'

// Ready-made figures to start from, and the 🎲 button's surprise figure.

const pick = (id, shape = {}) => ({ id, shape })

export const STARTERS = [
  {
    name: 'Knight',
    size: 1,
    colors: { ...DEFAULT_COLORS, outfit: '#2563eb', trim: '#eab308' },
    parts: { body: pick('armor'), legs: pick('armored-legs'), arms: pick('armored'), head: pick('human'), hat: pick('knight-helm', { crest: 1 }), hand: pick('sword'), offhand: pick('kite-shield'), back: pick('cape') },
  },
  {
    name: 'Wizard',
    size: 1,
    colors: { ...DEFAULT_COLORS, outfit: '#7c3aed', trim: '#facc15', magic: '#38bdf8', hair: '#e5e7eb' },
    parts: { body: pick('robe'), legs: pick('trousers'), arms: pick('wizard-sleeves'), head: pick('human'), hat: pick('wizard-hat'), hand: pick('staff'), offhand: pick('spellbook') },
  },
  {
    name: 'Lizard warrior',
    size: 1,
    colors: { ...DEFAULT_COLORS, skin: '#4d7c3a', outfit: '#92400e', trim: '#f97316', eyes: '#facc15' },
    parts: { body: pick('scales'), legs: pick('beast-legs'), arms: pick('claws'), head: pick('lizard'), hand: pick('spear'), offhand: pick('round-shield'), tail: pick('dragon-tail') },
  },
  {
    name: 'Skeleton',
    size: 1,
    colors: { ...DEFAULT_COLORS, outfit: '#3f3f46', metal: '#71717a', magic: '#22c55e' },
    parts: { body: pick('leather'), legs: pick('bone-legs'), arms: pick('bones'), head: pick('skull'), hat: pick('crown'), hand: pick('scythe') },
  },
  {
    name: 'Orc brute',
    size: 1.1,
    colors: { ...DEFAULT_COLORS, skin: '#7fbf5a', outfit: '#52525b', wood: '#6b4226', trim: '#dc2626' },
    parts: { body: pick('brute'), legs: pick('trousers'), arms: pick('muscly'), head: pick('orc'), hat: pick('mohawk'), hand: pick('battle-axe'), back: pick('back-spikes') },
  },
]

export const DEFAULT_RECIPE = { ...STARTERS[0], name: 'My hero' }

// A surprise figure: a random part in each slot (sometimes none in the extra slots), with
// its sliders nudged and random colors.
export function randomRecipe(random = Math.random) {
  const any = (list) => list[Math.floor(random() * list.length)]
  const parts = {}
  for (const slot of SLOTS) {
    if (slot.optional && random() < 0.3) continue
    const part = any(PARTS[slot.key])
    const shape = {}
    for (const { key, min, max, value } of part.shape ?? []) {
      const v = value + (random() - 0.5) * 0.6 * (max - min)
      shape[key] = Math.round(Math.min(max, Math.max(min, v)) * 100) / 100
    }
    parts[slot.key] = { id: part.id, shape }
  }
  const colors = { ...DEFAULT_COLORS }
  for (const key of Object.keys(colors)) if (key !== 'eyes') colors[key] = any(SWATCHES)
  return { name: 'Surprise hero', size: 1, colors, parts }
}
