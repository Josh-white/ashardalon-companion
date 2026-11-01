// What the encounter, trap and curse screens (components/Encounters.jsx) work out and say:
// who an attack goes after, the rolls against each hero's AC, the notes on what tapping
// the button does, and the plain-words answers. The screens only draw it.
import { itemTrapBonus, tileAcBonus } from '../data/items.js'
import { tileShieldNow } from '../board/checks.js'
import { heroAc } from '../data/powerEffects.js'
import { foeBonus } from '../data/difficulty.js'
import { canSpendAttack } from './heroTurn.js'

// Who an attack goes after, asked as a question when the app can't tell.
export function targetQuestion(targets, hero) {
  if (targets === 'activeTile') return `Tap every hero on ${hero.name}'s tile.`
  if (targets === 'within1') return `Tap every hero within 1 tile of ${hero.name} (${hero.name} too).`
  if (targets === 'trapTile') return 'Tap every hero on the trap’s tile.'
  if (targets === 'villainWithin1') return 'Tap every hero within 1 tile of the villain.'
  return null
}

// What the board worked out, said in plain words.
export function boardFound(targets, hero) {
  if (targets === 'activeTile') return `on ${hero.name}'s tile`
  if (targets === 'within1') return `within 1 tile of ${hero.name}`
  if (targets === 'trapTile') return 'on the trap’s tile'
  if (targets === 'villainWithin1') return 'within 1 tile of the villain'
  return ''
}

// "Quinn", "Quinn and Keyleth", "Quinn, Keyleth and Tarak".
export const heroNames = (heroes) => {
  const list = heroes.map((h) => h.name)
  return list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] ?? ''
}

// What a hit does: "2 damage and Dazed", or "no damage".
export const hitWords = (attack) => [attack.damage > 0 && `${attack.damage} damage`, ...attack.conditions].filter(Boolean).join(' and ') || 'no damage'

// What the hero takes from a hit or a miss: "1 damage", or "nothing".
export const takesWords = (attack, hit) =>
  [(hit ? attack.damage : attack.miss) > 0 && `${hit ? attack.damage : attack.miss} damage`, ...((hit ? attack.conditions : attack.missConditions) ?? [])].filter(Boolean).join(' and ') || 'nothing'

// The heroes an attack hits without asking (the active hero, or everyone), or null when it has to ask.
// Heroes at 0 HP are down, so attacks skip them.
export const fixedTargets = (state, attack, hero) =>
  attack.targets === 'active' ? (hero.hp > 0 ? [hero.id] : []) : attack.targets === 'all' ? standingHeroes(state).map((h) => h.id) : null

// The heroes an attack can go after: everyone not down at 0 HP.
export const standingHeroes = (state) => state.heroes.filter((h) => h.hp > 0)

// The heroes picked before anyone taps: what the board found, else the active hero (nobody
// for an attack from a trap's tile or a villain).
export const firstPicks = (attack, hero, fromBoard) =>
  fromBoard ?? (attack.targets === 'trapTile' || attack.targets === 'villainWithin1' || hero.hp <= 0 ? [] : [hero.id])

// Each target's roll against their AC (plus a Blessed Shield's bonus for the heroes the
// table said stand on its tile). The reducer applies the damage; this is what the screen shows.
export function attackRolls(state, attack, rolled, guarded = []) {
  return rolled.map(({ heroId, roll }) => {
    const target = state.heroes.find((h) => h.id === heroId)
    const total = roll + foeBonus(state, attack)
    const onBoard = tileShieldNow(state, target)
    const ac = heroAc(target) + (onBoard ? onBoard.bonus : guarded.includes(heroId) ? tileAcBonus(state.heroes, target) : 0)
    return { hero: target, value: roll, total, ac, hit: total >= ac }
  })
}

