import { useState } from 'react'
import { CONDITIONS } from '../data/heroes.js'
import { MONSTER_NAMES } from '../data/monsters.js'
import { Button, Chip, HpBar, Stepper } from './ui.jsx'

function AddMonster({ heroes, activeHeroId, dispatch, onDone }) {
  const [name, setName] = useState('')
  const [hp, setHp] = useState(1)
  const [xp, setXp] = useState(1)
  const [ownerId, setOwnerId] = useState(activeHeroId)

  const add = () => {
    if (!name.trim()) return
    dispatch({ type: 'ADD_MONSTER', name: name.trim(), hp, xp, ownerId })
    onDone()
  }

  return (
    <div className="space-y-4 rounded-2xl border border-amber-600/40 bg-zinc-900 p-4">
      <input
        autoFocus
        list="monster-names"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-3 text-lg text-zinc-100"
        placeholder="Monster name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <datalist id="monster-names">
        {MONSTER_NAMES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="flex flex-wrap gap-6">
        <Stepper label="HP" value={hp} min={1} onChange={setHp} />
        <Stepper label="XP" value={xp} min={0} onChange={setXp} />
      </div>
      <div>
        <p className="mb-1 text-sm text-zinc-400">Whose card is it?</p>
        <div className="flex flex-wrap gap-2">
          {heroes.map((hero) => (
            <Chip key={hero.id} active={ownerId === hero.id} onClick={() => setOwnerId(hero.id)}>
              {hero.name}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="gold" disabled={!name.trim()} onClick={add}>
          Add monster
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function MonsterRow({ monster, owner, isActiveOwner, dispatch }) {
  return (
    <div className={`rounded-2xl border bg-zinc-900 p-4 ${isActiveOwner ? 'border-red-500/70' : 'border-zinc-800'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-xl font-bold text-red-300">{monster.name}</h3>
          <p className="text-sm text-zinc-400">
            {owner ? `${owner.name}'s card` : 'No owner'} · worth {monster.xp} XP
          </p>
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

export default function MonsterList({ state, dispatch }) {
  const [adding, setAdding] = useState(false)
  const activeHero = state.heroes[state.turn.heroIndex]

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-zinc-100">Monsters</h2>
        {!adding && (
          <Button variant="gold" onClick={() => setAdding(true)}>
            + Monster
          </Button>
        )}
      </div>
      {adding && (
        <div className="mb-4">
          <AddMonster heroes={state.heroes} activeHeroId={activeHero.id} dispatch={dispatch} onDone={() => setAdding(false)} />
        </div>
      )}
      {state.monsters.length === 0 && !adding ? (
        <p className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-zinc-500">
          The dungeon is quiet... for now.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {state.monsters.map((monster) => (
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
