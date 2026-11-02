import { useState } from 'react'
import Board from './Board.jsx'
import Board3DLazy from './Board3DLazy.jsx'

// The projector's virtual board, flat or in 3D. 🧊 at the bottom of the projector switches
// this screen to the 3D board (saved in this browser, like 🔥). three.js only downloads
// once a screen turns 3D on, and if this device can't draw 3D the flat board comes back.

export { useBoard3D } from './board3dSwitch.js'

export function Board3DToggle({ on, toggle, className = '' }) {
  return (
    <button
      type="button"
      className={`rounded-xl px-3 py-2 transition hover:bg-zinc-800 active:scale-95 ${on ? 'text-zinc-300' : 'text-zinc-500'} ${className}`}
      onClick={toggle}
      aria-pressed={on}
    >
      {on ? '🧊 3D board on' : '🧊 3D board off'}
    </button>
  )
}

export default function ProjectorBoard({ state, on }) {
  const [failed, setFailed] = useState(false)
  const flat = <Board state={state} readOnly fill />
  if (!on || failed) return flat
  return <Board3DLazy state={state} flat={flat} onFail={() => setFailed(true)} />
}
