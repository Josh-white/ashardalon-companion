// Treasure items a hero holds. Each is { id, cardId, name, used, card }, with the card's
// numbers (cards.js) copied in. Items played "immediately" work while they're in play;
// the rest wait until they're used, then flip over or go to the discards.

export const heroItems = (hero) => hero?.items ?? []

// Bonuses that last while an item is in play. A flipped item (Throwing Shield after its
// throw) still gives them.
const inPlayTotal = (hero, field) => heroItems(hero).reduce((sum, item) => sum + (item.card?.inPlay ? item.card[field] ?? 0 : 0), 0)

// The best of the bonuses items in play give (Rulebook p. 13: a hero gains only one attack
// bonus and one defense bonus from items at a time).
const inPlayBest = (hero, value) => Math.max(0, ...heroItems(hero).map((item) => (item.card?.inPlay ? value(item.card) : 0)))

// Blessed Shield guards its owner too, so it counts toward the owner's own AC.
export const itemAc = (hero) => inPlayBest(hero, (card) => Math.max(card.acBonus ?? 0, card.tileAcBonus ?? 0))
export const itemSpeed = (hero) => inPlayTotal(hero, 'speedBonus')
export const itemTrapBonus = (hero) => inPlayTotal(hero, 'trapBonus')

// Other heroes whose items guard everyone on their tile: [{ hero, bonus }].
export function tileGuards(heroes, target) {
  return heroes
    .filter((h) => h.id !== target?.id)
    .map((hero) => ({ hero, bonus: inPlayTotal(hero, 'tileAcBonus') }))
    .filter((g) => g.bonus > 0)
}

// The extra AC a hero gets from standing on a guard's tile. Bonuses from two shields don't
// add up, and it's a defense bonus from an item, so it replaces the hero's own item bonus
// when it's bigger instead of adding to it.
export const tileAcBonus = (heroes, target) => Math.max(0, ...tileGuards(heroes, target).map((g) => g.bonus - itemAc(target)))

// Does a range-limited bonus count for a monster at this distance?
// distance: 'adjacent', 'within1' (on the tile or one next to it) or 'far'.
const inRange = (range, distance) => !range || (range === 'adjacent' ? distance === 'adjacent' : distance === 'adjacent' || distance === 'within1')

// What a hero's items add to one attack roll against a monster at this distance.
// stayed: the hero chose not to move this Hero Phase (Dwarven Hammer).
export function itemAttackBonus(hero, distance, stayed = false) {
  let bonus = 0
  let damage = 0
  const crits = []
  for (const item of heroItems(hero)) {
    const card = item.card
    if (!card?.inPlay) continue
    // Only the best attack bonus counts; damage bonuses still add up.
    if (card.attackBonus && inRange(card.attackRange, distance)) bonus = Math.max(bonus, card.attackBonus + (stayed ? card.stillBonus ?? 0 : 0))
    if (card.damageBonus && inRange(card.damageRange, distance)) damage += card.damageBonus
    // "A natural 19 or 20 deals +1 damage" works at any range.
    if (card.critFrom) crits.push(card.critFrom)
  }
  return { bonus, damage, crits }
}

// The questions a hero's attack needs answered for its items: how far each monster is,
// and whether the hero stayed put. Null when no item cares.
export function distanceChoices(hero) {
  const ranges = new Set(
    heroItems(hero).flatMap((item) => (item.card?.inPlay ? [item.card.attackRange, item.card.damageRange] : [])).filter(Boolean),
  )
  if (ranges.size === 0) return null
  return ranges.has('within1') ? ['adjacent', 'within1', 'far'] : ['adjacent', 'far']
}

export const asksIfStayed = (hero) => heroItems(hero).some((item) => item.card?.inPlay && item.card.stillBonus > 0)

// Items that can make their own attack roll (Crossbow of Speed, Ring of Shooting Stars).
export const attackItems = (hero) => heroItems(hero).filter((item) => item.card?.attack && !item.used)

// Unused items with this use, on any hero: [{ hero, item }].
export function itemsWithUse(heroes, use) {
  return heroes.flatMap((hero) => heroItems(hero).filter((item) => !item.used && item.card?.use === use).map((item) => ({ hero, item })))
}

// How far an attack bonus reaches: no range beats "within 1 tile" beats "next to you".
const REACH = { adjacent: 0, within1: 1 }
const reach = (range) => REACH[range] ?? 2
const bestAttack = (card) => (card.attackBonus ?? 0) + (card.stillBonus ?? 0)

// The item a hero already holds that makes a new treasure card add nothing for them
// (Rulebook p. 13: only the best attack bonus and the best defense bonus count), or null.
// Only cards whose every bonus is an attack or AC bonus can be wasted like that.
export function betterItem(hero, card) {
  if (!card?.inPlay || card.damageBonus || card.critFrom || card.speedBonus || card.trapBonus || card.tileAcBonus || card.attack) return null
  if (!card.attackBonus && !card.acBonus) return null
  const held = heroItems(hero).filter((item) => item.card?.inPlay)
  const attackCover = card.attackBonus
    ? held.find((item) => item.card.attackBonus && bestAttack(item.card) >= bestAttack(card) && reach(item.card.attackRange) >= reach(card.attackRange))
    : true
  const acCover = card.acBonus ? held.find((item) => Math.max(item.card.acBonus ?? 0, item.card.tileAcBonus ?? 0) >= card.acBonus) : true
  if (!attackCover || !acCover) return null
  return [attackCover, acCover].find((cover) => cover !== true) ?? null
}
