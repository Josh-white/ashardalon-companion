import { useState } from 'react'
import { monsterArt } from '../data/art.js'
import { CONDITIONS, HERO_COLORS } from '../data/heroes.js'
import { activeVillains } from '../state/game.js'
import { useCards } from '../state/useCards.js'
import Art from './Art.jsx'
import { Button, Chip, HpBar } from './ui.jsx'

// A monster or villain on one short row (picture, name, whose it is, AC, HP with -/+), for
// the narrow column beside the virtual board. Tap it for the full card with conditions,
// Remove and Defeated.
function GlanceRow({ monster, sub, villain = false, highlight = false, dispatch, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div className={`rounded-xl border bg-zinc-900 p-2 ${villain ? 'border-fuchsia-700' : highlight ? 'border-red-500/70' : 'border-zinc-800'}`}>
        <div className="flex items-center gap-2">
          <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Art name={monsterArt(monster)} className="w-10 shrink-0" />
            <span className="min-w-0">
              <span className={`block truncate font-display text-lg leading-tight font-bold ${villain ? 'text-fuchsia-200' : 'text-red-300'}`}>
                {villain && '👑 '}
                {monster.name}
              </span>
              <span className="block truncate text-sm text-zinc-400">{sub}</span>
            </span>
            <span className="ml-auto shrink-0 text-zinc-500">{open ? '▴' : '▾'}</span>
          </button>
          <Button className="h-10 w-10 shrink-0 !px-0 text-xl" aria-label={`${monster.name} loses 1 HP`} onClick={() => dispatch({ type: 'ADJUST_MONSTER_HP', monsterId: monster.id, amount: -1 })}>
            −
          </Button>
          <span className={`w-12 shrink-0 text-center text-xl font-bold whitespace-nowrap ${monster.hp === 0 ? 'text-red-400' : 'text-zinc-100'}`}>
            {monster.hp}
            <span className="text-sm font-normal text-zinc-500">/{monster.maxHp}</span>
          </span>
          <Button className="h-10 w-10 shrink-0 !px-0 text-xl" aria-label={`${monster.name} gains 1 HP`} onClick={() => dispatch({ type: 'ADJUST_MONSTER_HP', monsterId: monster.id, amount: 1 })}>
            +
          </Button>
        </div>
        <div className="mt-1.5">
          <HpBar hp={monster.hp} maxHp={monster.maxHp} />
        </div>
        {monster.conditions.length > 0 && <p className="mt-1 text-sm text-amber-400">{monster.conditions.join(', ')}</p>}
      </div>
      {open && <div className="mt-2">{children}</div>}
    </div>
  )
}

function VillainRow({ villain, dispatch }) {
  const { card } = villain
  return (
    <div className="rounded-2xl border-2 border-fuchsia-700 bg-zinc-900 p-4">
      <div className="flex items-start gap-3">
        <Art name={monsterArt(villain)} className="w-24" />
        <div className="mr-auto">
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
// `glance`: one short row each (beside the virtual board), tap for the full card.
export function VillainList({ state, dispatch, canPlace = false, glance = false }) {
  const villains = activeVillains(state)
  if (villains.length === 0 && !canPlace) return null
  return (
    <section className="space-y-3">
      {villains.length > 0 && <h2 className={`font-display font-bold text-fuchsia-200 ${glance ? 'text-xl' : 'text-2xl'}`}>Villains</h2>}
      {villains.length > 0 && (
        <div className={glance ? 'space-y-2' : 'grid gap-3 md:grid-cols-2'}>
          {villains.map((villain) =>
            glance ? (
              <GlanceRow key={villain.id} monster={villain} villain sub={`AC ${villain.ac}${villain.enraged ? ' · enraged' : ''}`} dispatch={dispatch}>
                <VillainRow villain={villain} dispatch={dispatch} />
              </GlanceRow>
            ) : (
              <VillainRow key={villain.id} villain={villain} dispatch={dispatch} />
            ),
          )}
        </div>
      )}
      {canPlace && <PlaceVillain state={state} dispatch={dispatch} />}
    </section>
  )
}

function MonsterRow({ monster, owner, isActiveOwner, dispatch }) {
  return (
    <div className={`rounded-2xl border bg-zinc-900 p-4 ${isActiveOwner ? 'border-red-500/70' : 'border-zinc-800'}`}>
      <div className="flex items-start gap-3">
        <Art name={monsterArt(monster)} className="w-20" />
        <div className="mr-auto">
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

// Another hero's monster on your iPad: just what it is, whose it is and how hurt it is.
function OtherMonster({ monster, owner }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
      <Art name={monsterArt(monster)} className="w-12" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-bold text-red-300">{monster.name}</p>
        <p className="text-sm text-zinc-400">
          {owner ? <span className={HERO_COLORS[owner.color].text}>{owner.name}'s card</span> : monster.objective ? 'In the chamber' : 'No owner'}
          {monster.conditions.length > 0 && ` · ${monster.conditions.join(', ')}`}
        </p>
        <HpBar hp={monster.hp} maxHp={monster.maxHp} />
      </div>
      <span className="shrink-0 text-zinc-300">
        {monster.hp} / {monster.maxHp} HP
      </span>
    </div>
  )
}

// With ownerId (a player's own iPad), that hero's monster cards first, then everyone else's
// below, to look at. `glance`: one short row per monster (beside the virtual board), tap for the full card.
export default function MonsterList({ state, dispatch, ownerId, glance = false }) {
  const activeHero = state.heroes[state.turn.heroIndex]
  const monsters = ownerId ? state.monsters.filter((m) => m.ownerId === ownerId) : state.monsters
  const others = ownerId ? state.monsters.filter((m) => m.ownerId !== ownerId) : []

  return (
    <section className="space-y-6">
      <div>
        <h2 className={`mb-3 font-display font-bold text-zinc-100 ${glance ? 'text-xl' : 'text-2xl'}`}>{ownerId ? 'Your monsters' : 'Monsters'}</h2>
        {monsters.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-zinc-500">
            {others.length > 0 ? 'None of the monsters are yours.' : 'The dungeon is quiet... for now.'}
          </p>
        ) : (
          <div className={glance ? 'space-y-2' : 'grid gap-3 md:grid-cols-2'}>
            {monsters.map((monster) => {
              const owner = state.heroes.find((h) => h.id === monster.ownerId)
              const row = <MonsterRow key={monster.id} monster={monster} owner={owner} isActiveOwner={monster.ownerId === activeHero.id} dispatch={dispatch} />
              if (!glance) return row
              const whose = monster.objective || monster.chamber ? 'In the chamber' : owner ? `${owner.name}'s` : 'No owner'
              return (
                <GlanceRow
                  key={monster.id}
                  monster={monster}
                  highlight={monster.ownerId === activeHero.id}
                  sub={[whose, monster.ac && `AC ${monster.ac}`, !monster.objective && `${monster.xp} XP`].filter(Boolean).join(' · ')}
                  dispatch={dispatch}
                >
                  {row}
                </GlanceRow>
              )
            })}
          </div>
        )}
      </div>
      {others.length > 0 && (
        <div>
          <h2 className="mb-3 font-display text-xl font-bold text-zinc-300">Other heroes' monsters</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {others.map((monster) => (
              <OtherMonster key={monster.id} monster={monster} owner={state.heroes.find((h) => h.id === monster.ownerId)} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
