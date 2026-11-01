import { Component } from 'react'
import { Button } from './ui.jsx'

// How long the "Something went wrong" screen waits before it reloads by itself, and how
// soon after one of those reloads it gives up and leaves it to a tap instead (so a screen
// that breaks the same way every time doesn't reload over and over).
export const RELOAD_AFTER_MS = 5000
const AGAIN_WITHIN_MS = 60000
const KEY = 'ashardalon-companion/crash-reload'

// True when this screen already reloaded itself a moment ago.
export function reloadedRecently(now = Date.now()) {
  try {
    return now - Number(sessionStorage.getItem(KEY) ?? 0) < AGAIN_WITHIN_MS
  } catch {
    return true
  }
}

function reload() {
  try {
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // Storage blocked: the reload still happens.
  }
  window.location.reload()
}

// Wraps the whole app. Without it, one part of a screen that throws while drawing (an
// ally's step, an attack animation) blanks the whole iPad or big screen. The game itself is
// safe on the Pi, so a reload brings the screen straight back to where everyone is.
export default class CrashScreen extends Component {
  state = { error: null, reloading: false }
  timer = null

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('A screen crashed:', error, info?.componentStack)
    if (reloadedRecently()) return
    this.timer = setTimeout(reload, RELOAD_AFTER_MS)
    this.setState({ reloading: true })
  }

  componentWillUnmount() {
    clearTimeout(this.timer)
  }

  render() {
    const { error, reloading } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 p-6 text-center text-zinc-100">
        <p className="text-5xl">🐉💥</p>
        <h1 className="text-2xl font-bold">Something went wrong on this screen</h1>
        <p className="max-w-md text-zinc-400">The game is safe. {reloading ? 'This screen will reload in a moment.' : 'Tap Reload to get back to it.'}</p>
        <Button variant="gold" onClick={reload}>
          Reload
        </Button>
        <p className="max-w-md text-xs text-zinc-600">{String(error?.message ?? error)}</p>
      </div>
    )
  }
}
