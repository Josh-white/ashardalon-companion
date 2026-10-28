import { describe, expect, it } from 'vitest'
import { DIE_LANDS_MS, changeSounds, hurtSound, momentSoundMs, momentSounds, monsterVoice, spellKind, tileRevealed } from './sfx.js'

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
    expect(names(heroAttack([[14, true]]))).toEqual(['dice', 'clang', 'hurt'])
    expect(names(heroAttack([[5, false]]))).toEqual(['dice', 'whoosh'])
    expect(names(heroAttack([[1, false]]))).toEqual(['dice', 'trombone'])
    expect(names(heroAttack([[20, false], [3, false]], 'crit'))).toEqual(['dice', 'fanfare'])
    expect(names(heroAttack([[1, false], [15, true]]))).toEqual(['dice', 'clang', 'hurt'])
  })

  it('adds a victory tune when the attack defeats a monster', () => {
    expect(names(heroAttack([[17, true]], 'defeat'))).toEqual(['dice', 'clang', 'hurt', 'victory'])
  })

  it('thuds when a monster hits a hero, after the die lands', () => {
    expect(names(monsterAttack([[15, true]]))).toEqual(['dice', 'thud'])
    expect(names(monsterAttack([[20, false], [2, false]]))).toEqual(['dice', 'whoosh'])
    expect(names(monsterAttack([[18, true]], 'monster-down'))).toEqual(['dice', 'thud', 'down'])
  })

  it('lets the die roll alone, then plays one sound after another', () => {
    const sounds = momentSounds({ kind: 'defeat', title: 'Heskan: Ray of Frost!', rolls: [{ monsterId: 'b', label: 'Cave Bear', value: 16, hit: true }] })
    expect(sounds.map(([s]) => s)).toEqual(['dice', 'frost', 'hurt-big', 'victory'])
    const starts = sounds.map(([, at]) => at)
    expect(starts[1]).toBe(DIE_LANDS_MS)
    for (let i = 2; i < starts.length; i++) expect(starts[i]).toBeGreaterThan(starts[i - 1])
  })

  it('gives each moment without dice its own sound', () => {
    expect(names({ kind: 'spawn', title: 'The Throne Room!' })).toEqual(['roar'])
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

describe('monster sounds', () => {
  it('gives each monster its own sound when drawn', () => {
    expect(names({ kind: 'spawn', title: 'A Cave Bear appears!' })).toEqual(['bear'])
    expect(names({ kind: 'spawn', title: '2 Snakes appear!' })).toEqual(['hiss'])
    expect(monsterVoice('An Orc Archer appears!')).toBe('bow')
    expect(monsterVoice('Ashardalon, the Red Dragon appears!')).toBe('dragon')
    expect(monsterVoice('The Kobold Dragonlord is enraged!')).toBe('dragonlord')
    expect(monsterVoice('A Kobold Dragonshield appears!')).toBe('kobold')
  })

  it('roars for anything it does not know', () => {
    expect(monsterVoice('A Beholder appears!')).toBe('roar')
    expect(monsterVoice()).toBe('roar')
  })

  it('lets the narrator wait for the monster sound', () => {
    expect(momentSoundMs({ kind: 'spawn', title: 'A Cave Bear appears!' })).toBe(2000)
  })
})

describe('new tile music', () => {
  const game = (turn) => ({ status: 'playing', turn: { explored: false, tiles: {}, ...turn } })

  it('plays when the hero explores', () => {
    expect(tileRevealed(game({}), game({ explored: true }))).toBe(true)
  })

  it('plays when the tile tracker turns over a tile', () => {
    expect(tileRevealed(game({}), game({ tiles: { chamber: 'tile-3' } }))).toBe(true)
    const drawn = game({ explored: true, tiles: { explore: 'tile-1' } })
    expect(tileRevealed(drawn, { ...drawn })).toBe(false)
  })

  it('stays quiet when the stack is empty, on reconnect and outside the game', () => {
    expect(tileRevealed(game({}), game({ tiles: { explore: 'none' } }))).toBe(false)
    expect(tileRevealed(null, game({ explored: true }))).toBe(false)
    expect(tileRevealed({ ...game({}), status: 'setup' }, game({ explored: true }))).toBe(false)
  })
})

describe('spell and hurt sounds', () => {
  const cast = (title, rolls) => ({ kind: 'roll', title, rolls: rolls.map(([value, hit, label = 'Cave Bear']) => ({ monsterId: label, label, value, hit })) })

  it('knows a spell from its name, or from the hero who cast it', () => {
    expect(spellKind('Heskan: Ray of Frost!')).toBe('frost')
    expect(spellKind('Heskan: Arc Lightning!')).toBe('zap')
    expect(spellKind('Heskan: Hurled Breath!')).toBe('fire')
    expect(spellKind('Quinn: Sacred Flame!')).toBe('fire')
    expect(spellKind('Keyleth: Holy Strike!')).toBe('holy')
    expect(spellKind('Quinn: Cause Fear!')).toBe('psychic')
    expect(spellKind('Tarak: Positioning Shot!')).toBe('arrow')
    expect(spellKind('Heskan: Wizard Eye!')).toBe('arcane')
    expect(spellKind('Vistra: Reaping Strike!')).toBe(null)
    expect(spellKind('Inspiring Advice: Hit!')).toBe(null)
  })

  it('casts once the die lands, then the monster yelps on a hit', () => {
    expect(names(cast('Heskan: Ray of Frost!', [[15, true]]))).toEqual(['dice', 'frost', 'hurt-big'])
    expect(names(cast('Heskan: Ray of Frost!', [[4, false]]))).toEqual(['dice', 'frost', 'fizzle'])
    expect(names(cast('Heskan: Ray of Frost!', [[20, true]]))).toEqual(['dice', 'fanfare', 'frost', 'hurt-big'])
  })

  it('a sword hit clangs, then each hit monster yelps (two at most)', () => {
    const three = cast('Vistra: Reaping Strike!', [[15, true, 'Snake'], [16, true, 'Kobold Dragonshield'], [18, true, 'Grell']])
    expect(names(three)).toEqual(['dice', 'clang', 'hurt-snake', 'hurt-small'])
  })

  it('sizes each monster yelp', () => {
    expect(hurtSound('Cave Bear')).toBe('hurt-big')
    expect(hurtSound('Kobold Dragonshield')).toBe('hurt-small')
    expect(hurtSound('Snake')).toBe('hurt-snake')
    expect(hurtSound('Human Cultist')).toBe('hurt')
  })
})

describe('sounds for each change', () => {
  const playing = { status: 'playing', turn: { explored: false, tiles: {} } }
  const at = (moment) => ({ ...playing, moment: { at: Date.now(), ...moment } })

  it('plays a new moment once, and not one that is old news', () => {
    const before = at({ id: 'a', kind: 'treasure' })
    expect(changeSounds(before, at({ id: 'b', kind: 'level' })).map(([s]) => s)).toEqual(['levelup'])
    expect(changeSounds(before, before)).toEqual([])
    expect(changeSounds(null, { ...playing, moment: { id: 'c', kind: 'level', at: Date.now() - 10000 } })).toEqual([])
  })

  it('plays a sound board tap and a new tile in the same change', () => {
    const after = { ...playing, turn: { explored: true, tiles: {} }, soundboard: { last: { id: 's', sound: 'tada', at: Date.now() } } }
    expect(changeSounds(playing, after).map(([s]) => s)).toEqual(['tada', 'tile'])
  })

  it('springs a trap before it hits', () => {
    expect(names({ kind: 'monster', trap: true, rolls: [{ heroId: 'h', value: 15, hit: true }] })).toEqual(['dice', 'trap', 'thud'])
    expect(names({ kind: 'monster', trap: true })).toEqual(['trap', 'thud'])
  })
})
