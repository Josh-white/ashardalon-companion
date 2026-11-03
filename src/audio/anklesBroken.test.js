import { describe, expect, it } from 'vitest'
import { ANKLES_ODDS, allMissed, anklesBroken } from './anklesBroken.js'
import { momentSounds } from './sfx.js'

const miss = (id) => ({ id, at: Date.now(), kind: 'roll', title: 'Keyleth: Sure Strike!', rolls: [{ monsterId: 'm1', label: 'Snake', value: 4, hit: false }] })
const ids = Array.from({ length: 4000 }, (_, i) => `moment-${(1700000000000 + i * 977).toString(36)}-${i.toString(36)}`)

describe('ankles broken', () => {
  it('only counts attacks where every die missed', () => {
    expect(allMissed(miss('a'))).toBe(true)
    expect(allMissed({ rolls: [{ hit: false }, { hit: true }] })).toBe(false)
    expect(allMissed({ kind: 'roll', value: 7 })).toBe(false)
    const hit = (id) => ({ ...miss(id), rolls: [{ monsterId: 'm1', label: 'Snake', value: 18, hit: true }] })
    expect(ids.some((id) => anklesBroken(hit(id)))).toBe(false)
  })

  it('happens about once in ANKLES_ODDS misses, the same on every screen', () => {
    const broken = ids.filter((id) => anklesBroken(miss(id)))
    expect(broken.length).toBeGreaterThan(4000 / ANKLES_ODDS / 2)
    expect(broken.length).toBeLessThan((4000 / ANKLES_ODDS) * 2)
    for (const id of broken) expect(anklesBroken(miss(id))).toBe(true)
  })

  it('plays a bone crack in place of the miss sound, for heroes and monsters', () => {
    const id = ids.find((i) => anklesBroken(miss(i)))
    const sounds = momentSounds(miss(id)).map(([s]) => s)
    expect(sounds).toContain('bonecrack')
    expect(sounds).not.toContain('whoosh')
    const monster = { id, at: Date.now(), kind: 'monster', title: 'Snake attacks', rolls: [{ heroId: 'h1', value: 3, hit: false }] }
    expect(momentSounds(monster).map(([s]) => s)).toContain('bonecrack')
    const plain = ids.find((i) => !anklesBroken(miss(i)))
    expect(momentSounds(miss(plain)).map(([s]) => s)).not.toContain('bonecrack')
  })
})
