// Bragging rights for the end-of-game recap. Every action's before and after are
// compared, so no rule in game.js has to remember to count anything. Undo puts the
// counts back with the rest of the game.

export const emptyStats = () => ({ kills: 0, xpEarned: 0, damageDealt: 0, biggestHit: 0, nat20s: 0, nat1s: 0, damageTaken: 0, downs: 0, treasure: 0 })

export const heroStats = (state, heroId) => ({ ...emptyStats(), ...(state.stats?.[heroId] ?? {}) })

// The hero who gets the credit for what happened to the monsters in this action.
function creditedHero(before, action) {
  if (action.type === 'REROLL_ATTACK') return before.turn.lastAttack?.heroId ?? null
  if (before.heroes.some((h) => h.id === action.heroId)) return action.heroId
  return before.heroes[before.turn.heroIndex]?.id ?? null
}

// The d20s a hero rolled in this action, from the big-moment screen it showed.
function heroRolls(before, after) {
  const moment = after.moment
  if (!moment || moment.id === before.moment?.id || !moment.heroId) return []
  // A monster's rolls against heroes carry heroId; a hero's against monsters carry monsterId.
  if (Array.isArray(moment.rolls)) return moment.rolls.filter((r) => r.monsterId).map((r) => ({ value: r.value, dealt: r.dealt ?? 0 }))
  return Number.isInteger(moment.value) ? [{ value: moment.value, dealt: 0 }] : []
}

export function trackStats(before, after, action) {
  if (after === before || before.status !== 'playing') return after
  const stats = { ...(before.stats ?? {}) }
  let changed = false
  const add = (heroId, change) => {
    if (!heroId) return
    const current = { ...emptyStats(), ...stats[heroId] }
    stats[heroId] = change(current)
    changed = true
  }

  // Damage taken, and heroes knocked down.
  for (const hero of after.heroes) {
    const old = before.heroes.find((h) => h.id === hero.id)
    if (!old || hero.hp >= old.hp) continue
    add(hero.id, (s) => ({ ...s, damageTaken: s.damageTaken + (old.hp - hero.hp), downs: s.downs + (hero.hp === 0 ? 1 : 0) }))
  }

  // Treasure: new item cards in a hero's hand.
  for (const hero of after.heroes) {
    const old = before.heroes.find((h) => h.id === hero.id)
    const had = new Set((old?.items ?? []).map((i) => i.id))
    const found = (hero.items ?? []).filter((i) => !had.has(i.id)).length
    if (old && found > 0) add(hero.id, (s) => ({ ...s, treasure: s.treasure + found }))
  }

  // Damage to monsters and villains, and the ones defeated.
  const credit = creditedHero(before, action)
  const foesOf = (state) => [...state.monsters, ...(state.villains ?? [])]
  const afterFoes = new Map(foesOf(after).map((m) => [m.id, m]))
  // A monster removed by mistake or turned into another one goes to the discards, not the XP pile.
  const discarded = action.type === 'REMOVE_MONSTER' || (after.monsterDeck?.discard.length ?? 0) > (before.monsterDeck?.discard.length ?? 0)
  let dealt = 0
  let kills = 0
  let xp = 0
  for (const foe of foesOf(before)) {
    if (foe.defeated) continue
    const now = afterFoes.get(foe.id)
    if (!now && discarded) continue
    const hp = now ? now.hp : 0
    if (hp < foe.hp) dealt += foe.hp - hp
    if (!now || (now.defeated && !foe.defeated)) {
      kills += 1
      xp += foe.villain ? 0 : foe.xp ?? 0
    }
  }
  if (dealt > 0 || kills > 0) add(credit, (s) => ({ ...s, damageDealt: s.damageDealt + dealt, kills: s.kills + kills, xpEarned: s.xpEarned + xp }))

  // Natural 20s and 1s, and the biggest single hit.
  const rolls = heroRolls(before, after)
  if (rolls.length > 0) {
    add(after.moment.heroId, (s) => ({
      ...s,
      nat20s: s.nat20s + rolls.filter((r) => r.value === 20).length,
      nat1s: s.nat1s + rolls.filter((r) => r.value === 1).length,
      biggestHit: Math.max(s.biggestHit, ...rolls.map((r) => r.dealt)),
    }))
  }

  return changed ? { ...after, stats } : after
}

