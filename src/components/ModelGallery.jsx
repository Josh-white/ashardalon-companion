import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { galleryFigures, galleryMoves, LOOPING } from '../board/modelGallery.js'
import { useCards } from '../state/useCards.js'
import { useMe } from '../state/useMe.js'
import { TOKEN_COLORS } from './Board.jsx'
import { AdminLink } from './AdminLink.jsx'
import { attachModel, clipNames, detachModel, playClip, stepModels } from './figureModels.js'

// The #models page: every 3D figure the 3D board uses, one at a time on a turntable. Drag to
// turn it, pinch or scroll to zoom, and tap a move to watch it. Below, the monsters and
// villains that are still flat standees, so it's easy to see which figures are left to make.
export default function ModelGallery() {
  const me = useMe()
  const cards = useCards()
  const groups = useMemo(() => galleryFigures(cards), [cards])
  const all = useMemo(() => [...groups.heroes, ...groups.fanHeroes, ...groups.monsters], [groups])
  const [pickedId, setPickedId] = useState(null)
  const picked = all.find((f) => f.id === pickedId) ?? all[0] ?? null

  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-100">
      <AdminLink />
      <h1 className="font-display text-3xl text-amber-400">3D figures</h1>
      {me.friend ? (
        <p className="mt-6 text-lg text-zinc-400">This page is only for the family.</p>
      ) : (
        <>
          <p className="mt-1 max-w-2xl text-zinc-400">
            Every 3D figure on the 3D board. Drag to turn it, pinch or scroll to zoom, and tap a move to watch it.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-[18rem_1fr]">
            <nav className="space-y-3">
              <FigureList title="Heroes" figures={groups.heroes} picked={picked} onPick={setPickedId} />
              <FigureList title="Fan heroes" figures={groups.fanHeroes} picked={picked} onPick={setPickedId} />
              <FigureList title="Monsters" figures={groups.monsters} picked={picked} onPick={setPickedId} />
            </nav>
            {picked ? <Turntable key={picked.id} figure={picked} /> : <p className="text-zinc-400">Loading the cards…</p>}
          </div>
          <Standees list={groups.standees} loading={cards.source === 'loading'} />
        </>
      )}
    </main>
  )
}

function FigureList({ title, figures, picked, onPick }) {
  if (figures.length === 0) return null
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      <div className="mt-1 flex flex-wrap gap-2">
        {figures.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onPick(f.id)}
            className={`rounded-xl px-3 py-1.5 text-left ring-1 ${f.id === picked?.id ? 'bg-amber-500 text-zinc-950 ring-amber-400' : 'bg-zinc-900 text-zinc-200 ring-zinc-800 hover:ring-amber-500'}`}
          >
            {f.name}
          </button>
        ))}
      </div>
    </section>
  )
}

