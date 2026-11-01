import { useEffect, useRef, useState } from 'react'
import { FX_DELAY_MS, FX_MS } from '../board/attackFx.js'
import { SQUARE } from './TileDrawing.jsx'
import { serverNow } from '../state/useSharedGame.js'
import { chained, drawFrame, IMPACT, msAt, shotOffset, slowMo, wipe } from './attackFxDraw.js'

// Plays an attack's animation (board/attackFx.js) over the virtual board: lightning,
// a sword swing, an arrow, a fireball and so on, flying from the attacker's token to
// each target, then the hit, the miss or the fall. Colton's idea. The tokens themselves
// flinch, dodge and lunge with CSS (tokenFx below); everything else is drawn here on a
// canvas laid over the board.

// A device that reconnects shouldn't replay an attack that is long over.
const STALE_MS = 8000
const MELEE = new Set(['weapon', 'slash', 'bite', 'claw'])

// The attack this board is showing right now, or null. It starts once the moment's die
// has been read (MomentOverlay steps aside then).
export function useAttackFx(moment) {
  const [playing, setPlaying] = useState(null)
  const timers = useRef([])
  // Only a new attack replaces the one playing: a moment that follows straight after
  // (the treasure for a defeated monster, the next monster's turn) lets it finish.
  useEffect(() => {
    if (!moment?.fx || serverNow() - moment.at > STALE_MS) return
    timers.current.forEach(clearTimeout)
    timers.current = [
      setTimeout(() => setPlaying({ id: moment.id, fx: moment.fx }), FX_DELAY_MS),
      setTimeout(() => setPlaying(null), FX_DELAY_MS + FX_MS + 800),
    ]
  }, [moment?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  return playing
}

const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1]
const px = (n) => `${Math.round(n)}px`

// The CSS that makes the token on `square` react: the target flinches when hit or dodges a
// miss, and a fighter (or a monster's claws and jaws) lunges in. { className, style } or null.
export function tokenFx(playing, square) {
  if (!playing || !square) return null
  const { fx } = playing
  const shotIndex = fx.shots.findIndex((s) => same(s.to, square))
  if (shotIndex >= 0) {
    const shot = fx.shots[shotIndex]
    const delay = msAt(IMPACT + shotOffset(fx, shotIndex))
    if (shot.result === 'miss') {
      const from = chained(fx) && shotIndex > 0 ? fx.shots[shotIndex - 1].to : fx.from
      const [dx, dy] = [shot.to[0] - from[0], shot.to[1] - from[1]]
      const len = Math.hypot(dx, dy) || 1
      // Sideways, a little away from the attack.
      const away = [(-dy / len) * 0.3 + (dx / len) * 0.12, (dx / len) * 0.3 + (dy / len) * 0.12]
      return { className: 'fx-dodge', style: { '--fx-delay': `${delay - 150}ms`, '--fx-dx': px(away[0] * SQUARE), '--fx-dy': px(away[1] * SQUARE) } }
    }
    return { className: 'fx-flinch', style: { '--fx-delay': `${delay}ms` } }
  }
  if (same(fx.from, square) && MELEE.has(fx.look) && fx.shots.length === 1) {
    const [dx, dy] = [fx.shots[0].to[0] - fx.from[0], fx.shots[0].to[1] - fx.from[1]]
    const len = Math.hypot(dx, dy) || 1
    // Up to most of a square towards the target, but never past it.
    const reach = Math.min(0.75, Math.max(0, len - 0.9)) / len
    return { className: 'fx-lunge', style: { '--fx-delay': `${msAt(IMPACT - 0.2)}ms`, '--fx-dx': px(dx * reach * SQUARE), '--fx-dy': px(dy * reach * SQUARE) } }
  }
  return null
}

// Whether the board shakes when this attack lands: any hit does.
export const quakes = (playing) => Boolean(playing?.fx.shots.some((s) => s.result !== 'miss'))
export const quakeDelay = () => `${msAt(IMPACT)}ms`

// The canvas over the board. `anchor` is an empty <g> inside the board's turned group,
// whose screen matrix turns board squares into screen points. `artFor(key)` gives the
// picture for a defeated monster's token, which is already off the board.
export default function AttackFx({ playing, anchorRef, artFor }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current
    // jsdom (the screen tests) has no canvas.
    const g = playing && !/jsdom/i.test(navigator.userAgent) && canvas?.getContext?.('2d')
    if (!g || !anchorRef.current?.getScreenCTM) return
    const fx = playing.fx
    const pictures = fx.shots.map((s) => {
      const url = s.art && artFor(s.art)
      if (!url) return null
      const img = new Image()
      img.src = url
      return img
    })
    const scene = { g, fx, parts: [], done: new Set(), pictures, scorch: [] }
    const begin = performance.now()
    let frame = 0
    const tick = (now) => {
      const raw = Math.min(1, (now - begin) / FX_MS)
      // The board can go away mid-attack (another tab on an iPad): stop and leave nothing behind.
      const anchor = anchorRef.current
      try {
        if (anchor) drawFrame(scene, canvas, anchor, slowMo(raw))
      } catch {
        wipe(g)
        return
      }
      if (anchor && (raw < 1 || scene.parts.length > 0)) frame = requestAnimationFrame(tick)
      else wipe(g)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      wipe(g)
    }
  }, [playing?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 h-full w-full" />
}
