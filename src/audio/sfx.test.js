import { describe, expect, it } from 'vitest'
import { DIE_LANDS_MS, momentSoundMs, momentSounds } from './sfx.js'

const names = (moment) => momentSounds(moment).map(([sound]) => sound)
const heroAttack = (rolls, kind = 'roll') => ({ kind, rolls: rolls.map(([value, hit]) => ({ monsterId: 'm', label: 'Kobold', value, hit })) })
const monsterAttack = (rolls, kind = 'monster') => ({ kind, rolls: rolls.map(([value, hit]) => ({ heroId: 'h', value, hit })) })

describe('moment sounds', () => {
  it('plays a fanfare on a natural 20 and a trombone on a 1', () => {
    expect(names({ kind: 'crit', value: 20 })).toEqual(['dice', 'fanfare'])
    expect(names({ kind: 'fumble', value: 1 })).toEqual(['dice', 'trombone'])
    expect(names({ kind: 'roll', value: 12 })).toEqual(['dice', 'land'])
  })

  it('plays the result when the die lands', () => {
    expect(momentSounds({ kind: 'roll', value: 12 })[1]).toEqual(['land', DIE_LANDS_MS])
  })

  it('clangs on a hero hit and whooshes on a miss', () => {
    expect(names(heroAttack([[14, true]]))).toEqual(['dice', 'clang'])
    expect(names(heroAttack([[5, false]]))).toEqual(['dice', 'whoosh'])
    expect(names(heroAttack([[1, false]]))).toEqual(['dice', 'trombone'])
    expect(names(heroAttack([[20, false], [3, false]], 'crit'))).toEqual(['dice', 'fanfare'])
    expect(names(heroAttack([[1, false], [15, true]]))).toEqual(['dice', 'clang'])
  })

  it('adds a victory tune when the attack defeats a monster', () => {
    expect(names(heroAttack([[17, true]], 'defeat'))).toEqual(['dice', 'clang', 'victory'])
  })

  it('growls before a monster attack and thuds when it hits a hero', () => {
    expect(names(monsterAttack([[15, true]]))).toEqual(['growl', 'dice', 'thud'])
    expect(names(monsterAttack([[20, false], [2, false]]))).toEqual(['growl', 'dice', 'whoosh'])
    expect(names(monsterAttack([[18, true]], 'monster-down'))).toEqual(['growl', 'dice', 'thud', 'down'])
  })

  it('gives each moment without dice its own sound', () => {
    expect(names({ kind: 'spawn' })).toEqual(['roar'])
    expect(names({ kind: 'down' })).toEqual(['down'])
    expect(names({ kind: 'treasure' })).toEqual(['coins'])
    expect(names({ kind: 'level' })).toEqual(['levelup'])
    expect(names({ kind: 'encounter' })).toEqual(['card'])
    expect(names({ kind: 'mystery' })).toEqual([])
    expect(names(null)).toEqual([])
  })

  it('says when the sounds are over, for the narrator', () => {
    expect(momentSoundMs({ kind: 'crit', value: 20 })).toBe(DIE_LANDS_MS + 1700)
    expect(momentSoundMs({ kind: 'spawn' })).toBe(1500)
    expect(momentSoundMs(null)).toBe(0)
  })
})
