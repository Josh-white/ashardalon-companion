import { describe, expect, it } from 'vitest'
import { withPlayerFigure } from './useWorkshopFigures.js'
import { boardFigures } from '../board/scene3d.js'

describe('player figures on the 3D board', () => {
  const own = { colton: { url: '/workshop/x/model-4.glb', tweaks: { size: 0.95, head: 0.9, body: 1, colors: { 9: '#18181b' } } } }
  it("gives a hero its player's own figure, whatever hero they picked", () => {
    const hero = { id: 'h1', kind: 'hero', player: ' Colton ', model: { model: 'Knight', gear: ['1H_Sword'], height: 1 } }
    expect(withPlayerFigure(hero, own).model).toEqual({ url: '/workshop/x/model-4.glb', tweaks: own.colton.tweaks, gear: [], height: 1 })
  })
  it('leaves other heroes and monsters alone', () => {
    const easton = { id: 'h2', kind: 'hero', player: 'Easton', model: { model: 'Knight' } }
    const monster = { id: 'm', kind: 'monster', player: 'Colton', model: null }
    expect(withPlayerFigure(easton, own)).toBe(easton)
    expect(withPlayerFigure(monster, own)).toBe(monster)
  })
  it("carries each hero's player onto the board", () => {
    const state = { board: { tokens: { h1: [0, 0] } }, heroes: [{ id: 'h1', key: 'wizard', name: 'Ari', player: 'Colton', hp: 5 }], monsters: [], villains: [], turn: { heroIndex: 0 } }
    expect(boardFigures(state)[0].player).toBe('Colton')
  })
})
