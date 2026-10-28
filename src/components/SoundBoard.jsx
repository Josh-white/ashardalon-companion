import { useEffect, useState } from 'react'
import { BOARD_SOUNDS, USES_PER_TURN, boardOf, boardStatus } from '../state/soundboard.js'

// Re-renders every half second while `active`, so countdowns tick down.
function useTicking(active) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(timer)
  }, [active])
}

const whoName = (state, who) => {
  if (who === 'table') return 'The table'
  const hero = state.heroes.find((h) => h.id === who)
  return hero ? hero.player || hero.name : 'Someone'
}

// A 🔊 button in the corner that opens the sound board. `who` is this iPad's hero id
// (or 'table'). The sounds play on the projector; the limits are in state/soundboard.js.
export function SoundBoard({ state, dispatch, who }) {
  const [open, setOpen] = useState(false)
  // A tap waits for the Pi's answer before the next one, so a double tap doesn't count twice.
  const [sentAt, setSentAt] = useState(0)
  const board = boardOf(state)
  useEffect(() => setSentAt(0), [board.last?.id])
  const status = boardStatus(state, who)
  useTicking(open && !status.ok)
  if (state.status !== 'playing') return null
  const waiting = Date.now() - sentAt < 2000
  const ready = status.ok && !waiting

  const play = (sound) => {
    if (!ready) return
    setSentAt(Date.now())
    dispatch({ type: 'PLAY_BOARD_SOUND', who, sound })
  }

  return (
    <div className="fixed bottom-4 left-4 z-40">
      {open && (
        <div className="mb-2 w-72 rounded-2xl border border-zinc-700 bg-zinc-900/95 p-3 shadow-xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-amber-400">Sound board</h2>
            <span className="text-sm text-zinc-400" aria-label={`${status.usesLeft} of ${USES_PER_TURN} left this turn`}>
              {'🔊'.repeat(status.usesLeft)}
              <span className="opacity-30">{'🔊'.repeat(USES_PER_TURN - status.usesLeft)}</span>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {BOARD_SOUNDS.map((s) => (
              <button
                key={s.key}
                type="button"
                disabled={!ready}
                onClick={() => play(s.key)}
                className="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-2 py-2 text-left text-sm text-zinc-100 transition active:scale-95 enabled:hover:bg-zinc-700 disabled:opacity-40"
              >
                <span className="text-xl">{s.emoji}</span>
                {s.label}
              </button>
            ))}
          </div>
          <p className="mt-2 min-h-5 text-center text-sm text-zinc-400">
            {ready ? `${status.usesLeft} left this turn · plays on the big screen` : waiting ? 'Playing…' : status.reason}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`rounded-full border px-4 py-2 text-sm font-semibold shadow-lg transition active:scale-95 ${
          open ? 'border-amber-500 bg-zinc-900 text-amber-300' : 'border-zinc-700 bg-zinc-900/95 text-zinc-300'
        } ${board.off ? 'opacity-50' : ''}`}
      >
        {open ? '✕ Close' : '🎛️ Sounds'}
      </button>
    </div>
  )
}

// Turns the sound board on or off for every iPad. Only on the shared screens.
export function BoardSwitch({ state, dispatch, className = '' }) {
  const { off } = boardOf(state)
  return (
    <button
      type="button"
      className={`rounded-xl px-3 py-2 transition hover:bg-zinc-800 active:scale-95 ${off ? 'text-zinc-500' : 'text-zinc-300'} ${className}`}
      onClick={() => dispatch({ type: 'SET_SOUNDBOARD_OFF', off: !off })}
      aria-pressed={!off}
    >
      {off ? '🎛️ Sound board off' : '🎛️ Sound board on'}
    </button>
  )
}

const TOAST_MS = 3000

// "🎺 Kai played Fanfare" on the projector for a moment, so everyone knows who it was.
export function BoardToast({ state, big = false }) {
  const last = boardOf(state).last
  const [shown, setShown] = useState(null)
  useEffect(() => {
    if (!last || Date.now() - last.at > TOAST_MS) return
    setShown(last)
    const hide = setTimeout(() => setShown(null), TOAST_MS)
    return () => clearTimeout(hide)
  }, [last?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!shown) return null
  const sound = BOARD_SOUNDS.find((s) => s.key === shown.sound)
  return (
    <div
      className={`pointer-events-none fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border border-amber-600 bg-zinc-900/95 font-semibold text-amber-200 shadow-lg ${
        big ? 'px-[1.5vw] py-[1vh] text-[1.6vw]' : 'px-4 py-2 text-sm'
      }`}
    >
      {sound?.emoji} {whoName(state, shown.who)} played {sound?.label ?? shown.sound}
    </div>
  )
}
