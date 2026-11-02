import { HERO_TEMPLATES } from '../data/heroes.js'
import { heroModel, MONSTER_FIGURES, monsterModel, VILLAGER_MODELS, VILLAIN_MODELS } from './heroModels.js'

// What the #models page shows: every figure that stands on the 3D board as a 3D model
// (the box's heroes, fan heroes, and the monsters we made figures for), and the monsters
// and villains that are still flat standees with their card art.
const BOX = new Set(HERO_TEMPLATES.map((t) => t.key))
const uniqueByName = (list) => [...new Map((list ?? []).map((c) => [c.name, c])).values()]

export function galleryFigures(cards) {
  const heroes = (cards.heroes ?? []).map((h) => ({ id: `hero-${h.key}`, name: h.name, about: h.className, color: h.color, look: heroModel(h), fan: !BOX.has(h.key) }))
  const monsters = uniqueByName(cards.monsters)
  const villains = uniqueByName(cards.villains)
  return {
    heroes: heroes.filter((h) => !h.fan),
    fanHeroes: heroes.filter((h) => h.fan),
    // Every monster figure we made, even before its card is in this Pi's cards.json.
    // (MONSTER_FIGURES holds [card name words, figure file] pairs; the file is named after the monster.)
    monsters: MONSTER_FIGURES.map(([, model]) => ({ model, name: model.replace(/_/g, ' ') })).map(({ model, name }) => ({
      id: `monster-${name}`,
      name,
      about: VILLAIN_MODELS.has(model) ? 'Villain' : VILLAGER_MODELS.has(model) ? 'Villager' : 'Monster',
      color: null,
      look: monsterModel({ name }),
    })),
    standees: [
      ...monsters.filter((m) => !monsterModel(m)).map((m) => ({ name: m.name, kind: 'Monster' })),
      ...villains.filter((v) => !monsterModel(v)).map((v) => ({ name: v.name, kind: 'Villain' })),
    ],
  }
}

// The moves to show as buttons, in a sensible order. Blender sometimes leaves a copy of a
// move behind ("Idle.001"); those are the same move, so they're left out.
const ORDER = ['Idle', 'Walking_A', '1H_Melee_Attack_Chop', '2H_Melee_Attack_Chop', '1H_Ranged_Shoot', '2H_Ranged_Shoot', 'Spellcast_Shoot', 'Throw', 'Hit_A', 'Dodge_Right', 'Cheer', 'Death_A', 'Death_A_Pose']
const LABELS = {
  Idle: 'Stand',
  Walking_A: 'Walk',
  '1H_Melee_Attack_Chop': 'Swing (one hand)',
  '2H_Melee_Attack_Chop': 'Swing (two hands)',
  '1H_Ranged_Shoot': 'Shoot (one hand)',
  '2H_Ranged_Shoot': 'Shoot (two hands)',
  Spellcast_Shoot: 'Cast a spell',
  Throw: 'Throw',
  Hit_A: 'Get hit',
  Dodge_Right: 'Dodge',
  Cheer: 'Cheer',
  Death_A: 'Fall down',
  Death_A_Pose: 'Lie down',
}
export const LOOPING = new Set(['Idle', 'Walking_A', 'Death_A_Pose'])

export function galleryMoves(names) {
  const real = names.filter((n) => !/\.\d{3}$/.test(n))
  const rank = (n) => (ORDER.includes(n) ? ORDER.indexOf(n) : ORDER.length)
  return real.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).map((name) => ({ name, label: LABELS[name] ?? name.replace(/_/g, ' ') }))
}
