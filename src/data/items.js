// Treasure items a hero holds. Each is { id, cardId, name, used, card }, with the card's
// numbers (cards.js) copied in. Items played "immediately" work while they're in play;
// the rest wait until they're used, then flip over or go to the discards.

export const heroItems = (hero) => hero?.items ?? []

// Bonuses that last while an item is in play. A flipped item (Throwing Shield after its
// throw) still gives them.
const inPlayTotal = (hero, field) => heroItems(hero).reduce((sum, item) => sum + (item.card?.inPlay ? item.card[field] ?? 0 : 0), 0)

// Blessed Shield guards its owner too, so it counts toward the owner's own AC.
export const itemAc = (hero) => inPlayTotal(hero, 'acBonus') + inPlayTotal(hero, 'tileAcBonus')
export const itemSpeed = (hero) => inPlayTotal(hero, 'speedBonus')
export const itemTrapBonus = (hero) => inPlayTotal(hero, 'trapBonus')

// Other heroes whose items guard everyone on their tile: [{ hero, bonus }].
export function tileGuards(heroes, target) {
  return heroes
    .filter((h) => h.id !== target?.id)
    .map((hero) => ({ hero, bonus: inPlayTotal(hero, 'tileAcBonus') }))
    .filter((g) => g.bonus > 0)
}

// The extra AC a hero gets from standing on a guard's tile. Bonuses from two shields don't add up.
export const tileAcBonus = (heroes, target) => Math.max(0, ...tileGuards(heroes, target).map((g) => g.bonus))

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
    if (card.attackBonus && inRange(card.attackRange, distance)) bonus += card.attackBonus + (stayed ? card.stillBonus ?? 0 : 0)
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