// What the app does for an encounter card when the button is tapped, told beforehand.
// `villainHere` is false for a card whose villain (or objective) isn't in play.
export function encounterNotes(state, card, villainHere) {
  return [
    card.damageEach > 0 && `Every hero takes ${card.damageEach} damage when you tap the button.`,
    card.damagePoisoned > 0 && `Every Poisoned hero takes ${card.damagePoisoned} damage when you tap the button.`,
    card.filterMonsters && !state.encounter?.filtered && `The app looks at the top 5 monster cards, keeps the ${card.filterMonsters}s on top and discards the rest.`,
    card.drawAnother && villainHere && 'Then you draw another encounter card.',
    !villainHere && (card.villain ? 'Its villain isn’t in play, so it’s just discarded.' : `The ${card.objective} isn’t in play, so it’s just discarded.`),
    villainHere && card.placeVillain && 'The app puts the villain on the board when you tap the button.',
    villainHere && card.drawMonsterType && `The app draws monster cards until ${/^[AEIOU]/.test(card.drawMonsterType) ? 'an' : 'a'} ${card.drawMonsterType} turns up, and discards the rest.`,
    villainHere && card.timeToken && `The app takes a Time token off the ${card.objective || 'Vast Gate'} (${state.adventure?.timeTokens ?? 0} left now).`,
    villainHere && card.returnToTop > 0 && 'Then the app shuffles it back into the top 3 encounter cards.',
    villainHere && card.afterDrawTop && 'It goes back on top of the encounter deck after the next card is drawn.',
  ].filter(Boolean)
}

const RESOLVE_LABELS = {
  curse: (hero) => `Put the curse on ${hero.name}`,
  environment: () => 'Put it in play',
  trap: () => 'Put the trap marker on the tile',
  hazard: () => 'Put the hazard marker on the tile',
  event: () => 'Done, discard it',
}

// The words on an encounter card's last button.
export function resolveLabel(card, hero, villainHere) {
  if (!villainHere) return 'Discard it'
  if (card.returnToTop > 0) return 'Done, shuffle it back in'
  if (card.afterDrawTop) return 'Done'
  return RESOLVE_LABELS[card.type](hero)
}

// Why this Villain Phase draws more than the usual card, so a second draw isn't a surprise.
export function extraEncounterReasons(state, hero) {
  return [
    ...(hero.curses ?? []).filter((c) => c.card?.extraEncounter > 0).map((c) => `${c.name}: ${hero.name} draws an extra card every Villain Phase.`),
    state.adventure?.extraEncounters > 0 && 'The adventure adds an extra card every Villain Phase.',
    ...(state.turn.owedBecause ?? []),
  ].filter(Boolean)
}

// What stops a hero from doing something that takes their attack (disabling a trap,
// opening the Cage) right now, or null when they can.
export function attackBlocked(state, hero, what) {
  if (canSpendAttack(state, hero)) return null
  const spent = state.turn.attackSpent
  return spent?.heroId === hero.id ? `${hero.name} used this turn's attack on ${spent.on}.` : `${hero.name} attacked this turn, so ${what} has to wait.`
}

// What a phase check's answer does: "1 damage and Dazed", or "nothing happens".
export const effectWords = (effect) =>
  !effect
    ? 'nothing happens'
    : [effect.damage && `${effect.damage} damage`, effect.condition, effect.remove && 'the curse ends', effect.drawMonster && 'draw a monster'].filter(Boolean).join(' and ')

// What the board's answer does, told before the player taps OK.
export const boardEffect = (effect, name) =>
  !effect
    ? 'Nothing happens.'
    : `${[effect.damage && `${name} takes ${effect.damage} damage`, effect.condition && `${name} is ${effect.condition}`, effect.remove && 'the curse ends', effect.drawMonster && `${name} draws a monster`]
        .filter(Boolean)
        .join(' and ')
        .replace(/^./, (c) => c.toUpperCase())} when you tap OK.`

// Disabling a trap: the d20 needs the card's number (10 if it has none), Kobold Trappers
// takes `penalty` off the roll and tools (Thieves' Tools) add `tools`. `needs` is the bare
// die roll that does it. The rules, the Disable trap box and the computer allies all use this.
export const trapRollMods = (state, hero) => ({ penalty: state.environment?.card?.trapPenalty ?? 0, tools: itemTrapBonus(hero) })

export function trapDisable(state, hero, trap) {
  const target = trap.card.trap?.disable ?? 10
  const { penalty, tools } = trapRollMods(state, hero)
  return { target, penalty, tools, needs: target + penalty - tools }
}
