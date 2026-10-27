// A short label for the Undo button, so everyone can see what it will undo.
// It reads the game as it was before the action.
export function describeAction(state, action) {
  const hero = state.heroes.find((h) => h.id === action.heroId)
  const monster = state.monsters.find((m) => m.id === action.monsterId)
  const signed = (n) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`)

  switch (action.type) {
    case 'ADJUST_HP':
      return hero ? `${hero.name} ${signed(action.amount)} HP` : 'HP change'
    case 'ADJUST_MONSTER_HP':
      return monster ? `${monster.name} ${signed(action.amount)} HP` : 'Monster HP change'
    case 'USE_SURGE':
      return hero ? `${hero.name}'s healing surge` : 'Healing surge'
    case 'TOGGLE_POWER': {
      const power = hero?.powers.find((p) => p.id === action.powerId)
      return power ? `${hero.name}'s ${power.name}` : 'Power change'
    }
    case 'SET_POWER_CARD':
    case 'RENAME_POWER':
    case 'ADD_POWER':
      return hero ? `${hero.name}'s powers` : 'Power change'
    case 'TOGGLE_HERO_CONDITION':
      return hero ? `${hero.name} ${action.condition}` : 'Condition'
    case 'TOGGLE_MONSTER_CONDITION':
      return monster ? `${monster.name} ${action.condition}` : 'Condition'
    case 'LEVEL_UP':
      return hero ? `${hero.name}'s level up` : 'Level up'
    case 'ADD_MONSTER':
      return `Adding ${action.name}`
    case 'DRAW_MONSTER':
      return 'Drawing a monster'
    case 'MONSTER_ATTACK':
      return monster ? `${monster.name}'s attack` : 'Monster attack'
    case 'HERO_ATTACK': {
      const power = hero?.powers.find((p) => p.id === action.powerId)
      return power ? `${hero.name}'s ${power.name}` : 'Hero attack'
    }
    case 'ATTACH_MONSTER_CARDS':
      return 'Monster cards'
    case 'SET_EXPLORED':
      return action.explored ? 'Exploring' : 'Not exploring'
    case 'DEFEAT_MONSTER':
      return monster ? `Defeating ${monster.name}` : 'Defeated monster'
    case 'REMOVE_MONSTER':
      return monster ? `Removing ${monster.name}` : 'Removed monster'
    case 'ADJUST_XP':
      return `XP ${signed(action.amount)}`
    case 'CANCEL_ENCOUNTER':
      return 'Cancelling the encounter'
    case 'ADJUST_SURGES':
      return `Healing surges ${signed(action.amount)}`
    case 'NEXT_PHASE':
    case 'PREVIOUS_PHASE':
      return 'Changing the phase'
    case 'START_DEMO':
      return 'Demo game'
    case 'START_GAME':
      return 'Starting the game'
    case 'NEW_GAME':
      return 'New game'
    case 'END_GAME':
    case 'RESUME':
      return 'Ending the game'
    default:
      return 'Last change'
  }
}
