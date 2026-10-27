import { HERO_COLORS } from '../data/heroes.js'
import { heroAc } from '../data/powerEffects.js'

// "Snake 2" when one hero has two Snakes, so they can be told apart.
export function monsterName(state, monster) {
  const twins = state.monsters.filter((m) => m.ownerId === monster.ownerId && m.name === monster.name)
  return twins.length > 1 ? `${monster.name} ${twins.indexOf(monster) + 1}` : monster.name
}

// Big buttons for picking heroes, for powers that heal or help someone.
export function HeroChoice({ heroes, chosen, onToggle }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {heroes.map((hero) => {
        const on = chosen.includes(hero.id)
        return (
          <button
            key={hero.id}
            type="button"
            onClick={() => onToggle(hero.id)}
            className={`rounded-xl border-2 px-3 py-2 text-left font-bold transition active:scale-95 ${
              on ? `border-amber-400 ${HERO_COLORS[hero.color].bg}` : 'border-zinc-700 bg-zinc-900'
            } ${HERO_COLORS[hero.color].text}`}
          >
            {hero.name}
            <span className="block text-sm font-normal text-zinc-400">
              {hero.hp} / {hero.maxHp} HP · AC {heroAc(hero)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Big buttons for picking monsters. `counts` shows "×2" when one is picked twice.
export function MonsterChoice({ state, monsters = state.monsters, chosen, onToggle }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {monsters.map((monster) => {
        const owner = state.heroes.find((h) => h.id === monster.ownerId)
        const count = chosen.filter((id) => id === monster.id).length
        return (
          <button
            key={monster.id}
            type="button"
            onClick={() => onToggle(monster.id)}
            className={`rounded-xl border-2 px-3 py-2 text-left transition active:scale-95 ${
              count > 0 ? 'border-red-400 bg-red-950/70' : 'border-zinc-700 bg-zinc-900'
            }`}
          >
            <span className="block font-bold text-red-300">
              {monsterName(state, monster)}
              {count > 1 && <span className="ml-2 text-amber-300">×{count}</span>}
            </span>
            <span className={`block text-sm ${owner ? HERO_COLORS[owner.color].text : 'text-zinc-400'}`}>
              {owner ? `${owner.name}'s monster` : 'No owner'}
            </span>
            <span className="text-sm text-zinc-400">
              {monster.ac ? `AC ${monster.ac} · ` : ''}
              {monster.hp} HP
            </span>
          </button>
        )
      })}
    </div>
  )
}
