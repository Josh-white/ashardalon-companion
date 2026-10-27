import { useState } from 'react'
import { CONDITIONS } from '../data/heroes.js'
import { activeVillains } from '../state/game.js'
import { useCards } from '../state/useCards.js'
import { Button, Chip, HpBar } from './ui.jsx'

function VillainRow({ villain, dispatch }) {
  const { card } = villain
  return (
    <div className="rounded-2xl border-2 border-fuchsia-700 bg-zinc-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-fuchsia-400">
            👑 Villain{card.level ? ` · level ${card.level}` : ''}
          </p>
          <h3 className="font-display text-2xl font-bold text-fuchsia-200">{villain.enraged ? `Enraged ${villain.name}` : villain.fullName}</h3>
          <p className="text-sm text-zinc-400">AC {villain.ac} · takes a turn at the start of every Villain Phase</p>
        </div>
        <Button variant="ghost" className="text-sm" onClick={() => dispatch({ type: 'REMOVE_VILLAIN', villainId: villain.id })}>
          Remove
        </Button>
      </div>
      {card.special && <p className="mt-2 rounded-lg bg-zinc-950/60 p-2 text-sm text-zinc-300">{card.special}</p>}

      <div className="mt-3 flex items-center gap-3">
        <Button className="h-12 w-12 !px-0 text-2xl" onClick={() => dispatch({ type: 'ADJUST_MONSTER_HP', monsterId: villain.id, amount: -1 })}>
          −
        </Button>
        <div className="flex-1 text-center">
          <div className="text-2xl font-bold text-zinc-100">
            {villain.hp}
            <span className="text-base text-zinc-500"> / {villain.maxHp} HP</span>
          </div>
          <HpBar hp={villain.hp} maxHp={villain.maxHp} />
        </div>
        <Button className="h-12 w-12 !px-0 text-2xl" onClick={() => dispatch({ type: 'ADJUST_MONSTER_HP', monsterId: villain.id, amount: 1 })}>
          +
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {CONDITIONS.map((condition) => (
          <Chip
            key={condition}
            active={villain.conditions.includes(condition)}
            onClick={() => dispatch({ type: 'TOGGLE_MONSTER_CONDITION', monsterId: villain.id, condition })}
          >
            {condition}
          </Chip>
        ))}
      </div>

      <Button
        variant={villain.hp === 0 ? 'gold' : 'default'}
        className="mt-3 w-full py-3 text-lg"
        onClick={() => dispatch({ type: 'DEFEAT_MONSTER', monsterId: villain.id })}
      >
        {card.enraged ? 'Down to 0 HP: it gets enraged!' : 'Defeated!'}
      </Button>
    </div>
  )
}

// Until an adventure puts its villain out by itself, the table can place one by hand.
function PlaceVillain({ state, dispatch }) {
  const { villains } = useCards()
  const [open, setOpen] = useState(false)
  const onBoard = new Set(activeVillains(state).map((v) => v.cardId))
  const choices = villains.filter((v) => !onBoard.has(v.id))
  if (choices.length === 0) return null
  if (!open) {
    return (
      <Button variant="ghost" className="text-sm" onClick={() => setOpen(true)}>
        👑 Put a villain on the board
      </Button>
    )
  }
  return (
    <div className="space-y-2 rounded-2xl border border-fuchsia-800 bg-zinc-900 p-3">
      <p className="text-zinc-300">Which villain did the adventure bring out?</p>
      <div className="flex flex-wrap gap-2">
        {choices.map((v) => (
          <Button
            key={v.id}
            onClick={() => {
              dispatch({ type: 'PLACE_VILLAIN', name: v.id, cards: villains })
              setOpen(false)
            }}
          >
            {v.fullName}
          </Button>
        ))}
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// Villains on the board, shown on every screen. `canPlace` adds the hand-placing button (table view).
export function VillainList({ state, dispatch, canPlace = false }) {
  const villains = activeVillains(state)
  if (villains.length === 0 && !canPlace) return null
  return (
    <section className="space-y-3">
      {villains.length > 0 && <h2 className="font-display text-2xl font-bold text-fuchsia-200">Villains</h2>}
      {villains.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {villains.map((villain) => (
            <VillainRow key={villain.id} villain={villain} dispatch={dispatch} />
          ))}
        </div>
      )}
      {canPlace && <PlaceVillain state={state} dispatch={dispatch} />}
    </section>
  )
}

function MonsterRow({ monster, owner, isActiveOwner, dispatch }) {
  return (
    <div className={`rounded-2xl border bg-zinc-900 p-4 ${isActiveOwner ? 'border-red-500/70' : 'border-zinc-800'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-xl font-bold text-red-300">{monster.name}</h3>
          <p className="text-sm text-zinc-400">
            {monster.objective ? 'In the chamber' : owner ? `${owner.name}'s card` : 'No owner'} · {monster.ac ? `AC ${monster.ac}` : ''}
            {!monster.objective && `${monster.ac ? ' · ' : ''}worth ${monster.xp} XP`}
            {monster.chamber && ' · in the chamber'}
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
        {monster.objective ? 'Destroyed!' : `Defeated! +${monster.xp} XP`}
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
