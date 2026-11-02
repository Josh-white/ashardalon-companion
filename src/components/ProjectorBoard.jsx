import { Component, lazy, Suspense, useState } from 'react'
import Board from './Board.jsx'

// The projector's virtual board, flat or in 3D. 🧊 at the bottom of the projector switches
// this screen to the 3D board (saved in this browser, like 🔥). three.js only downloads
// once a screen turns 3D on, and if this device can't draw 3D the flat board comes back.

const Board3D = lazy(() => import('./Board3D.jsx'))
const KEY = 'ashardalon-board3d'

function wanted() {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

export function useBoard3D() {
  const [on, setOn] = useState(wanted)
  const toggle = () => {
    setOn(!on)
    try {
      localStorage.setItem(KEY, on ? 'off' : 'on')
    } catch {
      // Private mode: the switch lasts until the page reloads.
    }
  }
  return [on, toggle]
}

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

// A crash inside the 3D board shows the flat board instead of taking the screen down.
class Fallback extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error) {
    console.warn('3D board failed, showing the flat board', error)
  }
  render() {
    return this.state.failed ? this.props.flat : this.props.children
  }
}

export default function ProjectorBoard({ state, on }) {
  const [failed, setFailed] = useState(false)
  const flat = <Board state={state} readOnly fill />
  if (!on || failed) return flat
  return (
    <Fallback flat={flat}>
      <Suspense fallback={flat}>
        <Board3D state={state} onFail={() => setFailed(true)} />
      </Suspense>
    </Fallback>
  )
}
