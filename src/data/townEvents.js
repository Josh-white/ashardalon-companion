// Between a campaign's adventures the heroes rest in town, and one thing happens there:
// the "between adventures" event idea from the BoardGameGeek fan variants, with our own
// cards. Mostly good news; a couple of small setbacks keep it exciting. Each one changes
// only the next adventure (or the heroes' gold).
//   gold: every hero's gold changes by this much (never below 0)
//   shop: extra cards in this visit's shop
//   surges: healing surges for the next adventure (never below 1)
//   xp: the party starts the next adventure with this much XP
export const TOWN_EVENTS = [
  { id: 'farmer', icon: '🧑‍🌾', title: 'A Grateful Farmer', text: 'A farmer whose sheep you saved from kobolds insists you take his savings.', gold: 100 },
  { id: 'festival', icon: '🎉', title: 'Festival of Heroes', text: 'The town throws a party in your honor. Coins are tossed from every window.', gold: 50 },
  { id: 'merchant', icon: '🐫', title: 'A Traveling Merchant', text: 'A merchant caravan rolls into town with rare goods from far away.', shop: 2 },
  { id: 'temple', icon: '⛪', title: 'Blessing at the Temple', text: 'The priests of the temple bless your weapons and armor.', surges: 1 },
  { id: 'tavern', icon: '🍺', title: 'Tales at the Tavern', text: 'An old adventurer at the tavern tells you how to beat the monsters below.', xp: 3 },
  { id: 'map', icon: '🗺️', title: 'The Sage’s Map', text: 'A sage shares an old map of the tunnels under the mountain.', xp: 2 },
  { id: 'omen', icon: '🌑', title: 'A Bad Omen', text: 'A black crow follows you all day. The townsfolk whisper that it means bad luck.', surges: -1 },
  { id: 'pickpocket', icon: '🦝', title: 'Pickpockets!', text: 'Sneaky thieves in the market lighten everyone’s coin purse.', gold: -50 },
  { id: 'quiet', icon: '🌙', title: 'A Quiet Night', text: 'You sleep well, eat a hot meal and sharpen your swords. Nothing else happens.' },
  { id: 'storm', icon: '⛈️', title: 'The Storm', text: 'Thunder shakes the mountain all night. Deep below, something roars back.' },
]

// What an event does, in a few words for the lobby ("Each hero +100 gold").
export function townEventEffect(event) {
  if (!event) return ''
  const parts = []
  if (event.gold) parts.push(`each hero ${event.gold > 0 ? '+' : '−'}${Math.abs(event.gold)} gold`)
  if (event.shop) parts.push(`${event.shop} extra shop cards`)
  if (event.surges) parts.push(`${event.surges > 0 ? '+1 healing surge' : '1 fewer healing surge'} next adventure`)
  if (event.xp) parts.push(`start the next adventure with ${event.xp} XP`)
  const words = parts.join(', ')
  return words ? words[0].toUpperCase() + words.slice(1) : 'No effect'
}

// Picks one with a number from 0 to 1, not the same as last time.
export function pickTownEvent(number, lastId = null) {
  const list = TOWN_EVENTS.filter((e) => e.id !== lastId)
  const n = typeof number === 'number' && number >= 0 && number < 1 ? number : 0
  return list[Math.floor(n * list.length)]
}
