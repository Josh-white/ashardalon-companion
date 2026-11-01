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

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Show the board as it was drawn a moment ago (`from`, a CSS transform), then let it slide
// to where it's drawn now. The box hides the overflow meanwhile, so no scroll bars flash.
const GLIDE_MS = 700
function glide(el, svg, from) {
  clearTimeout(svg.glideTimer)
  svg.style.transition = 'none'
  svg.style.transformOrigin = '0 0'
  svg.style.transform = from
  el.style.overflow = 'hidden'
  svg.getBoundingClientRect() // so the browser takes the start before the slide
  svg.style.transition = `transform ${GLIDE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
  svg.style.transform = ''
  svg.glideTimer = setTimeout(() => {
    svg.style.transition = ''
    svg.style.transformOrigin = ''
    el.style.overflow = ''
  }, GLIDE_MS + 50)
}

// The zoom and where the view is, kept on this screen so a page reload (a new version
// arriving mid-game, the phone dropping the app while it's in the background), the game
// picker or the art screen doesn't throw the board back to zoomed-to-fit. The view's
// middle is kept as a share of the drawn dungeon, so it lands on the same squares even on a
// box of another size, and only for the same dungeon (the same outline and turn).
const KEY = 'ashardalon-board-zoom'

export function savedZoom() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY))
    if (v && (v.zoom === 'fit' || (typeof v.zoom === 'number' && v.zoom > 0))) return v
  } catch {
    // Nothing kept, or storage blocked.
  }
  return null
}

function keepZoom(v) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    // Private mode: the zoom lasts until the page reloads.
  }
}

// `fill`: the board takes the whole box it's in and starts zoomed to fit. `bounds` is the
// dungeon's outline (boardBounds), or null before there's a board. Returns the ref for the
// scrolling box and everything the svg and the − / + buttons need.
export function useBoardZoom({ fill, bounds, activeId, activeAt, focusId = null, freshKey = null }) {
  // 'fit' (the whole dungeon fills the box) or how many screen pixels per board unit.
  const [kept] = useState(() => (fill ? savedZoom() : null))
  const [zoom, setZoom] = useState(kept?.zoom ?? (fill ? 'fit' : 1.6))
  const [boxRef, box] = useBoxSize()
  const live = useRef({}) // the latest sizes, for the pinch handlers
  const pinch = useRef(null)
  // A kept view for this dungeon is put back once the box has its size (restoreView below),
  // so the board doesn't first glide to the active hero.
  const outline = bounds ? `${bounds.x},${bounds.y},${bounds.w},${bounds.h}` : null
  const restore = useRef(kept?.view && kept.view.outline === outline ? kept.view : null)
  const pinched = useRef(Boolean(restore.current))
  // Where the dungeon itself is on screen (zoomed to fit, the svg has empty bands round it).
  const drawn = () => {
    const r = boxRef.current.querySelector('svg').getBoundingClientRect()
    const { scale, viewW, viewH } = live.current
    const [w, h] = [viewW * scale, viewH * scale]
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h }
  }
  // Glide the view so a figure sits in its middle.
  const centerOn = (id) => {
    const el = boxRef.current
    const token = el?.querySelector(`[data-token="${id}"]`)
    if (!token) return
    const [b, t] = [el.getBoundingClientRect(), token.getBoundingClientRect()]
    el.scrollTo({ left: el.scrollLeft + t.left - b.left + t.width / 2 - el.clientWidth / 2, top: el.scrollTop + t.top - b.top + t.height / 2 - el.clientHeight / 2, behavior: 'smooth' })
  }
  // Zoomed in, keep the active hero in the middle of the view as it moves or the turn passes
  // (but not straight after a pinch, which zooms on the fingers instead).
  useEffect(() => {
    const el = boxRef.current
    if (!fill || zoom === 'fit' || !el || !activeAt || pinched.current) return
    centerOn(activeId)
  }, [fill, zoom, activeId, activeAt]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    pinched.current = false
  }, [activeId, activeAt])
  // A monster picked in the attack box comes to the middle of the view, at the zoom the
  // board is at (zoomed to fit, it's already in view).
  useEffect(() => {
    const el = boxRef.current
    if (!focusId || !el || zoom === 'fit') return
    centerOn(focusId)
  }, [focusId]) // eslint-disable-line react-hooks/exhaustive-deps
  // Two fingers zoom the board (not the whole page); one finger scrolls it.
  useEffect(() => {
    const el = boxRef.current
    if (!fill || !el) return
    const gap = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const middle = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2]
    // While the fingers move, the board is only stretched (a CSS transform, which the iPad
    // does cheaply); it's drawn again at the new size once when the fingers come off. Drawing
    // the whole board on every finger movement made a pinching iPad lag.
    const svgOf = () => el.querySelector('svg')
    const start = (e) => {
      if (e.touches.length !== 2) return
      const svg = svgOf()
      if (!svg) return
      const [mx, my] = middle(e.touches)
      const r = drawn()
      const s = svg.getBoundingClientRect()
      svg.style.transformOrigin = `${mx - s.left}px ${my - s.top}px`
      pinch.current = { gap: gap(e.touches), scale: live.current.scale, next: live.current.scale, anchor: { mx, my, fx: (mx - r.left) / r.width, fy: (my - r.top) / r.height } }
    }
    const move = (e) => {
      if (e.touches.length !== 2 || !pinch.current) return
      e.preventDefault()
      const p = pinch.current
      p.next = Math.max(live.current.fitScale, Math.min(ZOOMS[ZOOMS.length - 1], (p.scale * gap(e.touches)) / p.gap))
      const svg = svgOf()
      if (svg) svg.style.transform = `scale(${p.next / p.scale})`
    }
    const end = (e) => {
      if (e.touches.length >= 2 || !pinch.current) return
      const p = pinch.current
      pinch.current = null
      const svg = svgOf()
      if (svg) {
        svg.style.transform = ''
        svg.style.transformOrigin = ''
      }
      if (Math.abs(p.next - p.scale) < 0.01) return
      // Keep the board point that was under the fingers where it is.
      live.current.anchor = p.anchor
      pinched.current = true
      setZoom(p.next <= live.current.fitScale * 1.05 ? 'fit' : p.next)
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
  // Put back the kept view once the box is measured and the board drawn at the kept zoom.
  useLayoutEffect(() => {
    const el = boxRef.current
    const v = restore.current
    if (!el || !v || !box || !live.current.viewW) return
    restore.current = null
    if (v.spin !== live.current.spin) return
    const r = drawn()
    const b = el.getBoundingClientRect()
    el.scrollLeft += r.left + v.fx * r.width - (b.left + el.clientWidth / 2)
    el.scrollTop += r.top + v.fy * r.height - (b.top + el.clientHeight / 2)
  }, [box]) // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the zoom, and (a moment after scrolling stops) the middle of the view.
  const save = () => {
    const el = boxRef.current
    if (!fill || !el || !live.current.viewW) return
    // Not put back yet (the box isn't measured): keep the old view as it is.
    let view = restore.current
    if (!view && live.current.outline && live.current.zoom !== 'fit') {
      const r = drawn()
      const b = el.getBoundingClientRect()
      view = {
        outline: live.current.outline,
        spin: live.current.spin,
        fx: (b.left + el.clientWidth / 2 - r.left) / r.width,
        fy: (b.top + el.clientHeight / 2 - r.top) / r.height,
      }
    }
    keepZoom({ zoom: live.current.zoom, view })
  }
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    if (fill) saveRef.current()
  }, [fill, zoom])
  useEffect(() => {
    const el = boxRef.current
    if (!fill || !el) return
    let timer
    const scrolled = () => {
      clearTimeout(timer)
      timer = setTimeout(() => saveRef.current(), 300)
    }
    el.addEventListener('scroll', scrolled, { passive: true })
    return () => {
      clearTimeout(timer)
      el.removeEventListener('scroll', scrolled)
    }
  }, [fill]) // eslint-disable-line react-hooks/exhaustive-deps
  // A new tile changes the dungeon's outline, so zoomed to fit the whole board rescales and
  // shifts. Instead of jumping, the board is shown where it was and glides to its new place
  // (a CSS transform, cheap even on the iPads), so everyone can follow where things went.
  // Zoomed in, the view stays on the same squares, then slides over if the new tile is out of
  // sight. `prevLayout` is how the board was last drawn.
  const prevLayout = useRef(null)
  const layoutNow = () => {
    const now = live.current
    return bounds && now.viewW ? { bounds, spin: now.spin, scale: now.scale, fit: now.fit, viewW: now.viewW, viewH: now.viewH } : null
  }
  useLayoutEffect(() => {
    const el = boxRef.current
    const before = prevLayout.current
    const layout = layoutNow()
    if (!el || !before || !layout || !box || before.spin !== layout.spin || before.fit !== layout.fit) return
    const b0 = before.bounds
    const b1 = bounds
    if (b0.x === b1.x && b0.y === b1.y && b0.w === b1.w && b0.h === b1.h) return
    // How far the drawing's top-left corner moved, in board units along the drawn axes
    // (turned a quarter, the dungeon's top edge is the drawing's right edge).
    const d = layout.spin ? [b0.y + b0.h - (b1.y + b1.h), b1.x - b0.x] : [b1.x - b0.x, b1.y - b0.y]
    const [cw, ch] = [el.clientWidth, el.clientHeight]
    if (layout.fit) {
      if (reducedMotion()) return
      const svg = el.querySelector('svg')
      if (!svg) return
      // Zoomed to fit, the dungeon sits in the middle of the svg, which fills the box.
      const off = (l) => [(cw - l.viewW * l.scale) / 2, (ch - l.viewH * l.scale) / 2]
      const [o0, o1] = [off(before), off(layout)]
      const a = before.scale / layout.scale
      const c = [0, 1].map((i) => o0[i] + before.scale * d[i] - a * o1[i])
      glide(el, svg, `translate(${c[0]}px, ${c[1]}px) scale(${a})`)
      return
    }
    // Zoomed in: the same squares stay under the same spot (centred with mx-auto when
    // the board is narrower than the box).
    const s = layout.scale
    const margin = (l) => Math.max(0, (cw - l.viewW * l.scale) / 2)
    el.scrollLeft += margin(layout) - margin(before) - s * d[0]
    el.scrollTop -= s * d[1]
  }, [outline]) // eslint-disable-line react-hooks/exhaustive-deps
  // Kept after every drawing (no DOM reads, so it costs nothing).
  useLayoutEffect(() => {
    prevLayout.current = layoutNow()
  })
  // Zoomed in, a new tile out of sight slides into view once it's down.
  useEffect(() => {
    const el = boxRef.current
    if (!freshKey || !el || live.current.fit) return
    const tile = el.querySelector('[data-new-tile]')
    if (!tile) return
    const [b, t] = [el.getBoundingClientRect(), tile.getBoundingClientRect()]
    const seen = t.left >= b.left && t.right <= b.right && t.top >= b.top && t.bottom <= b.bottom
    if (seen) return
    el.scrollTo({ left: el.scrollLeft + t.left - b.left + t.width / 2 - el.clientWidth / 2, top: el.scrollTop + t.top - b.top + t.height / 2 - el.clientHeight / 2, behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [freshKey]) // eslint-disable-line react-hooks/exhaustive-deps
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
  // A kept zoom smaller than fitting this box (the phone unfolded since) just fits.
  const fit = fill && (zoom === 'fit' || zoom < fitScale)
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
  live.current.spin = spin
  live.current.zoom = zoom
  live.current.outline = outline
  live.current.fit = fit
  return { boxRef, spin, viewW, viewH, viewBox, fit, scale, zoomIn, zoomOut, zoomTo }
}
