// A game in progress keeps its own copy of each power card (heroSetup.js copyCard), so a
// game never changes under the players. The one exception is how a card works: when the
// card file's effect for a power (or a hero's card abilities) is fixed, the fix should
// reach the games already being played, not only new ones. The Pi's server runs this
// whenever a screen loads the cards, and when it loads a saved game.

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// The game with each hero's power effects and card abilities taken from `cards` (as
// normalizeCardFile gives them). The same object back when nothing changed. Cards the
// file no longer has, and everything else about the game, stay as they are.
export function refreshCardEffects(state, cards) {
  if (!state?.heroes?.length || !cards) return state
  const powers = new Map((cards.powers ?? []).map((c) => [String(c.id), c]))
  const templates = new Map((cards.heroes ?? []).map((t) => [t.key, t]))
  let changed = false
  const heroes = state.heroes.map((hero) => {
    let heroChanged = false
    const slots = (hero.powers ?? []).map((power) => {
      const fresh = power.card && powers.get(String(power.card.id))
      if (!fresh || same(fresh.effect, power.card.effect)) return power
      heroChanged = true
      const { effect: _old, ...card } = power.card
      return { ...power, card: fresh.effect && typeof fresh.effect === 'object' ? { ...card, effect: fresh.effect } : card }
    })
    const template = templates.get(hero.key)
    const abilities = template?.abilityEffects
    const newAbilities = Array.isArray(abilities) && !same(abilities, hero.abilityEffects ?? []) ? abilities : null
    if (!heroChanged && !newAbilities) return hero
    changed = true
    return { ...hero, powers: slots, ...(newAbilities ? { abilityEffects: [...newAbilities] } : {}) }
  })
  return changed ? { ...state, heroes } : state
}
