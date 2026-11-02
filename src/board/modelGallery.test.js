import { describe, expect, it } from 'vitest'
import { HERO_TEMPLATES } from '../data/heroes.js'
import { galleryFigures, galleryMoves } from './modelGallery.js'

describe('3D figures page', () => {
  const cards = {
    heroes: [...HERO_TEMPLATES, { key: 'monk', name: 'Darna', className: 'Human Monk', color: 'teal' }],
    monsters: [{ name: 'Orc Smasher' }, { name: 'Orc Smasher' }, { name: 'Orc Archer' }, { name: 'Gibbering Mouther' }],
    villains: [{ name: 'Otyugh' }],
  }
  it('splits box heroes, fan heroes, 3D monsters and standees', () => {
    const g = galleryFigures(cards)
    expect(g.heroes.map((h) => h.name)).toEqual(HERO_TEMPLATES.map((t) => t.name))
    expect(g.fanHeroes.map((h) => [h.name, h.look.model])).toEqual([['Darna', 'Rogue']])
    expect(g.monsters.map((m) => m.look.model)).toEqual([
      'Orc_Smasher',
      'Orc_Archer',
      'Kobold_Dragonshield',
      'Human_Cultist',
      'Duergar_Guard',
      'Snake',
      'Cave_Bear',
      'Legion_Devil',
      'Grell',
    ])
    expect(g.standees).toEqual([{ name: 'Gibbering Mouther', kind: 'Monster' }, { name: 'Otyugh', kind: 'Villain' }])
  })
  it("orders the moves and skips Blender's leftover copies", () => {
    const moves = galleryMoves(['Hit_A', 'Idle.001', 'Walking_A', 'Idle', 'Hit_A.001'])
    expect(moves.map((m) => m.label)).toEqual(['Stand', 'Walk', 'Get hit'])
  })
})
