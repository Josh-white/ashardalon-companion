// @vitest-environment jsdom
// The sync hook every screen uses to stay in step with the Pi: taps are sent, kept until
// the Pi says it got them, sent again after a reconnect, and a new build reloads the page
// only once nothing is waiting.
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./useArt.js', () => ({ refreshArt: vi.fn() }))

class FakeSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static all = []
  constructor(url) {
    this.url = url
    this.readyState = FakeSocket.CONNECTING
    this.sent = []
    FakeSocket.all.push(this)
  }
  send(text) {
    this.sent.push(JSON.parse(text))
  }
  close() {
    this.readyState = FakeSocket.CLOSED
    this.onclose?.()
  }
  // Test helpers: the Pi side.
  open() {
    this.readyState = FakeSocket.OPEN
    this.onopen?.()
  }
  receive(message) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
  drop() {
    this.readyState = FakeSocket.CLOSED
    this.onclose?.()
  }
}

const latest = () => FakeSocket.all.at(-1)
const actions = (socket) => socket.sent.filter((m) => m.type === 'action')

let shared
let reload

beforeEach(async () => {
  vi.useFakeTimers()
  FakeSocket.all = []
  vi.stubGlobal('WebSocket', FakeSocket)
  reload = vi.fn()
  Object.defineProperty(window, 'location', { configurable: true, value: { protocol: 'https:', host: 'pi.local', reload } })
  // Fresh module state (the loaded build, the last state) for each test.
  vi.resetModules()
  shared = await import('./useSharedGame.js')
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useSharedGame', () => {
  it('joins the asked-for game and tells the Pi its seat', () => {
    renderHook(() => shared.useSharedGame('keyleth', 'friday'))
    const socket = latest()
    expect(socket.url).toBe('wss://pi.local/ws?game=friday&patch=1')
    act(() => socket.open())
    expect(socket.sent[0]).toEqual({ type: 'seat', seat: 'keyleth' })
  })

  it('shows each state the Pi sends, with undo and game name', () => {
    const { result } = renderHook(() => shared.useSharedGame('table'))
    const socket = latest()
    act(() => socket.open())
    expect(result.current.connected).toBe(true)
    act(() => socket.receive({ type: 'state', state: { round: 2 }, undo: 'Tarak −1 HP', undoDepth: 3, game: { id: 'family', name: 'Family' } }))
    expect(result.current.state).toEqual({ round: 2 })
    expect(result.current.undo).toBe('Tarak −1 HP')
    expect(result.current.undoDepth).toBe(3)
    expect(result.current.game).toEqual({ id: 'family', name: 'Family' })
  })

  it("puts the game together from the Pi's changes, and asks for all of it after missing one", () => {
    const { result } = renderHook(() => shared.useSharedGame('table'))
    const socket = latest()
    act(() => socket.open())
    const deck = { cards: [1, 2, 3] }
    act(() => socket.receive({ type: 'state', seq: 4, state: { xp: 0, deck, log: [{ id: 'a' }] } }))
    const shownDeck = result.current.state.deck
    act(() => socket.receive({ type: 'state', seq: 5, base: 4, patch: { changes: { xp: 2 }, logAdd: [{ id: 'b' }], logLen: 2 } }))
    expect(result.current.state).toEqual({ xp: 2, deck, log: [{ id: 'b' }, { id: 'a' }] })
    // The rest stays the very same object, so nothing has to be drawn again for it.
    expect(result.current.state.deck).toBe(shownDeck)
    // Missed number 6: this one can't be used, so it asks for the whole game (once).
    act(() => socket.receive({ type: 'state', seq: 7, base: 6, patch: { changes: { xp: 9 } } }))
    act(() => socket.receive({ type: 'state', seq: 8, base: 7, patch: { changes: { xp: 10 } } }))
    expect(result.current.state.xp).toBe(2)
    expect(socket.sent.filter((m) => m.type === 'resync')).toHaveLength(1)
    act(() => socket.receive({ type: 'state', seq: 8, state: { xp: 10, deck, log: [] } }))
    act(() => socket.receive({ type: 'state', seq: 9, base: 8, patch: { changes: { xp: 11 } } }))
    expect(result.current.state.xp).toBe(11)
  })

  it('lets every listener hear two states that arrive together, in order', () => {
    const heard = []
    const stop = shared.onGameState((before, after) => heard.push([before?.n ?? null, after.n]))
    renderHook(() => shared.useSharedGame('table'))
    const socket = latest()
    act(() => {
      socket.open()
      socket.receive({ type: 'state', state: { n: 1 } })
      socket.receive({ type: 'state', state: { n: 2 } })
    })
    expect(heard).toEqual([[null, 1], [1, 2]])
    stop()
  })

  it('keeps a tap made while offline and sends it once the socket opens', () => {
    const { result } = renderHook(() => shared.useSharedGame('table'))
    const socket = latest()
    act(() => result.current.dispatch({ type: 'NEXT_PHASE' }))
    expect(actions(socket)).toHaveLength(0)
    act(() => socket.open())
    expect(actions(socket).map((m) => m.action.type)).toEqual(['NEXT_PHASE'])
  })

  it('sends an unconfirmed tap again after the Wi-Fi drops and comes back', () => {
    const { result } = renderHook(() => shared.useSharedGame('table'))
    const first = latest()
    act(() => first.open())
    act(() => result.current.dispatch({ type: 'DRAW_TILE' }))
    const id = actions(first)[0].id
    act(() => first.drop())
    expect(result.current.connected).toBe(false)
    act(() => vi.advanceTimersByTime(1500))
    const second = latest()
    expect(second).not.toBe(first)
    act(() => second.open())
    expect(actions(second).map((m) => m.id)).toEqual([id])
  })

  it('forgets a tap once the Pi confirms it', () => {
    const { result } = renderHook(() => shared.useSharedGame('table'))
    const first = latest()
    act(() => first.open())
    act(() => result.current.dispatch({ type: 'DRAW_TILE' }))
    act(() => first.receive({ type: 'ack', id: actions(first)[0].id }))
    act(() => first.drop())
    act(() => vi.advanceTimersByTime(1500))
    act(() => latest().open())
    expect(actions(latest())).toHaveLength(0)
  })

  it('starts a fresh socket when a tap goes unconfirmed on a socket that looks open', () => {
    const { result } = renderHook(() => shared.useSharedGame('table'))
    const first = latest()
    act(() => first.open())
    act(() => result.current.dispatch({ type: 'DRAW_TILE' }))
    act(() => vi.advanceTimersByTime(5000))
    expect(FakeSocket.all.length).toBe(2)
    act(() => latest().open())
    expect(actions(latest()).map((m) => m.action.type)).toEqual(['DRAW_TILE'])
  })

  it('reloads for a new build, but only after its taps are confirmed', () => {
    const { result } = renderHook(() => shared.useSharedGame('table'))
    const socket = latest()
    act(() => socket.open())
    act(() => socket.receive({ type: 'state', state: {}, build: 'a' }))
    act(() => result.current.dispatch({ type: 'NEXT_PHASE' }))
    act(() => socket.receive({ type: 'state', state: {}, build: 'b' }))
    expect(reload).not.toHaveBeenCalled()
    act(() => socket.receive({ type: 'ack', id: actions(socket)[0].id }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('tells the screen when the Pi moved it to another game, or out of every game', () => {
    const moved = vi.fn()
    const { result } = renderHook(() => shared.useSharedGame('table', 'old', moved))
    const socket = latest()
    act(() => socket.open())
    act(() => socket.receive({ type: 'state', state: { n: 1 }, game: { id: 'new', name: 'New' } }))
    expect(moved).toHaveBeenLastCalledWith('new')
    act(() => socket.receive({ type: 'no-game' }))
    expect(moved).toHaveBeenLastCalledWith(null)
    expect(result.current.state).toBe(null)
  })

  it('answers "start a new game" with the Pi\'s reply, or offline when there is no socket', async () => {
    const { result } = renderHook(() => shared.useSharedGame('table'))
    await expect(result.current.startGame('Friday')).resolves.toEqual({ type: 'new-game-refused', reason: 'offline' })
    const socket = latest()
    act(() => socket.open())
    const answer = result.current.startGame('Friday')
    const request = socket.sent.find((m) => m.type === 'new-game')
    expect(request.name).toBe('Friday')
    act(() => socket.receive({ type: 'game-created', requestId: request.requestId, id: 'friday' }))
    await expect(answer).resolves.toMatchObject({ type: 'game-created', id: 'friday' })
  })

  it('tells the Pi when the screen changes seats', () => {
    const { rerender } = renderHook(({ seat }) => shared.useSharedGame(seat), { initialProps: { seat: 'table' } })
    const socket = latest()
    act(() => socket.open())
    rerender({ seat: 'tarak' })
    expect(socket.sent.filter((m) => m.type === 'seat').map((m) => m.seat)).toEqual(['table', 'tarak'])
  })

  it('stamps moments by the Pi clock', () => {
    vi.setSystemTime(1_000_000)
    renderHook(() => shared.useSharedGame('table'))
    const socket = latest()
    act(() => socket.open())
    act(() => socket.receive({ type: 'state', state: {}, now: 1_005_000 }))
    expect(shared.serverNow()).toBe(1_005_000)
  })
})
