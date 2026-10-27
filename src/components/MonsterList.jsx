import { CONDITIONS } from '../data/heroes.js'
import { Button, Chip, HpBar } from './ui.jsx'

function MonsterRow({ monster, owner, isActiveOwner, dispatch }) {
  return (
    <div className={`rounded-2xl border bg-zinc-900 p-4 ${isActiveOwner ? 'border-red-500/70' : 'border-zinc-800'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-xl font-bold text-red-300">{monster.name}</h3>
          <p className="text-sm text-zinc-400">
            {owner ? `${owner.name}'s card` : 'No owner'} · {monster.ac ? `AC ${monster.ac} · ` : ''}worth {monster.xp} XP
          </p>
          {monster.card?.figures > 1 && (
            <p className="text-sm text-amber-400">
              {monster.card.figures} figures with {monster.card.hp} HP each. XP comes when the last one falls.
            </p>
          )}
        </div>
        <Button variant="ghost" className="text-sm" onClick={() => dispatch({ type: 'REMOVE_MONSTER', monsterId: monster.id })}>
          Remove
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Button className="h-12 w-12 !px-0 text-2xl" onClick={() => dispatch({ type: 'ADJUST_MONSTER_HP', monsterId: monster.id, amount: -1 })}>
          −
        </Button>
        <div className="flex-1 text-center">
          <div className="text-2xl font-bold text-zinc-100">
            {monster.hp}
            <span className="text-base text-zinc-500"> / {monster.maxHp} HP</span>
          </div>
          <HpBar hp={monster.hp} maxHp={monster.maxHp} />
        </div>
        <Button className="h-12 w-12 !px-0 text-2xl" onClick={() => dispatch({ type: 'ADJUST_MONSTER_HP', monsterId: monster.id, amount: 1 })}>
          +
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {CONDITIONS.map((condition) => (
          <Chip
            key={condition}
            active={monster.conditions.includes(condition)}
            onClick={() => dispatch({ type: 'TOGGLE_MONSTER_CONDITION', monsterId: monster.id, condition })}
          >
            {condition}
          </Chip>
        ))}
      </div>

      <Button
        variant={monster.hp === 0 ? 'gold' : 'default'}
        className="mt-3 w-full py-3 text-lg"
        onClick={() => dispatch({ type: 'DEFEAT_MONSTER', monsterId: monster.id })}
      >
        Defeated! +{monster.xp} XP
      </Button>
    </div>
  )
}

// With ownerId, shows only that hero's monster cards (a player's own iPad).
export default function MonsterList({ state, dispatch, ownerId }) {
  const activeHero = state.heroes[state.turn.heroIndex]
  const monsters = ownerId ? state.monsters.filter((m) => m.ownerId === ownerId) : state.monsters

  return (
    <section>
      <div className="mb-3">
        <h2 className="font-display text-2xl font-bold text-zinc-100">{ownerId ? 'Your monsters' : 'Monsters'}</h2>
      </div>
      {monsters.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-zinc-500">
          The dungeon is quiet... for now.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {monsters.map((monster) => (
            <MonsterRow
              key={monster.id}
              monster={monster}
              owner={state.heroes.find((h) => h.id === monster.ownerId)}
              isActiveOwner={monster.ownerId === activeHero.id}
              dispatch={dispatch}
            />
          ))}
        </div>
      )}
    </section>
  )
}
