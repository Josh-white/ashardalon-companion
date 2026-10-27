import { useEffect, useRef } from 'react'

// A real 3D d20 built from 20 CSS triangles. It tumbles end over end across the
// table and comes to rest with the rolled number facing you.
const PHI = (1 + Math.sqrt(5)) / 2
const RADIUS = Math.sqrt(1 + PHI * PHI)
const ROLL_MS = 900

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a) => scale(a, 1 / Math.sqrt(dot(a, a)))

const VERTS = []
for (const s1 of [-1, 1]) {
  for (const s2 of [-1, 1]) {
    VERTS.push([0, s1, s2 * PHI], [s1, s2 * PHI, 0], [s2 * PHI, 0, s1])
  }
}

// Every triangle of vertices that are all one edge (length 2) apart is a face.
const FACES = (() => {
  const near = (i, j) => Math.abs(dot(sub(VERTS[i], VERTS[j]), sub(VERTS[i], VERTS[j])) - 4) < 1e-6
  const faces = []
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      for (let k = j + 1; k < 12; k++) {
        if (!near(i, j) || !near(j, k) || !near(i, k)) continue
        let [a, b, c] = [VERTS[i], VERTS[j], VERTS[k]]
        const n = norm(add(add(a, b), c))
        // Order the corners so the face's front (and its number) points outward.
        if (dot(cross(sub(b, c), sub(scale(add(b, c), 0.5), a)), n) < 0) [b, c] = [c, b]
        faces.push({ a, b, c, n })
      }
    }
  }
  // Number them like a real die: opposite faces add up to 21.
  let next = 1
  for (const face of faces) {
    if (face.value) continue
    const opposite = faces.find((f) => dot(f.n, face.n) < -0.999)
    face.value = next
    opposite.value = 21 - next
    next++
  }
  return faces
})()

// The rotation that turns a face toward the viewer with its number upright.
function restingRotation(face) {
  const z = face.n
  const up = norm(sub(face.a, scale(face.n, dot(face.a, face.n))))
  const y = scale(up, -1)
  const x = cross(y, z)
  return [x, y, z]
}

const matrix = ([x, y, z]) =>
  `matrix3d(${x[0]},${y[0]},${z[0]},0,${x[1]},${y[1]},${z[1]},0,${x[2]},${y[2]},${z[2]},0,0,0,0,1)`

const rotate = ([x, y, z], v) => [dot(x, v), dot(y, v), dot(z, v)]
const LIGHT = norm([-0.4, -0.7, 0.9])

const D20_COLORS = {
  normal: { face: [185, 28, 28], edge: '#fbbf24', text: '#fef3c7' },
  crit: { face: [217, 119, 6], edge: '#fef3c7', text: '#ffffff' },
  fumble: { face: [63, 63, 70], edge: '#a1a1aa', text: '#d4d4d8' },
}

export default function Die3D({ value }) {
  const box = useRef(null)
  const solid = useRef(null)
  const faces = useRef([])

  useEffect(() => {
    box.current.classList.remove('d20-crit', 'd20-land')
    const size = box.current.offsetWidth
    const s = size / (2 * RADIUS) // pixels per model unit
    const target = FACES.find((f) => f.value === value) ?? FACES[0]
    const rest = restingRotation(target)
    const colors = value === 20 ? D20_COLORS.crit : value === 1 ? D20_COLORS.fumble : D20_COLORS.normal

    FACES.forEach((face, i) => {
      const el = faces.current[i]
      const e1 = scale(sub(face.b, face.c), 0.5)
      const e2 = scale(sub(scale(add(face.b, face.c), 0.5), face.a), 1 / Math.sqrt(3))
      const t = sub(scale(face.a, s), scale(e1, s))
      el.style.width = `${2 * s}px`
      el.style.height = `${Math.sqrt(3) * s}px`
      el.style.transform = `matrix3d(${e1.join(',')},0,${e2.join(',')},0,${face.n.join(',')},0,${t.join(',')},1)`
    })

    // Tumble around a random tilted axis, slowing down as it lands.
    const axis = norm([Math.random() - 0.5, 1, Math.random() * 0.6 - 0.3])
    const turns = 2 + Math.random()
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const start = performance.now()
    let frame

    const draw = (now) => {
      const t = reduced ? 1 : Math.min(1, (now - start) / ROLL_MS)
      const ease = 1 - Math.pow(1 - t, 3)
      const angle = (1 - ease) * turns * 360
      // Rolls in from the left with two shrinking bounces.
      const x = (1 - ease) * -1.2 * size
      const bounce = Math.abs(Math.sin(t * Math.PI * 3)) * (1 - t) * 0.35 * size
      solid.current.style.transform = `translate3d(${x}px,${-bounce}px,0) ${matrix(rest)} rotate3d(${axis.join(',')},${angle}deg)`

      // Shade each face by how much it points at the light, so it reads as solid.
      const rad = (angle * Math.PI) / 180
      const [c, sn] = [Math.cos(rad), Math.sin(rad)]
      FACES.forEach((face, i) => {
        // Rodrigues' rotation of the face normal by the tumble, then the resting turn.
        const n = add(add(scale(face.n, c), scale(cross(axis, face.n), sn)), scale(axis, dot(axis, face.n) * (1 - c)))
        const light = 0.45 + 0.55 * Math.max(0, dot(rotate(rest, n), LIGHT))
        const col = t < 1 ? D20_COLORS.normal.face : colors.face
        const el = faces.current[i]
        el.style.setProperty('--fill', `rgb(${col.map((v) => Math.round(v * light)).join(',')})`)
        el.style.setProperty('--text', t < 1 ? D20_COLORS.normal.text : colors.text)
        el.style.setProperty('--edge', t < 1 ? D20_COLORS.normal.edge : colors.edge)
      })
      if (t < 1) frame = requestAnimationFrame(draw)
      else box.current.classList.add(value === 20 ? 'd20-crit' : 'd20-land')
    }
    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return (
    <div ref={box} className="relative mx-auto h-[2.3em] w-[2.3em]" style={{ perspective: '8em' }}>
      <div ref={solid} className="absolute left-1/2 top-1/2 h-0 w-0" style={{ transformStyle: 'preserve-3d' }}>
        {FACES.map((face, i) => (
          <svg
            key={face.value}
            ref={(el) => (faces.current[i] = el)}
            viewBox="0 0 200 173.2"
            className="absolute left-0 top-0 overflow-visible"
            style={{ transformOrigin: '0 0', backfaceVisibility: 'hidden' }}
          >
            <polygon points="100,0 200,173.2 0,173.2" fill="var(--fill)" stroke="var(--edge)" strokeWidth="5" strokeLinejoin="round" />
            <text x="100" y="118" textAnchor="middle" dominantBaseline="middle" fill="var(--text)" fontSize={face.value >= 10 ? 62 : 70} fontWeight="bold" fontFamily="Georgia, 'Times New Roman', serif">
              {face.value}
            </text>
            {(face.value === 6 || face.value === 9) && <line x1="82" y1="146" x2="118" y2="146" stroke="var(--text)" strokeWidth="6" />}
          </svg>
        ))}
      </div>
    </div>
  )
}
