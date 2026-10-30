// Where a hero's numbers come from, so the players can see what is helping and what is
// hurting: the hero card, items, other heroes' powers, curses and conditions.
// A part is { label, value, kind, note }. kind: 'card', 'item', 'power', 'curse', 'condition',
// or 'off' (an item that adds nothing right now: only the best item bonus counts).
// The totals match what the rest of the app uses (heroAc, moveSpeed, the attack roll).
import { heroItems, itemAttackParts } from './items.js'

const inPlay = (hero) => heroItems(hero).filter((item) => item.card?.inPlay)
const has = (hero, condition) => (hero.conditions ?? []).includes(condition)
const sum = (parts) => parts.reduce((total, part) => total + (part.value ?? 0), 0)
const curseParts = (hero, field) =>
  (hero.curses ?? []).filter((c) => c.card?.[field]).map((c) => ({ label: c.name, value: -c.card[field], kind: 'curse' }))

// AC, as heroAc works it out. heroes: the party, to name whose Cleric's Shield it is.
export function acParts(hero, heroes = []) {
  const tokens = hero.tokens ?? {}
  const parts = [{ label: 'Starting AC', value: hero.ac, kind: 'card' }]
  // Blessed Shield guards its owner too.
  const acOf = (item) => Math.max(item.card.acBonus ?? 0, item.card.tileAcBonus ?? 0)
  const guards = inPlay(hero).filter((item) => acOf(item) > 0)
  const best = guards.reduce((top, item) => (!top || acOf(item) > acOf(top) ? item : top), null)
  for (const item of guards) {
    parts.push(item === best ? { label: item.name, value: acOf(item), kind: 'item' } : { label: item.name, value: 0, kind: 'off', note: 'Only your best item AC bonus counts.' })
  }
  if (hero.shieldedBy) {
    const caster = heroes.find((h) => h.id === hero.shieldedBy)
    parts.push({ label: caster ? `${caster.name}'s Cleric's Shield` : "Cleric's Shield", value: 2, kind: 'power' })
  }
  if (tokens.mirrorImage > 0) parts.push({ label: `Mirror Image (${tokens.mirrorImage})`, value: 2 * tokens.mirrorImage, kind: 'power', note: 'A miss pops one.' })
  parts.push(...curseParts(hero, 'acPenalty'))
  return { total: sum(parts), parts }
}

// Speed, as the virtual board moves the hero: items add up, Slowed caps it at 2.
export function speedParts(hero) {
  const parts = [{ label: 'Starting speed', value: hero.speed ?? 6, kind: 'card' }]
  for (const item of inPlay(hero).filter((i) => i.card.speedBonus)) parts.push({ label: item.name, value: item.card.speedBonus, kind: 'item' })
  const walked = sum(parts)
  if (has(hero, 'Slowed') && walked > 2) parts.push({ label: 'Slowed', value: 2 - walked, kind: 'condition', note: 'Slowed heroes move only 2 squares.' })
  if (has(hero, 'Immobilized')) parts.push({ label: 'Immobilized', value: 0, kind: 'condition', note: "Can't move until it ends." })
  return { total: sum(parts), parts }
}

// What items and curses add to the hero's attacks against a monster next to them (the usual
// case), with notes for bonuses that only count at some distances.
export function attackParts(hero) {
  const items = itemAttackParts(hero, 'adjacent')
  const far = itemAttackParts(hero, 'within1')
  const parts = []
  if (items.attack) {
    const item = heroItems(hero).find((i) => i.name === items.attack.label)
    const notes = [
      item?.card.attackRange === 'adjacent' && 'Only against a monster next to you.',
      item?.card.attackRange === 'within1' && 'Against a monster within 1 tile.',
      item?.card.stillBonus && `+${item.card.stillBonus} more if you don't move this Hero Phase.`,
    ].filter(Boolean)
    parts.push({ label: items.attack.label, value: items.attack.value, kind: 'item', note: notes.join(' ') || undefined })
  }
  // A bonus that only reaches farther (Staff of the Elements) still counts out there.
  for (const off of items.unused) {
    const reachesFar = far.attack?.label === off.label
    parts.push({
      label: off.label,
      value: 0,
      kind: 'off',
      note: reachesFar ? 'Counts instead against a monster within 1 tile.' : 'Only your best item attack bonus counts.',
    })
  }
  parts.push(...curseParts(hero, 'attackPenalty'))
  const damage = items.damage.map((d) => ({ ...d, kind: 'item', note: 'Only against a monster next to you.' }))
  const crits = items.crits.map((c) => ({ label: c.label, value: 1, kind: 'item', from: c.from, note: `Roll ${c.from === 20 ? 'a 20' : `${c.from} or more`}: +1 damage.` }))
  return { total: sum(parts), parts, damage: sum(damage), damageParts: [...damage, ...crits] }
}

// Everything helping or hurting a hero right now, as short badges for the projector and the
// Party tab: [{ text, good }]. Items that add nothing are left out.
export function heroBadges(hero, heroes = []) {
  const plus = (n) => (n > 0 ? `+${n}` : `${n}`)
  const badges = []
  const stat = (parts, word) => {
    for (const p of parts) if (p.kind !== 'card' && p.kind !== 'off' && p.value) badges.push({ text: `${plus(p.value)} ${word} ${p.label}`, good: p.value > 0 })
  }
  stat(acParts(hero, heroes).parts, 'AC')
  stat(attackParts(hero).parts, 'hit')
  for (const p of attackParts(hero).damageParts) badges.push({ text: p.from ? `+1 dmg on ${p.from}+ ${p.label}` : `+${p.value} dmg ${p.label}`, good: true })
  stat(speedParts(hero).parts.filter((p) => p.kind === 'item'), 'speed')
  for (const item of inPlay(hero).filter((i) => i.card.trapBonus)) badges.push({ text: `+${item.card.trapBonus} traps ${item.name}`, good: true })
  const tokens = hero.tokens ?? {}
  if (tokens.invisible) badges.push({ text: 'Invisible', good: true })
  if (tokens.refuge) badges.push({ text: 'Astral Refuge', good: true })
  for (const condition of hero.conditions ?? []) badges.push({ text: condition, good: false })
  for (const curse of hero.curses ?? []) if (!curse.card?.acPenalty && !curse.card?.attackPenalty) badges.push({ text: `Curse: ${curse.name}`, good: false })
  return badges
}
