import { useEffect, useState } from 'react'
import { Button } from './ui.jsx'

const FAMILY_GAME = 'family'

// What a game is up to, in a few words.
export function gameSummary(game) {
  if (game.status === 'setup') return 'Choosing heroes'
  const parts = []
  if (game.heroes.length > 0) parts.push(game.heroes.join(', '))
  if (game.adventure) parts.push(game.adventure)
  if (game.board) parts.push('solo board')
  if (game.status === 'won') parts.push('won!')
  if (game.status === 'lost') parts.push('lost')
  return parts.join(' · ')
}

const when = (time) => {
  if (!time) return null
  const date = new Date(time)
  const today = new Date().toDateString() === date.toDateString()
  return today
    ? `today ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const REFUSED = {
  name: 'Give the game a name first.',
  full: 'There are already as many games as the Pi keeps. Finish one to make room.',
  save: "The Pi couldn't save the new game. Try again.",
  offline: "This iPad isn't connected to the Pi right now. Try again in a moment.",
}

// "Which game?": every game on the Pi, a way to start a new one, and the finished ones.
export default function GamePicker({ current, onPick, onClose, startGame, changeGames, gamesVersion }) {
  const [list, setList] = useState(null)
  const [failed, setFailed] = useState(false)
  const [name, setName] = useState('')
  const [problem, setProblem] = useState(null)
  const [starting, setStarting] = useState(false)
  const [renaming, setRenaming] = useState(null) // { id, name }

  useEffect(() => {
    let stopped = false
    const load = () =>
      fetch('/games.json', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (stopped) return
          setList(data)
          setFailed(false)
        })
        .catch(() => !stopped && setFailed(true))
    load()
    // The screens count changes without news, so look again now and then.
    const timer = setInterval(load, 5000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [gamesVersion])

  const start = async (event) => {
    event.preventDefault()
    setStarting(true)
    const answer = await startGame(name)
    setStarting(false)
    if (answer.type === 'game-created') {
      setName('')
      setProblem(null)
      onPick(answer.id)
    } else setProblem(REFUSED[answer.reason] ?? REFUSED.save)
  }

  const finish = (game) => {
    const others = game.screens > 0 ? ` ${game.screens === 1 ? 'A screen is' : `${game.screens} screens are`} in it right now.` : ''
    if (window.confirm(`Finish "${game.name}"?${others} It goes on the Finished list for ${list.finishedDays} days, where you can bring it back.`)) {
      changeGames({ type: 'finish-game', id: game.id })
    }
  }

  const rename = (event) => {
    event.preventDefault()
    if (renaming.name.trim()) changeGames({ type: 'rename-game', id: renaming.id, name: renaming.name })
    setRenaming(null)
  }

  // A screen that hasn't picked yet, with only the family game there: nothing to ask.
  const onlyFamily = !current && list?.games.length === 1
  useEffect(() => {
    if (onlyFamily) onPick(list.games[0].id)
  }, [onlyFamily]) // eslint-disable-line react-hooks/exhaustive-deps
  if (onlyFamily) return null

  const full = list && list.games.length >= list.max

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-8">
      <div className="flex items-center gap-3">
        <h1 className="mr-auto font-display text-4xl font-bold text-amber-400">Which game?</h1>
        {onClose && (
          <Button variant="ghost" onClick={onClose}>
            Back to my game
          </Button>
        )}
      </div>

      {!list && <p className="text-zinc-400">{failed ? "Can't reach the Pi to list the games. Trying again…" : 'Looking for games…'}</p>}

      {list && (
        <ul className="space-y-3">
          {list.games.map((game) => {
            const here = game.id === current
            return (
              <li key={game.id} className={`rounded-2xl border p-4 ${here ? 'border-amber-500 bg-amber-950/30' : 'border-zinc-800 bg-zinc-900'}`}>
                {renaming?.id === game.id ? (
                  <form className="flex flex-wrap gap-2" onSubmit={rename}>
                    <input
                      id={`rename-${game.id}`}
                      autoFocus
                      maxLength={40}
                      value={renaming.name}
                      onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                      className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-lg text-zinc-100"
                    />
                    <Button type="submit" variant="gold">
                      Save
                    </Button>
                    <Button variant="ghost" onClick={() => setRenaming(null)}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => onPick(game.id)} className="min-w-0 flex-1 text-left transition active:scale-95">
                      <span className="block font-display text-2xl font-bold text-zinc-100">
                        {game.name}
                        {here && <span className="ml-2 align-middle text-sm font-normal text-amber-400">this iPad</span>}
                      </span>
                      <span className="block text-zinc-400">{gameSummary(game)}</span>
                      <span className="block text-sm text-zinc-500">
                        {[game.screens > 0 && `${game.screens} ${game.screens === 1 ? 'screen' : 'screens'} on`, when(game.updatedAt) && `last played ${when(game.updatedAt)}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                    {game.id !== FAMILY_GAME && (
                      <div className="flex gap-1">
                        <Button variant="ghost" className="text-sm" onClick={() => setRenaming({ id: game.id, name: game.name })}>
                          Rename
                        </Button>
                        <Button variant="ghost" className="text-sm" onClick={() => finish(game)}>
                          Finish
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {list && (
        <form onSubmit={start} className="space-y-2 rounded-2xl border border-dashed border-zinc-700 p-4">
          <label htmlFor="new-game-name" className="block font-display text-xl font-bold text-zinc-200">
            Start a new game
          </label>
          {full ? (
            <p className="text-zinc-400">The Pi keeps {list.max} games at a time. Finish one to start another.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <input
                  id="new-game-name"
                  maxLength={40}
                  placeholder="Colton's solo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-lg text-zinc-100"
                />
                <Button type="submit" variant="gold" disabled={starting || !name.trim()}>
                  Start
                </Button>
              </div>
              <p className="text-sm text-zinc-500">You pick the heroes, the adventure, and table or solo board next, just like a new game.</p>
            </>
          )}
          {problem && <p className="text-red-400">{problem}</p>}
        </form>
      )}

      {list?.finished.length > 0 && (
        <details className="rounded-2xl border border-zinc-800 p-4">
          <summary className="cursor-pointer font-display text-xl font-bold text-zinc-300">Finished ({list.finished.length})</summary>
          <p className="mt-2 text-sm text-zinc-500">Finished games are kept for {list.finishedDays} days, then removed.</p>
          <ul className="mt-3 space-y-2">
            {list.finished.map((game) => (
              <li key={game.id} className="flex flex-wrap items-center gap-3">
                <span className="mr-auto text-zinc-300">
                  {game.name} <span className="text-sm text-zinc-500">· finished {when(game.finishedAt)}</span>
                </span>
                <Button className="text-sm" disabled={full} onClick={() => changeGames({ type: 'bring-back-game', id: game.id })}>
                  Bring back
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

// The game this screen is in, with a way to switch, along the top of every screen.
export function GameBar({ name, onSwitch }) {
  if (!name) return null
  return (
    <div className="flex items-center justify-center gap-3 bg-zinc-900 px-4 py-0.5 text-sm text-zinc-400">
      <span className="truncate">🎲 {name}</span>
      <button type="button" className="text-amber-400 underline" onClick={onSwitch}>
        Switch game
      </button>
    </div>
  )
}
