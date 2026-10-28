import { useCallback, useEffect, useRef, useState } from 'react'
import { refreshArt } from './useArt.js'

const RECONNECT_DELAY_MS = 1500
// How long a tap may wait for the Pi to say it got it before this screen reconnects.
const ACK_TIMEOUT_MS = 4000
// The build of the screens the Pi handed out when this screen loaded.
let loadedBuild = null

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
  // Taps the Pi hasn't confirmed yet: { id, action, sentAt }. They're sent again after a
  // reconnect, so a tap made while the iPad was off the Wi-Fi isn't lost.
  const pendingRef = useRef([])
  const reloadRef = useRef(false)

  useEffect(() => {
    let stopped = false
    let retryTimer

    const sendPending = (socket) => {
      for (const p of pendingRef.current) {
        socket.send(JSON.stringify({ type: 'action', action: p.action, id: p.id }))
        p.sentAt = Date.now()
      }
    }
    // Reload for a new build only once nothing is waiting to be sent.
    const reloadWhenIdle = () => {
      if (reloadRef.current && pendingRef.current.length === 0) window.location.reload()
    }

    const connect = () => {
      const socket = new WebSocket(socketUrl())
      socketRef.current = socket
      socket.onopen = () => {
        setConnected(true)
        sendPending(socket)
        // A sleeping iPad misses news of new card pictures, so look again on every (re)connect.
        refreshArt()
      }
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.type === 'state') {
          setState(message.state)
          setUndo(message.undo ?? null)
          setUndoDepth(message.undoDepth ?? 0)
          setInstance(message.instance ?? null)
          // The Pi was updated since this screen loaded: reload to get the new screens.
          // The game itself lives on the Pi, so nothing is lost.
          if (message.build) {
            if (loadedBuild === null) loadedBuild = message.build
            else if (message.build !== loadedBuild) {
              reloadRef.current = true
              reloadWhenIdle()
            }
          }
        } else if (message.type === 'ack') {
          pendingRef.current = pendingRef.current.filter((p) => p.id !== message.id)
          reloadWhenIdle()
        } else if (message.type === 'art') {
          // Someone saved a card picture: show it here too.
          refreshArt()
        }
      }
      socket.onclose = () => {
        if (socketRef.current !== socket) return // replaced by a fresh one already
        setConnected(false)
        if (!stopped) retryTimer = setTimeout(connect, RECONNECT_DELAY_MS)
      }
    }

    // A socket can look open after the iPad lost the Wi-Fi. If a tap goes unconfirmed,
    // drop that socket and start a fresh one, which sends the tap again.
    const reconnectNow = () => {
      const old = socketRef.current
      socketRef.current = null
      old?.close()
      setConnected(false)
      clearTimeout(retryTimer)
      connect()
    }
    const watchdog = setInterval(() => {
      const socket = socketRef.current
      const stale = pendingRef.current.some((p) => p.sentAt && Date.now() - p.sentAt > ACK_TIMEOUT_MS)
      if (stale && socket?.readyState === WebSocket.OPEN) reconnectNow()
    }, 1000)

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
      clearInterval(watchdog)
      socketRef.current?.close()
    }
  }, [])

  const dispatch = useCallback((action) => {
    const pending = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, action, sentAt: null }
    pendingRef.current.push(pending)
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'action', action, id: pending.id }))
      pending.sentAt = Date.now()
    }
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