// The awards on the recap screen, best first (the screen shows a hero's first three).
// Ties share an award, and every hero gets at least one, so nobody at the table goes
// home empty-handed.
const AWARDS = [
  { key: 'slayer', emoji: '⚔️', title: 'Monster Slayer', stat: 'kills', says: (n) => `Defeated ${n} ${n === 1 ? 'monster' : 'monsters'}` },
  { key: 'lucky', emoji: '🍀', title: 'Lucky Dice', stat: 'nat20s', says: (n) => `Rolled ${n} natural ${n === 1 ? '20' : '20s'}` },
  { key: 'hitter', emoji: '💥', title: 'Heavy Hitter', stat: 'biggestHit', says: (n) => `Biggest hit: ${n} damage` },
  { key: 'wall', emoji: '🛡️', title: 'Iron Wall', stat: 'damageTaken', says: (n) => `Took ${n} damage and kept going` },
  { key: 'treasure', emoji: '💰', title: 'Treasure Hunter', stat: 'treasure', says: (n) => `Found ${n} ${n === 1 ? 'treasure' : 'treasures'}` },
  { key: 'gremlin', emoji: '🙈', title: 'Dice Gremlin', stat: 'nat1s', says: (n) => `Rolled ${n} natural ${n === 1 ? '1' : '1s'}` },
]

const mvpScore = (s) => s.kills * 3 + s.damageDealt + s.nat20s * 2 + s.treasure

export function recap(state) {
  const heroes = state.heroes.map((hero) => ({ hero, stats: heroStats(state, hero.id), awards: [] }))
  const top = (value) => {
    const best = Math.max(0, ...heroes.map((h) => value(h.stats)))
    return best > 0 ? heroes.filter((h) => value(h.stats) === best) : []
  }

  // MVP: the most score, then kills, then damage dealt break a tie.
  let mvps = top(mvpScore)
  for (const tiebreak of [(s) => s.kills, (s) => s.damageDealt]) {
    if (mvps.length > 1) {
      const best = Math.max(...mvps.map((h) => tiebreak(h.stats)))
      mvps = mvps.filter((h) => tiebreak(h.stats) === best)
    }
  }
  for (const h of mvps) h.awards.push({ key: 'mvp', emoji: '👑', title: 'MVP', says: 'Most valuable hero of the game' })

  for (const award of AWARDS) {
    for (const h of top((s) => s[award.stat])) h.awards.push({ key: award.key, emoji: award.emoji, title: award.title, says: award.says(h.stats[award.stat]) })
  }
  // Dice Gremlin is a joke award, so a hero with only that gets a real one too.
  for (const h of heroes.filter((h) => h.awards.every((a) => a.key === 'gremlin'))) {
    h.awards.unshift(
      h.stats.downs === 0
        ? { key: 'standing', emoji: '🧍', title: 'Still Standing', says: 'Never got knocked down' }
        : { key: 'brave', emoji: '🔥', title: 'Never Gave Up', says: h.stats.downs > 1 ? `Knocked down ${h.stats.downs} times and kept fighting` : 'Knocked down and kept fighting' },
    )
  }

  const sum = (key) => heroes.reduce((total, h) => total + h.stats[key], 0)
  return {
    heroes,
    mvpIds: mvps.map((h) => h.hero.id),
    party: { rounds: state.turn.round, kills: sum('kills'), xpEarned: sum('xpEarned'), nat20s: sum('nat20s'), damageDealt: sum('damageDealt'), treasure: sum('treasure') },
  }
}
