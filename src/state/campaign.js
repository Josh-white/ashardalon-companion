// A campaign (Campaign Against the Clans, Assault on Firestorm Peak): the same heroes play
// the adventure again and again, one Chamber card each time, keeping their level, treasure
// and gold. Plain functions on the game state, used by the game reducer.
import { playableChambers } from './adventure.js'
import { shuffle } from './game.js'

// Shop: how many treasure cards the traders turn over between adventures.
export const SHOP_CARDS = 3

export const isCampaign = (card) => Boolean(card?.campaign)

// The campaign's Chamber deck, top first (chamber ids). Assault on Firestorm Peak: the
// hard chamber (Elite Regiment) is shuffled into the top cards, and the final chamber
// (Ashardalon's Lair) into the last few.
export function buildChamberDeck(rules, chambers, random = []) {
  const playable = playableChambers(chambers)
  const pool = rules.chambers.length > 0 ? rules.chambers.map((id) => playable.find((c) => c.id === id)).filter(Boolean) : playable
  const ids = pool.map((c) => c.id)
  const has = (id) => Boolean(id) && ids.includes(id)
  let rest = shuffle(ids.filter((id) => id !== rules.final && id !== rules.hard), random)
  let bottom = []
  if (has(rules.final)) {
    bottom = shuffle([...rest.slice(0, rules.finalWith), rules.final], random.slice(40))
    rest = rest.slice(rules.finalWith)
  }
  if (has(rules.hard)) rest = shuffle([...rest, rules.hard], random.slice(80))
  return [...rest, ...bottom]
}

// A new campaign, when its first adventure starts.
export function newCampaign(card, chambers, random) {
  return {
    card,
    deck: buildChamberDeck(card.campaign, chambers, random),
    beaten: [], // chamber ids, in the order they were beaten
    defeats: 0,
    hard: false, // the Elite Regiment was found: two encounter cards from now on
    boons: [], // boon ids, kept for the rest of the campaign
    heroes: [], // { key, deviceId, player, level, gold, items, picks }, saved after each adventure
    games: 0, // adventures finished
    shop: [], // treasure cards the traders offer between adventures
    over: null, // 'won' or 'lost' once the campaign is finished
  }
}

export const campaignHero = (state, key) => (state.campaign?.heroes ?? []).find((h) => h.key === key) ?? null

// Healing surges for the next adventure: one fewer after Assault on Firestorm Peak's first defeat.
export const campaignSurges = (campaign, surges) => (campaign?.defeats > 0 && campaign.card.campaign.secondChance ? Math.max(1, surges - 1) : surges)

const chamberName = (chambers, id) => chambers.find((c) => c.id === id)?.name ?? id

// What the adventure that just ended means for the campaign: the chamber beaten (or not),
// boons earned, and whether the campaign is over. Doesn't change anything.
export function campaignOutcome(state) {
  const campaign = state.campaign
  if (!campaign || (state.status !== 'won' && state.status !== 'lost')) return null
  const rules = campaign.card.campaign
  const chamber = state.adventure?.chamber?.card ?? null
  if (state.status === 'won') {
    const beaten = chamber && !campaign.beaten.includes(chamber.id) ? [...campaign.beaten, chamber.id] : campaign.beaten
    const boons = []
    if (chamber && beaten !== campaign.beaten) {
      for (const id of [rules.boonsFor[chamber.id], rules.boonsAfter[String(beaten.length)]]) {
        if (id && !campaign.boons.includes(id) && !boons.includes(id)) boons.push(id)
      }
    }
    const deck = chamber ? campaign.deck.filter((id) => id !== chamber.id) : campaign.deck
    // The final chamber ends it; without one, beating every chamber does.
    const over = (rules.final && chamber?.id === rules.final) || (!rules.final && deck.length === 0) ? 'won' : null
    return { won: true, chamber, beaten, boons, deck, defeats: campaign.defeats, over }
  }
  const defeats = campaign.defeats + 1
  const over = !rules.secondChance || defeats >= 2 ? 'lost' : null
  // After the first defeat the heroes go on to the next quest; the chamber they lost is discarded.
  const deck = chamber && !over ? campaign.deck.filter((id) => id !== chamber.id) : campaign.deck
  return { won: false, chamber, beaten: campaign.beaten, boons: [], deck, defeats, over }
}

// Words for the recap and the lobby.
export function outcomeLines(state, outcome, boonCards = [], chambers = []) {
  if (!outcome) return []
  const boonName = (id) => boonCards.find((b) => b.id === id)?.name ?? id
  const lines = []
  if (outcome.won) {
    if (outcome.chamber) lines.push(`The ${outcome.chamber.name} is beaten!`)
    for (const id of outcome.boons) lines.push(`New boon: ${boonName(id)}`)
  } else if (outcome.over) {
    lines.push(state.campaign.card.campaign.secondChance ? 'That was the second defeat, so the campaign is lost.' : 'Losing an adventure loses the campaign.')
  } else {
    lines.push('The heroes can go on to the next quest, but from now on every adventure starts with one fewer healing surge.')
  }
  if (outcome.over === 'won') lines.push('🏆 The campaign is won!')
  else if (!outcome.over) {
    const left = outcome.deck.length
    lines.push(`${left} Chamber ${left === 1 ? 'card' : 'cards'} left in the campaign.${chambers.length > 0 && outcome.beaten.length > 0 ? ` Beaten so far: ${outcome.beaten.map((id) => chamberName(chambers, id)).join(', ')}.` : ''}`)
  }
  return lines
}

// The treasure cards on offer between adventures: the top of a shuffled treasure deck,
// leaving out cards the heroes already hold.
export function shopCards(treasureCards, heldIds, count, random) {
  const held = [...heldIds]
  const deck = (treasureCards ?? []).flatMap((card) => Array.from({ length: card.copies ?? 1 }, () => card))
  const free = deck.filter((card) => {
    const i = held.indexOf(card.id)
    if (i === -1) return true
    held.splice(i, 1)
    return false
  })
  return shuffle(free, random).slice(0, count)
}

// The boons this campaign has, with their cards.
export const campaignBoons = (state, boonCards = []) => (state.campaign?.boons ?? []).map((id) => boonCards.find((b) => b.id === id)).filter(Boolean)

// How many shop cards: 3, or more with a shop boon (Dwarven Traders!: 5).
export const shopSize = (state, boonCards = []) => Math.max(SHOP_CARDS, ...campaignBoons(state, boonCards).filter((b) => b.use === 'shop').map((b) => b.shopCards))
