// Little things the heroes notice when they explore a new tile, now and then. An idea from
// the "room events" fan decks on BoardGameGeek, with our own words. Mostly flavor; a few
// give a tiny bonus. On the virtual board the app knows the tile's shape, so the event
// can fit it: a dead end, a corridor, a crossroads or a door. With real tiles any fits.

export const TILE_EVENT_CHANCE = 1 / 3

export const TILE_EVENTS = [
  { id: 'echo', shape: 'deadEnd', text: 'Your footsteps echo off the wall at the end. Something far away echoes back.' },
  { id: 'scratches', shape: 'deadEnd', text: 'Tally marks are scratched into the stone. Someone counted a lot of days here.' },
  { id: 'loose-brick', shape: 'deadEnd', text: 'A loose brick hides an old pouch with a few coins.', effect: { gold: 50 } },
  { id: 'draft', shape: 'corridor', text: 'A cold draft blows down the passage and makes the torches flicker.' },
  { id: 'drip', shape: 'corridor', text: 'Drip... drip... drip. Water runs down the walls and pools on the floor.' },
  { id: 'bones', shape: 'corridor', text: 'Old bones crunch under your boots. Best not to look too closely.' },
  { id: 'crossroads', shape: 'crossroads', text: 'Paths split in every direction. A faint roar rumbles from one of them.' },
  { id: 'arrows', shape: 'crossroads', text: 'Someone scratched arrows on the floor, but they all point different ways.' },
  { id: 'spring', shape: 'crossroads', text: 'A little spring bubbles up between the stones. The cool water feels great.', effect: { heal: 1 } },
  { id: 'door-knock', shape: 'door', text: 'You hear a knock from behind the door. Then nothing.' },
  { id: 'door-carving', shape: 'door', text: 'A dragon is carved into the door frame. Its eyes seem to follow you.' },
  { id: 'smell', shape: 'any', text: 'It smells like smoke and wet dog in here.' },
  { id: 'glow', shape: 'any', text: 'Strange mushrooms glow blue along the floor, lighting the way.' },
  { id: 'rat', shape: 'any', text: 'A rat squeaks and dashes between your feet. Just a rat. Probably.' },
  { id: 'warm', shape: 'any', text: 'The floor is warm here. Ashardalon must be close.' },
  { id: 'map', shape: 'any', text: 'A torn piece of an old map lies on the floor. You are not the first to come this way.' },
  { id: 'potion', shape: 'any', text: 'A forgotten flask of healing water sits in a crack in the wall.', effect: { heal: 1 } },
  { id: 'coins', shape: 'any', text: 'A few gold coins glint in the dust.', effect: { gold: 50 } },
]

// The shape of a laid tile from its exits (a side with any opening counts) and features.
export function tileShape(def) {
  if (!def || def.kind !== 'regular') return null
  if (def.features?.some((f) => f.type === 'door')) return 'door'
  const open = Object.values(def.exits ?? {}).filter((side) => String(side).includes('o')).length
  if (open <= 1) return 'deadEnd'
  return open === 2 ? 'corridor' : 'crossroads'
}

// Picks an event (or none) with two numbers from 0 to 1: one for the chance, one for which.
// `shape` null means real tiles, where only the 'any' events fit. Gold only matters in a campaign.
export function pickTileEvent({ shape, campaign, seen = [] }, chance, which) {
  if (!(chance < TILE_EVENT_CHANCE) || typeof which !== 'number') return null
  const fits = TILE_EVENTS.filter((e) => (e.shape === 'any' || e.shape === shape) && !seen.includes(e.id) && (!e.effect?.gold || campaign))
  if (fits.length === 0) return null
  return fits[Math.min(fits.length - 1, Math.floor(which * fits.length))]
}
