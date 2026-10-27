import { useCallback, useEffect, useRef, useState } from 'react'
import { refreshArt } from './useArt.js'

const RECONNECT_DELAY_MS = 1500

function socketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

// Keeps this device in step with the game on the Pi. Actions go to the server,
// which applies them and sends the new state to every connected device.
export function useSharedGame() {
  const [state, setState] = useState(null)
  const [connected, setConnected] = useState(false)
  const [undo, setUndo] = useState(null)
  const [undoDepth, setUndoDepth] = useState(0)
  const [instance, setInstance] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => {
    let stopped = false
    let retryTimer

    const connect = () => {
      const socket = new WebSocket(socketUrl())
      socketRef.current = socket
      socket.onopen = () => setConnected(true)
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.type === 'state') {
          setState(message.state)
          setUndo(message.undo ?? null)
          setUndoDepth(message.undoDepth ?? 0)
          setInstance(message.instance ?? null)
        } else if (message.type === 'art') {
          // Someone saved a card picture: show it here too.
          refreshArt()
        }
      }
      socket.onclose = () => {
        setConnected(false)
        if (!stopped) retryTimer = setTimeout(connect, RECONNECT_DELAY_MS)
      }
    }

    connect()
    // iPads drop sockets when they sleep; reconnect as soon as the page is visible again.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && socketRef.current?.readyState === WebSocket.CLOSED) {
        clearTimeout(retryTimer)
        connect()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped = true
      clearTimeout(retryTimer)
      document.removeEventListener('visibilitychange', onVisible)
      socketRef.current?.close()
    }
  }, [])

  const dispatch = useCallback((action) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'action', action }))
  }, [])

  return { state, connected, dispatch, undo, undoDepth, instance }
}

const DEVICE_KEY = 'ashardalon-companion/device'

// A random id for this iPad, so the setup screen knows which hero it claimed.
export function useDeviceId() {
  const [id] = useState(() => {
    try {
      const saved = localStorage.getItem(DEVICE_KEY)
      if (saved) return saved
    } catch {
      // Storage blocked: a fresh id each load still works for one sitting.
    }
    const bytes = crypto.getRandomValues(new Uint8Array(8))
    const fresh = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    try {
      localStorage.setItem(DEVICE_KEY, fresh)
    } catch {
      // See above.
    }
    return fresh
  })
  return id
}

const SEAT_KEY = 'ashardalon-companion/seat'

// Which hero this device belongs to ("table" for the shared screen). Stored per
// device, so each iPad remembers its player.
export function useSeat() {
  const [seat, setSeatState] = useState(() => {
    try {
      return localStorage.getItem(SEAT_KEY)
    } catch {
      return null
    }
  })
  const setSeat = useCallback((value) => {
    setSeatState(value)
    try {
      if (value) localStorage.setItem(SEAT_KEY, value)
      else localStorage.removeItem(SEAT_KEY)
    } catch {
      // Storage can be blocked; the choice then lasts until the page reloads.
    }
  }, [])
  return [seat, setSeat]
}
