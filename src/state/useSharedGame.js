import { useCallback, useEffect, useRef, useState } from 'react'
import { refreshArt } from './useArt.js'

const RECONNECT_DELAY_MS = 1500
// How long a tap may wait for the Pi to say it got it before this screen reconnects.
const ACK_TIMEOUT_MS = 4000
// The build of the screens the Pi handed out when this screen loaded.
let loadedBuild = null
// How far the Pi's clock is ahead of this device's, from the last state it sent.
let clockOffset = 0
// The last state this page got, and everyone who wants to hear about each new one.
let lastState = null
const listeners = new Set()

// Now, by the Pi's clock. Moments are stamped by the Pi, so an iPad whose clock is
// a few seconds off still knows a moment is fresh.
export const serverNow = () => Date.now() + clockOffset

// Calls `listener(before, after)` for every state the Pi sends, even two that arrive
// before React gets to show the first, so no moment's sound or line is skipped.
// `before` is null for the first state this page sees. Returns the unsubscribe.
export function onGameState(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// The family game is the one every screen used before there could be several.
export const FAMILY_GAME = 'family'

function socketUrl(game) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws?game=${encodeURIComponent(game)}`
}

// onGameState for a component: `listener` may be a new function each render.
export function useGameStates(listener) {
  const latest = useRef(listener)
  latest.current = listener
  useEffect(() => onGameState((before, after) => latest.current(before, after)), [])
}

// Keeps this device in step with one game on the Pi. Actions go to the server,
// which applies them and sends the new state to every device in that game.
// `onMoved(id)` hears when the Pi put this screen in another game, because the one it
// asked for was finished.
export function useSharedGame(seat, game = FAMILY_GAME, onMoved) {
  const onMovedRef = useRef(onMoved)
  onMovedRef.current = onMoved
  const [state, setState] = useState(null)
  // The game this screen is in, as the Pi names it: { id, name }.
  const [gameInfo, setGameInfo] = useState(null)
  // Goes up whenever the list of games changes, so the "Which game?" screen looks again.
  const [gamesVersion, setGamesVersion] = useState(0)
  // Answers to "start a new game", waiting by request id.
  const requestsRef = useRef(new Map())
  const [connected, setConnected] = useState(false)
  // The seats with a screen open right now ('projector', 'table', hero keys).
  const [screens, setScreens] = useState([])
  const seatRef = useRef(seat)
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
    // A different game: its first state isn't a change from the last game's, and taps
    // made in the last game don't belong in this one.
    lastState = null
    pendingRef.current = []
    setState(null)
    setGameInfo(null)

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
      const socket = new WebSocket(socketUrl(game))
      socketRef.current = socket
      socket.onopen = () => {
        setConnected(true)
        socket.send(JSON.stringify({ type: 'seat', seat: seatRef.current ?? null }))
        sendPending(socket)
        // A sleeping iPad misses news of new card pictures, so look again on every (re)connect.
        refreshArt()
      }
      socket.onmessage = (event) => {
        if (socketRef.current !== socket) return // from the game this screen just left
        const message = JSON.parse(event.data)
        if (message.type === 'state') {
          if (message.game) {
            setGameInfo(message.game)
            if (message.game.id !== game) onMovedRef.current?.(message.game.id)
          }
          if (typeof message.now === 'number') clockOffset = message.now - Date.now()
          const before = lastState
          lastState = message.state
          for (const listener of listeners) {
            try {
              listener(before, message.state)
            } catch (error) {
              console.error(error)
            }
          }
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
        } else if (message.type === 'screens') {
          setScreens(Array.isArray(message.seats) ? message.seats : [])
        } else if (message.type === 'no-game') {
          // A friend's screen isn't in a game (the one it asked for isn't theirs, or was
          // finished, or they were taken out of it): back to "Which game?".
          lastState = null
          setState(null)
          setGameInfo(null)
          onMovedRef.current?.(null)
        } else if (message.type === 'games') {
          setGamesVersion((v) => v + 1)
        } else if (message.type === 'game-created' || message.type === 'new-game-refused') {
          const resolve = requestsRef.current.get(message.requestId)
          requestsRef.current.delete(message.requestId)
          resolve?.(message)
          // Bringing back a finished game has no request: a refusal there means it's full.
          if (!resolve && message.type === 'new-game-refused') setGamesVersion((v) => v + 1)
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
      const socket = socketRef.current
      socketRef.current = null
      socket?.close()
    }
  }, [game])

  // Tell the Pi when this screen changes seats.
  useEffect(() => {
    seatRef.current = seat
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'seat', seat: seat ?? null }))
  }, [seat])

  const dispatch = useCallback((action) => {
    const pending = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, action, sentAt: null }
    pendingRef.current.push(pending)
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'action', action, id: pending.id }))
      pending.sentAt = Date.now()
    }
  }, [])

  // Starts, renames, finishes or brings back a game: { type: 'rename-game', id, name } and so on.
  const changeGames = useCallback((message) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }, [])

  // Starts a new game called `name`. Resolves to the Pi's answer: { type: 'game-created', id }
  // or { type: 'new-game-refused', reason: 'name' | 'full' | 'save' | 'offline' }.
  const startGame = useCallback((name) => {
    const socket = socketRef.current
    if (socket?.readyState !== WebSocket.OPEN) return Promise.resolve({ type: 'new-game-refused', reason: 'offline' })
    const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    return new Promise((resolve) => {
      requestsRef.current.set(requestId, resolve)
      socket.send(JSON.stringify({ type: 'new-game', name, requestId }))
    })
  }, [])

  return { state, connected, dispatch, undo, undoDepth, instance, screens, game: gameInfo, gamesVersion, changeGames, startGame }
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

// A value this device remembers, such as its seat. Storage can be blocked; the
// choice then lasts until the page reloads.
function useStored(key) {
  const read = () => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }
  const [stored, setStored] = useState(() => ({ key, value: read() }))
  // A new key (another game's seat) reads that key's value straight away.
  const value = stored.key === key ? stored.value : read()
  const setValue = useCallback(
    (next) => {
      setStored({ key, value: next })
      try {
        if (next) localStorage.setItem(key, next)
        else localStorage.removeItem(key)
      } catch {
        // See above.
      }
    },
    [key],
  )
  return [value, setValue]
}

const SEAT_KEY = 'ashardalon-companion/seat'

// Which hero this device belongs to in a game ("table" for the shared screen). Stored
// per device and per game, so each iPad remembers its player in every game.
export function useSeat(game = FAMILY_GAME) {
  return useStored(game === FAMILY_GAME ? SEAT_KEY : `${SEAT_KEY}/${game}`)
}

// What this screen said it is on "Who stands here?" ('hero', 'big' or 'solo'), or null
// before it has said. Each game asks once.
const SCREEN_KEY = 'ashardalon-companion/screen'
export function useScreenRole(game = FAMILY_GAME) {
  return useStored(game === FAMILY_GAME ? SCREEN_KEY : `${SCREEN_KEY}/${game}`)
}

// The game this device is in, or null before it has picked one.
export function useGameChoice() {
  return useStored('ashardalon-companion/game')
}
