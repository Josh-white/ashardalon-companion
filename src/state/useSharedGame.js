import { useCallback, useEffect, useRef, useState } from 'react'

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

  return { state, connected, dispatch, undo }
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
