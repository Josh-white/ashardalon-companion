import { useEffect, useReducer } from 'react'
import HeroCard from './components/HeroCard.jsx'
import MonsterList from './components/MonsterList.jsx'
import Setup from './components/Setup.jsx'
import TurnGuide from './components/TurnGuide.jsx'
import { Button } from './components/ui.jsx'
import { gameReducer, loadGame, saveGame } from './state/game.js'

function PartyBar({ state, dispatch }) {
  const newGame = () => {
    if (window.confirm('Start a new game? This clears the current one.')) dispatch({ type: 'NEW_GAME' })
  }
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <h1 className="font-display text-xl font-bold text-amber-400">Wrath of Ashardalon</h1>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">XP</span>
          <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_XP', amount: -1 })}>−</Button>
          <span className="w-8 text-center text-2xl font-bold text-amber-400">{state.xp}</span>
          <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_XP', amount: 1 })}>+</Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">Healing surges</span>
          <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_SURGES', amount: -1 })}>−</Button>
          <span className={`text-2xl ${state.surges === 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {state.surges === 0 ? '0' : '❤'.repeat(state.surges)}
          </span>
          <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_SURGES', amount: 1 })}>+</Button>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" className="text-sm" onClick={() => dispatch({ type: 'END_GAME', result: 'won' })}>
            We won!
          </Button>
          <Button variant="ghost" className="text-sm" onClick={newGame}>
            New game
          </Button>
        </div>
      </div>
      {state.surges === 0 && (
        <p className="bg-red-950 px-4 py-1 text-center text-sm font-semibold text-red-300">
          No healing surges left! If a hero starts a turn at 0 HP, the party loses.
        </p>
      )}
    </header>
  )
}

function GameOver({ state, dispatch }) {
  const won = state.status === 'won'
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-zinc-950/90 p-6">
      <div className="max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <div className="text-6xl">{won ? '🏆' : '💀'}</div>
        <h2 className={`mt-4 font-display text-4xl font-bold ${won ? 'text-amber-400' : 'text-red-400'}`}>
          {won ? 'Victory!' : 'The party has fallen'}
        </h2>
        <p className="mt-2 text-zinc-400">
          {state.turn.round} rounds · {state.xp} XP left in the pool
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button onClick={() => dispatch({ type: 'RESUME' })}>Back to the game</Button>
          <Button variant="gold" onClick={() => dispatch({ type: 'NEW_GAME' })}>
            New game
          </Button>
        </div>
      </div>
    </div>
  )
}

function GameLog({ log }) {
  if (log.length === 0) return null
  return (
    <section>
      <h2 className="mb-2 font-display text-xl font-bold text-zinc-300">Story so far</h2>
      <ul className="space-y-1 text-sm text-zinc-400">
        {log.slice(0, 8).map((entry) => (
          <li key={entry.id}>
            <span className="text-zinc-600">Round {entry.round}:</span> {entry.text}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, () => loadGame())

  useEffect(() => saveGame(state), [state])

  if (state.status === 'setup') {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <Setup onStart={(heroes) => dispatch({ type: 'START_GAME', heroes })} />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <PartyBar state={state} dispatch={dispatch} />
      <div className="mx-auto max-w-6xl space-y-8 p-4">
        <TurnGuide state={state} dispatch={dispatch} />
        <section>
          <h2 className="mb-3 font-display text-2xl font-bold text-zinc-100">Heroes</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {state.heroes.map((hero, i) => (
              <HeroCard
                key={hero.id}
                hero={hero}
                isActive={i === state.turn.heroIndex}
                xp={state.xp}
                surges={state.surges}
                dispatch={dispatch}
              />
            ))}
          </div>
        </section>
        <MonsterList state={state} dispatch={dispatch} />
        <GameLog log={state.log} />
      </div>
      {(state.status === 'won' || state.status === 'lost') && <GameOver state={state} dispatch={dispatch} />}
    </main>
  )
}
