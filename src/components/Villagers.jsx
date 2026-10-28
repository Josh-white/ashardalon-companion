import { useState } from 'react'
import { aliveVillagers } from '../state/adventure.js'
import { foes } from '../state/game.js'
import { rollD20 } from '../state/random.js'
import { DrawMonsterButton } from './MonsterTurns.jsx'
import { DrawTileButton } from './Tiles.jsx'
import { Button, HpBar } from './ui.jsx'

const rollRange = (card) => `${card.roll[0]}–${card.roll[1]}`

// The end of the Hero Phase with villagers in play (Free the Captives): the active player
// rolls to see which villager acts, then walks it through its card one question at a time.
export function VillagerTurn({ state, hero, dispatch }) {
  if (aliveVillagers(state).length === 0) return null
  const turnRoll = state.turn.villagerRoll
  if (!turnRoll) {
    return (
      <div className="mt-4 rounded-2xl border-2 border-emerald-700 bg-emerald-950/50 p-4">
        <p className="text-sm font-bold uppercase tracking-widest text-emerald-300">When you’re done with your Hero Phase · Villagers</p>
        <p className="mt-1 text-xl text-zinc-100">Roll to see which villager {hero.name} activates.</p>
        <p className="mt-1 text-emerald-200">
          {state.villagers.map((v) => `${v.name} ${rollRange(v.card)}${v.removed ? ' (gone)' : ''}`).join(' · ')}
        </p>
        <Button variant="gold" className="mt-3 w-full py-3 text-lg" onClick={() => dispatch({ type: 'VILLAGER_ROLL', roll: rollD20() })}>
          🎲 Roll for a villager
        </Button>
      </div>
    )
  }
  const villager = state.villagers.find((v) => v.id === turnRoll.villagerId)
  return (
    <div className="mt-4 rounded-2xl border-2 border-emerald-700 bg-emerald-950/50 p-4">
      <p className="text-sm font-bold uppercase tracking-widest text-emerald-300">Villager roll: {turnRoll.roll}</p>
      {villager ? (
        <VillagerSteps key={`${state.turn.round}-${state.turn.heroIndex}`} state={state} villager={villager} hero={hero} dispatch={dispatch} />
      ) : (
        <p className="mt-1 text-xl text-zinc-100">That villager is no longer in play, so no villager acts this turn.</p>
      )}
    </div>
  )
}

function VillagerSteps({ state, villager, hero, dispatch }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [answered, setAnswered] = useState(false)
  const [done, setDone] = useState(false)
  const { card } = villager
  const step = card.tactics[stepIndex]
  const turnRoll = state.turn.villagerRoll
  // Anything a villager can punch: monsters and villains, not an Altar or the Vast Gate.
  const targets = foes(state).filter((m) => !m.objective)

  if (villager.removed) return <p className="mt-1 text-xl text-zinc-100">{villager.name} is gone.</p>
  if (done || !step) {
    return (
      <p className="mt-1 text-xl text-emerald-200">
        ✓ {villager.name} is done. {done ? '' : 'Follow the card.'}
      </p>
    )
  }
  const asking = step.ask && !answered
  return (
    <div className="mt-1 space-y-3">
      <h4 className="font-display text-2xl font-bold text-emerald-200">
        {villager.name} acts
        <span className="ml-2 text-base font-normal text-zinc-400">
          AC {villager.ac} · {villager.hp} HP
        </span>
      </h4>
      {asking ? (
        <>
          <p className="text-2xl font-semibold text-zinc-100">{step.ask}</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="gold" className="py-4 text-2xl" onClick={() => setAnswered(true)}>
              Yes
            </Button>
            <Button className="py-4 text-2xl" onClick={() => setStepIndex((i) => i + 1)}>
              No
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xl text-zinc-100">{step.say}</p>
          {step.draw && <DrawTileButton state={state} dispatch={dispatch} drawKey={`villager-${villager.id}`} from="bottom" />}
          {step.draw && <DrawMonsterButton state={state} heroId={hero.id} dispatch={dispatch} drawKey={`villager-${villager.id}`} className="w-full" label="🐉 Draw a monster for that tile" />}
          {step.attack && !turnRoll.attacked && (
            <div className="space-y-2">
              <p className="text-lg text-zinc-300">
                Which monster does {villager.name} punch? ({card.attack.name} +{card.attack.bonus}, {card.attack.damage} damage)
              </p>
              <div className="grid grid-cols-2 gap-2">
                {targets.map((m) => (
                  <Button key={m.id} variant="danger" className="text-left" onClick={() => dispatch({ type: 'VILLAGER_ATTACK', villagerId: villager.id, monsterId: m.id, roll: rollD20() })}>
                    🎲 {m.name}
                    <span className="block text-sm opacity-80">AC {m.ac} · {m.hp} HP</span>
                  </Button>
                ))}
              </div>
              {targets.length === 0 && <p className="text-zinc-400">There are no monsters to punch.</p>}
            </div>
          )}
          {step.attack && turnRoll.attacked && <p className="text-emerald-200">✓ {villager.name} punched. See the roll above.</p>}
          <Button variant="gold" className="w-full py-3 text-lg" onClick={() => setDone(true)}>
            Done with {villager.name}
          </Button>
        </>
      )}
    </div>
  )
}

// The villagers in the adventure box: who's still in play, their HP, and their roll ranges.
export function VillagerList({ state, dispatch, big = false }) {
  const villagers = state.villagers ?? []
  if (villagers.length === 0) return null
  if (big) {
    return (
      <div className="mt-[1vh] flex flex-wrap gap-[1vw]">
        {villagers.map((v) => (
          <div key={v.id} className={`min-w-[14vw] rounded-[1vw] border-2 p-[0.6vw] ${v.removed ? 'border-zinc-800 opacity-40' : 'border-emerald-700 bg-emerald-950/40'}`}>
            <div className="font-display text-[1.8vw] font-bold text-emerald-200">🧑‍🌾 {v.name}</div>
            <div className="text-[1.3vw] text-zinc-300">{v.removed ? 'gone' : `${v.hp} / ${v.maxHp} HP · AC ${v.ac} · rolls ${rollRange(v.card)}`}</div>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="mt-3">
      <p className="font-semibold text-emerald-300">Villagers</p>
      <ul className="mt-1 space-y-2">
        {villagers.map((v) => (
          <li key={v.id} className={`flex items-center gap-3 rounded-xl bg-zinc-950/50 p-2 ${v.removed ? 'opacity-50' : ''}`}>
            <span className="min-w-0 flex-1">
              <span className="font-semibold text-emerald-200">{v.name}</span>
              <span className="text-sm text-zinc-400"> · AC {v.ac} · rolls {rollRange(v.card)}</span>
              {v.removed ? <span className="block text-sm text-zinc-500">Gone</span> : <HpBar hp={v.hp} maxHp={v.maxHp} />}
            </span>
            {!v.removed && dispatch && (
              <>
                <Button className="h-10 w-10 !px-0 text-xl" onClick={() => dispatch({ type: 'ADJUST_VILLAGER_HP', villagerId: v.id, amount: -1 })}>
                  −
                </Button>
                <span className="w-12 text-center text-lg font-bold text-zinc-100">{v.hp} HP</span>
                <Button className="h-10 w-10 !px-0 text-xl" onClick={() => dispatch({ type: 'ADJUST_VILLAGER_HP', villagerId: v.id, amount: 1 })}>
                  +
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
