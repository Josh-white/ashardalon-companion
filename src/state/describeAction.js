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
      const power = hero?.powers.find((p) => p.id === action.powerId) ?? hero?.items?.find((i) => i.id === action.itemId)
      return power ? `${hero.name}'s ${power.name}` : 'Hero attack'
    }
    case 'USE_POWER': {
      const power = hero?.powers.find((p) => p.id === action.powerId)
      return power ? `${hero.name}'s ${power.name}` : 'Using a power'
    }
    case 'ATTACK_FOLLOW_UP':
      return hero ? `${hero.name}'s power choice` : 'Power choice'
    case 'REROLL_ATTACK':
      return 'Inspiring Advice reroll'
    case 'POWER_DAMAGE':
      return { furious: 'Furious Assault', bladeBarrier: 'Blade Barrier', flamingSphere: 'Flaming Sphere' }[action.source] ?? 'Power damage'
    case 'DODGE_HIT':
      return hero ? `${hero.name}'s Tumbling Escape` : 'Tumbling Escape'
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
    case 'DRAW_ENCOUNTER':
      return 'Drawing an encounter'
    case 'ENCOUNTER_ATTACK':
      return state.encounter ? `${state.encounter.card.name}'s attack` : 'Encounter attack'
    case 'RESOLVE_ENCOUNTER':
    case 'REDRAW_ENCOUNTER':
      return state.encounter ? state.encounter.card.name : 'Encounter'
    case 'TRAP_ATTACK':
    case 'TRAP_DAMAGE':
    case 'DISABLE_TRAP':
    case 'REMOVE_TRAP':
      return (state.traps ?? []).find((t) => t.id === action.trapId)?.name ?? 'Trap'
    case 'CURSE_ROLL':
    case 'REMOVE_CURSE':
      return hero?.curses?.find((c) => c.id === action.curseId)?.name ?? 'Curse'
    case 'SET_MONSTER_OWNER':
      return monster ? `Passing ${monster.name}` : 'Passing a monster'
    case 'DRAW_TREASURE':
      return 'Drawing a treasure'
    case 'KEEP_TREASURE':
      return state.treasure ? `Taking the ${state.treasure.card.name}` : 'Treasure'
    case 'USE_ITEM':
    case 'TOGGLE_ITEM':
    case 'DISCARD_ITEM':
    case 'MONSTER_CONTROL': {
      const item = hero?.items?.find((i) => i.id === action.itemId)
      return item ? `${hero.name}'s ${item.name}` : 'Item'
    }
    case 'SET_TRIANGLE':
      return 'Black triangle'
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
