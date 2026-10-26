// What the active player does in each phase of their turn.
export const PHASES = [
  {
    key: 'hero',
    title: 'Hero Phase',
    emoji: '⚔️',
    steps: [
      'If your hero is at 0 HP, spend a healing surge first.',
      'Move and attack, attack and move, or move twice.',
      'Rolled a natural 20 with 5 XP? You can level up!',
    ],
  },
  {
    key: 'exploration',
    title: 'Exploration Phase',
    emoji: '🗺️',
    steps: [
      'Standing on an unexplored edge? Draw a dungeon tile and place it.',
      'Place a new monster on the tile and keep its card.',
    ],
  },
  {
    key: 'villain',
    title: 'Villain Phase',
    emoji: '🐉',
    steps: [
      'No new tile, or the new tile has a black triangle? Draw an encounter card.',
      'Activate the villain, if one is in play.',
      'Activate each monster card in front of you, once per card.',
    ],
  },
]
