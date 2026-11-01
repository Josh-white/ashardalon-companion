// Making heroes: power slots by level, the lobby's picks, and a new hero from its
// hero card.
import { addedSlot, LEVEL_STATS, MAX_LEVEL, statsAtLevel, templateFor } from '../data/heroes.js'
import { newId } from './gameHelpers.js'

// The next level's side of the hero card (level 2 in the box), with an empty slot for the
// power card it adds. HP goes up as much as max HP does. A hero whose template is gone
// from cards.json levels up the box way.
export const nextLevel = (h) => {
  const template = templateFor(h.key) ?? h
  const level = h.level + 1
  const before = statsAtLevel(template, h.level)
  const after = statsAtLevel(template, level)
  const change = Object.fromEntries(LEVEL_STATS.map((stat) => [stat, h[stat] + after[stat] - before[stat]]))
  return { level, ...change, hp: h.hp + after.maxHp - before.maxHp, powers: [...h.powers, newPower(addedSlot(template, level))] }
}

// Each hero card names one power the hero always has (Keyleth's Lay on Hands, Tarak's
// Furious Assault), plus 1 utility, 2 at-wills, and 1 daily to choose. Most fixed powers
// are utilities. A template sets its own `powerSlots` when its fixed power is another
// type (Heskan's Hurled Breath and Vistra's Dwarven Resilience are dailies).
export const STARTING_POWER_SLOTS = ['at-will', 'at-will', 'utility', 'utility', 'daily']

export const powerSlotsFor = (template) => template.powerSlots ?? STARTING_POWER_SLOTS

// Each level after the first adds a power card: one more daily in the box.
export const levelSlots = (template, level = 1) => [
  ...powerSlotsFor(template),
  ...Array.from({ length: Math.max(0, level - 1) }, (_, i) => addedSlot(template, i + 2)),
]

// The card is copied into the game, so later edits to the card file don't change a game in progress.
export const copyCard = (card) =>
  card
    ? {
        id: String(card.id),
        name: String(card.name),
        text: String(card.text ?? ''),
        attack: card.attack ? String(card.attack) : '',
        damage: card.damage ? String(card.damage) : '',
        // A homebrew power's own effect (powerEffects.js), kept with the card.
        ...(card.effect && typeof card.effect === 'object' ? { effect: card.effect } : {}),
      }
    : null

export const updateClaim = (state, deviceId, change) => ({
  ...state,
  lobby: (state.lobby ?? []).map((claim) => (claim.deviceId === deviceId ? { ...claim, ...change(claim) } : claim)),
})

// Turns the lobby into heroes, in the order they were claimed.
// Fills a new hero's power slots with picked cards, in slot order.
export const withPicks = (hero, picks = []) => ({
  ...hero,
  powers: hero.powers.map((power, i) => {
    const card = copyCard(picks[i])
    return card ? { ...power, name: card.name, card } : power
  }),
})

// True when another slot already holds this card, so no hero gets the same power twice.
export const pickedElsewhere = (cards, slot, card) => Boolean(card) && cards.some((c, i) => i !== slot && c?.id === card.id)

export function heroesFromLobby(lobby, campaign = null) {
  return lobby.flatMap((claim) => {
    const template = templateFor(claim.heroKey)
    if (!template) return []
    // A campaign hero who levelled up starts at that level, with the power cards it added.
    const saved = (campaign?.heroes ?? []).find((h) => h.key === template.key)
    let hero = createHero(template)
    while (hero.level < Math.min(saved?.level ?? 1, MAX_LEVEL)) hero = { ...hero, ...nextLevel(hero) }
    return [{ ...withPicks(hero, claim.picks), player: claim.player, ...(claim.ally ? { ally: true } : {}) }]
  })
}

// ---- Campaigns (state/campaign.js) ----

export const POWER_LABELS = { 'at-will': 'At-will power', utility: 'Utility power', daily: 'Daily power' }

export const newPower = (type, name = POWER_LABELS[type] ?? 'Power') => ({ id: newId('power'), type, name, used: false, card: null })

export function createHero(template, overrides = {}) {
  const hero = { ...template, ...overrides }
  return {
    id: newId('hero'),
    key: hero.key,
    name: hero.name,
    className: hero.className,
    color: hero.color,
    maxHp: hero.maxHp,
    hp: hero.maxHp,
    ac: hero.ac,
    surgeValue: hero.surgeValue,
    speed: hero.speed,
    level: 1,
    // Saved with the hero, so a game in progress keeps them if cards.json changes.
    abilityEffects: hero.abilityEffects ?? [],
    conditions: [],
    // Power tokens (Mirror Image, Blade Barrier, Flaming Sphere) and markers (invisible, refuge).
    tokens: {},
    shieldedBy: null, // the cleric whose Cleric's Shield gives this hero +2 AC
    powers: powerSlotsFor(hero).map((type) => newPower(type)),
  }
}
