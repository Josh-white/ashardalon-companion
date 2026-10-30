import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// How the virtual board (components/Board.jsx) fits its box: zoom steps, pinch to zoom,
// keeping the active hero in view, and turning a long dungeon a quarter turn.

const ZOOMS = [0.6, 0.8, 1, 1.3, 1.6, 2, 2.5, 3]

// The size of an element, kept up to date as the screen turns or unfolds.
function useBoxSize() {
  const ref = useRef(null)
  const [size, setSize] = useState(null)
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return
    const watch = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }))
    watch.observe(ref.current)
    return () => watch.disconnect()
  }, [])
  return [ref, size]
}

// `fill`: the board takes the whole box it's in and starts zoomed to fit. `bounds` is the
// dungeon's outline (boardBounds), or null before there's a board. Returns the ref for the
// scrolling box and everything the svg and the − / + buttons need.
export function useBoardZoom({ fill, bounds, activeId, activeAt }) {
  // 'fit' (the whole dungeon fills the box) or how many screen pixels per board unit.
  const [zoom, setZoom] = useState(fill ? 'fit' : 1.6)
  const [boxRef, box] = useBoxSize()
  const live = useRef({}) // the latest sizes, for the pinch handlers
  const pinch = useRef(null)
  const pinched = useRef(false)
  // Where the dungeon itself is on screen (zoomed to fit, the svg has empty bands round it).
  const drawn = () => {
    const r = boxRef.current.querySelector('svg').getBoundingClientRect()
    const { scale, viewW, viewH } = live.current
    const [w, h] = [viewW * scale, viewH * scale]
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h }
  }
  // Zoomed in, keep the active hero in the middle of the view as it moves or the turn passes
  // (but not straight after a pinch, which zooms on the fingers instead).
  useEffect(() => {
    const el = boxRef.current
    if (!fill || zoom === 'fit' || !el || !activeAt || pinched.current) return
    const token = el.querySelector(`[data-token="${activeId}"]`)
    if (!token) return
    const [b, t] = [el.getBoundingClientRect(), token.getBoundingClientRect()]
    el.scrollTo({ left: el.scrollLeft + t.left - b.left + t.width / 2 - el.clientWidth / 2, top: el.scrollTop + t.top - b.top + t.height / 2 - el.clientHeight / 2, behavior: 'smooth' })
  }, [fill, zoom, activeId, activeAt]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    pinched.current = false
  }, [activeId, activeAt])
  // Two fingers zoom the board (not the whole page); one finger scrolls it.
  useEffect(() => {
    const el = boxRef.current
    if (!fill || !el) return
    const gap = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const middle = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2]
    const start = (e) => {
      if (e.touches.length !== 2) return
      pinch.current = { gap: gap(e.touches), scale: live.current.scale }
    }
    const move = (e) => {
      if (e.touches.length !== 2 || !pinch.current) return
      e.preventDefault()
      const { fitScale } = live.current
      const next = Math.min(ZOOMS[ZOOMS.length - 1], (pinch.current.scale * gap(e.touches)) / pinch.current.gap)
      // Keep the board point under the fingers where it is.
      const r = drawn()
      const [mx, my] = middle(e.touches)
      live.current.anchor = { mx, my, fx: (mx - r.left) / r.width, fy: (my - r.top) / r.height }
      pinched.current = true
      setZoom(next <= fitScale * 1.05 ? 'fit' : next)
    }
    const end = (e) => {
      if (e.touches.length < 2) pinch.current = null
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [fill]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = boxRef.current
    const a = live.current.anchor
    if (!el || !a) return
    live.current.anchor = null
    const r = drawn()
    el.scrollLeft += r.left + a.fx * r.width - a.mx
    el.scrollTop += r.top + a.fy * r.height - a.my
  }, [zoom]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!bounds) return { boxRef }

  // A long, thin dungeon in a box the other shape (a tall one on the projector's wide
  // screen) turns a quarter turn when that makes it clearly bigger. The figures stay upright.
  const fitFor = (w, h) => (box ? Math.min(box.w / w, box.h / h) : 1)
  const spin = fill && fitFor(bounds.h, bounds.w) > fitFor(bounds.w, bounds.h) * 1.2 ? 90 : 0
  const [viewW, viewH] = spin ? [bounds.h, bounds.w] : [bounds.w, bounds.h]
  // rotate(90) sends (x, y) to (-y, x), so the turned dungeon sits left of the origin.
  const viewBox = spin ? `${-(bounds.y + bounds.h)} ${bounds.x} ${bounds.h} ${bounds.w}` : `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`
  // Zoom to fit: the biggest size that shows the whole dungeon in the box. The buttons step
  // through the fixed sizes bigger than it; a pinch goes anywhere in between.
  const fitScale = fitFor(viewW, viewH)
  const fit = fill && zoom === 'fit'
  const scale = fit ? fitScale : zoom
  const sizes = fill ? ZOOMS.filter((z) => z > fitScale * 1.15) : ZOOMS
  const zoomOut = fit ? null : [...sizes].reverse().find((z) => z < scale / 1.05) ?? (fill ? 'fit' : null)
  const zoomIn = sizes.find((z) => z > (fit ? fitScale : scale) * 1.05) ?? null
  const zoomTo = (z) => {
    pinched.current = false
    setZoom(z)
  }
  live.current.scale = scale
  live.current.fitScale = fitScale
  live.current.viewW = viewW
  live.current.viewH = viewH
  return { boxRef, spin, viewW, viewH, viewBox, fit, scale, zoomIn, zoomOut, zoomTo }
}