function Standees({ list, loading }) {
  if (loading) return null
  return (
    <section className="mt-8 rounded-2xl bg-zinc-900 p-4 ring-1 ring-zinc-800">
      <h2 className="text-xl font-semibold text-amber-300">Still standees ({list.length})</h2>
      <p className="text-sm text-zinc-400">These stand on the 3D board as flat cards with their art, until they get a figure of their own.</p>
      {list.length === 0 ? (
        <p className="mt-2 text-emerald-300">✓ Every monster and villain has a 3D figure.</p>
      ) : (
        <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => (
            <li key={`${s.kind}-${s.name}`}>
              {s.name} <span className="text-xs text-zinc-500">{s.kind}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// One figure on a slowly turning stand, with a button for each of its moves.
function Turntable({ figure }) {
  const mount = useRef(null)
  const nodeRef = useRef(null)
  const spinRef = useRef(null)
  const [moves, setMoves] = useState(null)
  const [playing, setPlaying] = useState(null)
  const [spin, setSpin] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = mount.current
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      setFailed(true)
      return undefined
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.touchAction = 'none'
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0c0a09')
    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50)
    camera.position.set(0, 0.95, 3)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.55, 0)
    controls.minDistance = 1
    controls.maxDistance = 8
    controls.enableDamping = true
    controls.autoRotateSpeed = 1.5
    spinRef.current = controls
    scene.add(new THREE.HemisphereLight('#c7d2fe', '#3b2a1a', 1.4))
    const key = new THREE.DirectionalLight('#fff4e0', 1.6)
    key.position.set(2, 4, 3)
    const rim = new THREE.DirectionalLight('#93c5fd', 0.8)
    rim.position.set(-3, 2, -3)
    scene.add(key, rim)

    // The stand: one board square, the size a figure stands on in the game.
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.08, 48), new THREE.MeshStandardMaterial({ color: '#3f3a36', roughness: 0.9 }))
    stand.position.y = -0.04
    const square = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.01, 0.95), new THREE.MeshStandardMaterial({ color: '#57534e', roughness: 0.95 }))
    square.position.y = 0.005
    scene.add(stand, square)

    // figureModels.js dresses a board figure: a node with a body to hang the model on, and a
    // card (the standee art) to hide once it's in.
    const node = new THREE.Group()
    const body = new THREE.Group()
    const card = new THREE.Object3D()
    node.add(body, card)
    node.userData = { body, card, faceMat: new THREE.MeshBasicMaterial() }
    scene.add(node)
    nodeRef.current = node
    const color = figure.color ? TOKEN_COLORS[figure.color] ?? '#71717a' : '#7f1d1d'
    attachModel(node, figure.look, color, () => {
      setMoves(galleryMoves(clipNames(node)))
      setPlaying('Idle')
    })

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el
      renderer.setSize(w, h, false)
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
    }
    resize()
    const watcher = new ResizeObserver(resize)
    watcher.observe(el)

    let last = performance.now()
    let frame = requestAnimationFrame(function draw(now) {
      stepModels([node], Math.min(Math.max(now - last, 0) / 1000, 0.1), true)
      last = now
      controls.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(draw)
    })

    return () => {
      cancelAnimationFrame(frame)
      watcher.disconnect()
      node.userData.disposed = true
      detachModel(node)
      controls.dispose()
      scene.traverse((o) => {
        o.geometry?.dispose()
        for (const m of [].concat(o.material ?? [])) m.dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [figure])

  useEffect(() => {
    if (spinRef.current) spinRef.current.autoRotate = spin
  }, [spin])

  const play = (name) => {
    playClip(nodeRef.current, name, LOOPING.has(name))
    // A one-off move ends by standing again, so only the moves that keep going stay lit.
    setPlaying(LOOPING.has(name) ? name : 'Idle')
  }

  return (
    <section className="rounded-2xl bg-zinc-900 p-3 ring-1 ring-zinc-800">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-2xl font-semibold text-amber-300">{figure.name}</h2>
        <span className="text-zinc-400">{figure.about}</span>
        <span className="ml-auto text-xs text-zinc-500">
          {figure.look.model.replace(/_/g, ' ')}
          {figure.look.gear.length > 0 && ` · ${figure.look.gear.map((g) => g.replace(/_/g, ' ')).join(', ')}`}
        </span>
      </div>
      <div ref={mount} className="mt-2 h-[55vh] min-h-72 overflow-hidden rounded-xl bg-stone-950">
        {failed && <p className="p-4 text-zinc-400">This screen can't show 3D.</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {moves === null && !failed && <span className="text-zinc-400">Loading the figure…</span>}
        {(moves ?? []).map((m) => (
          <button
            key={m.name}
            type="button"
            onClick={() => play(m.name)}
            className={`rounded-xl px-3 py-1.5 ring-1 ${playing === m.name ? 'bg-amber-500 text-zinc-950 ring-amber-400' : 'bg-zinc-800 text-zinc-100 ring-zinc-700 hover:ring-amber-500'}`}
          >
            {m.label}
          </button>
        ))}
        <button type="button" onClick={() => setSpin((s) => !s)} className="ml-auto rounded-xl px-3 py-1.5 text-zinc-300 ring-1 ring-zinc-700 hover:ring-amber-500">
          {spin ? '⏸ Stop turning' : '🔄 Turn by itself'}
        </button>
      </div>
    </section>
  )
}
