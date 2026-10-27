// Card art: photos of your own hero, monster and villain cards. Like the card
// text, they live on the Pi (cards/art) and never go into the repository.
// Each picture is one JPEG or PNG named after what it shows, like hero-cleric.png.
// A hero also has a tall card-hero-<key> picture: the big art from the hero
// card, shown behind that hero's card on the player's own iPad.

export const ART_NAME = /^(card-)?(hero|monster|villain)-[a-z0-9-]{1,60}$/
// A cropped photo is about 100 KB; this leaves room for a big one.
export const MAX_ART_BYTES = 2 * 1024 * 1024
// Cropped pictures are this many pixels wide and tall.
export const ART_SIZE = 600

const slug = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

export const heroArt = (heroKey) => `hero-${slug(heroKey)}`
export const heroCardArt = (heroKey) => `card-hero-${slug(heroKey)}`
// Tall pictures are scaled to this height, keeping their shape.
export const CARD_ART_HEIGHT = 1100

// A card on the art screen: kind is 'monster' or 'villain'.
export const cardArt = (kind, card) => `${kind}-${slug(card.id)}`

// A monster or villain in play. Monsters added before the deck existed have no
// card id, so their name stands in.
export const monsterArt = (monster) =>
  monster ? `${monster.villain ? 'villain' : 'monster'}-${slug(monster.cardId ?? monster.name)}` : null
