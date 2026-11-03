import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { makeTurntable } from './turntable.js'
import { Button } from './ui.jsx'
import { boneScales, cleanTweaks, COLORS, NO_TWEAKS, TWEAK_SLIDERS, usedSlots } from '../data/workshop.js'

// The 🎨 Tweak panel: a player's own figure turning on a stand, with sliders for its size,
// head and body, and its colours to swap. It all happens on the iPad, so trying things out
// costs nothing; "Save my tweaks" keeps them on the Pi for Claude to bake in later.

const SWATCH = 4 // pixels per colour square in the palette strip (make-monsters.py)
const MAX_SLOTS = 16
const MOVES = [
  ['Idle', '🧍 Stand'],
  ['Walking_A', '🚶 Walk'],
  ['1H_Melee_Attack_Chop', '⚔️ Swing'],
  ['Spellcast_Shoot', '✨ Magic'],
  ['Cheer', '🙌 Cheer'],
]

export default function WorkshopTweaker({ request, model, onSaved }) {
  const mount = useRef(null)
  const stage = useRef(null)
  const [tweaks, setTweaks] = useState(() => cleanTweaks(request.tweaks ?? NO_TWEAKS))
  const [slots, setSlots] = useState([]) // [{ slot, original }]
  const [picking, setPicking] = useState(null)
  const [clips, setClips] = useState([])
  const [status, setStatus] = useState(null) // null | saving | saved | error
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const s = { scene: null, mixer: null, bones: {}, root: null, canvas: null, base: null, material: null, action: null, tweaks: null }
    const table = makeTurntable(mount.current, {
      light: ['#ffffff', '#3b2a4a', 2.2],
      key: ['#fff4e0', 2.2, [3, 5, 4]],
      stand: 1.4,
      camera: [0, 1.7, 6.4],
      target: [0, 1.25, 0],
      near: 2.5,
      far: 10,
      spinSpeed: 1.2,
      onFrame: (seconds) => {
        s.mixer?.update(seconds)
        // After the moves, so a move never undoes the sliders.
        const scales = boneScales(s.tweaks ?? NO_TWEAKS)
        for (const [name, k] of Object.entries(scales)) s.bones[name]?.scale.setScalar(k)
      },
    })
    if (!table) {
      setFailed(true)
      return undefined
    }
    const scene = table.scene
    s.scene = scene
    stage.current = s

    let disposed = false
    new GLTFLoader().load(
      `/workshop/${request.id}/${model}`,
      (gltf) => {
        if (disposed) return
        s.root = gltf.scene
        scene.add(gltf.scene)
        gltf.scene.traverse((o) => {
          if (o.isBone) s.bones[o.name] = o
          if (o.isMesh && !s.material && o.material?.map) {
            s.material = o.material
            const image = o.material.map.image
            const canvas = document.createElement('canvas')
            canvas.width = image.width
            canvas.height = image.height
            const ctx = canvas.getContext('2d')
            ctx.drawImage(image, 0, 0)
            s.canvas = canvas
            s.base = ctx.getImageData(0, 0, canvas.width, canvas.height)
            const count = Math.floor(canvas.width / SWATCH)
            const used = usedSlots(o.geometry.attributes.uv.array, count).slice(0, MAX_SLOTS)
            const hex = (slot) => {
              const i = (Math.floor(SWATCH / 2) * canvas.width + slot * SWATCH + 1) * 4
              return `#${[0, 1, 2].map((k) => s.base.data[i + k].toString(16).padStart(2, '0')).join('')}`
            }
            setSlots(used.map((slot) => ({ slot, original: hex(slot) })))
            const texture = new THREE.CanvasTexture(canvas)
            texture.flipY = false
            texture.colorSpace = THREE.SRGBColorSpace
            texture.magFilter = THREE.NearestFilter
            texture.minFilter = THREE.NearestFilter
            texture.generateMipmaps = false
            o.material = o.material.clone()
            o.material.map = texture
            s.material = o.material
          }
        })
        s.mixer = new THREE.AnimationMixer(gltf.scene)
        s.clips = gltf.animations
        setClips(gltf.animations.map((a) => a.name))
        play(s, 'Idle')
        apply(s, s.tweaks ?? tweaks)
      },
      undefined,
      () => setFailed(true),
    )

    return () => {
      disposed = true
      table.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the figure loads once; tweaks reach it through apply()
  }, [request.id, model])

  useEffect(() => {
    if (stage.current) apply(stage.current, tweaks)
  }, [tweaks])

  const change = (patch) => {
    setStatus(null)
    setTweaks((t) => ({ ...t, ...patch }))
  }
  const setColor = (slot, hex) => {
    const colors = { ...tweaks.colors }
    if (hex) colors[slot] = hex
    else delete colors[slot]
    change({ colors })
  }
  const save = async () => {
    setStatus('saving')
    const res = await fetch(`/workshop/${request.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tweaks }) }).catch(() => null)
    setStatus(res?.ok ? 'saved' : 'error')
    if (res?.ok) onSaved?.()
  }

  return (
    <div className="mt-4 rounded-2xl border border-violet-500/60 bg-zinc-950 p-3" data-tweaker>
      <h3 className="font-display text-2xl font-bold text-violet-200">🎨 Tweak it yourself</h3>
      <p className="text-sm text-zinc-400">Drag to turn it. Try the sliders and colors, then save. No waiting for Claude!</p>
      {failed ? (
        <p className="mt-3 text-red-300">This screen can't show 3D figures.</p>
      ) : (
        <div ref={mount} className="mt-2 h-80 w-full overflow-hidden rounded-xl sm:h-96" />
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {MOVES.filter(([name]) => clips.includes(name)).map(([name, label]) => (
          <button key={name} type="button" className="min-h-10 rounded-full bg-zinc-800 px-3 text-sm text-zinc-200" onClick={() => play(stage.current, name)}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {TWEAK_SLIDERS.map(({ key, label, min, max, step }) => (
          <label key={key} className="block text-zinc-200">
            {label} <span className="text-sm text-zinc-500">{Math.round(tweaks[key] * 100)}%</span>
            <input type="range" className="mt-1 w-full accent-violet-400" min={min} max={max} step={step} value={tweaks[key]} aria-label={label} onChange={(e) => change({ [key]: Number(e.target.value) })} />
          </label>
        ))}
      </div>
      {slots.length > 0 && (
        <section className="mt-3">
          <h4 className="text-zinc-200">Colors: tap one to change it</h4>
          <div className="mt-1 flex flex-wrap gap-2">
            {slots.map(({ slot, original }) => {
              const now = tweaks.colors[slot] ?? original
              return (
                <button
                  key={slot}
                  type="button"
                  aria-label={`Color ${now}`}
                  onClick={() => setPicking(picking === slot ? null : slot)}
                  className={`h-11 w-11 rounded-xl border-2 ${picking === slot ? 'border-white ring-2 ring-violet-400' : 'border-zinc-700'}`}
                  style={{ background: now }}
                />
              )
            })}
          </div>
          {picking !== null && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-zinc-900 p-2" data-color-choices>
              {COLORS.map((c) => (
                <button key={c.key} type="button" aria-label={`Make it ${c.key}`} onClick={() => setColor(picking, c.hex)} className="h-10 w-10 rounded-full border-2 border-zinc-700" style={{ background: c.hex }} />
              ))}
              <label className="flex items-center gap-1 text-sm text-zinc-300">
                Any color
                <input type="color" aria-label="Any color" value={tweaks.colors[picking] ?? slots.find((x) => x.slot === picking)?.original ?? '#ffffff'} onChange={(e) => setColor(picking, e.target.value)} className="h-10 w-12" />
              </label>
              <button type="button" className="text-sm text-zinc-400 underline" onClick={() => setColor(picking, null)}>
                Back to how it was
              </button>
            </div>
          )}
        </section>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {status === 'saved' && <span className="text-emerald-300">Saved ✓ Claude will use these when it goes in the game.</span>}
        {status === 'error' && <span className="text-red-300">Couldn't save. Try again?</span>}
        <Button variant="ghost" onClick={() => change({ ...NO_TWEAKS, colors: {} })}>
          Reset
        </Button>
        <Button variant="gold" onClick={save} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : '💾 Save my tweaks'}
        </Button>
      </div>
    </div>
  )
}

function play(s, name) {
  if (!s?.mixer) return
  const clip = s.clips.find((c) => c.name === name)
  if (!clip) return
  const action = s.mixer.clipAction(clip)
  const loop = name === 'Idle' || name === 'Walking_A'
  action.reset()
  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
  action.clampWhenFinished = !loop
  if (s.action && s.action !== action) s.action.fadeOut(0.15)
  action.fadeIn(0.15).play()
  s.action = action
  if (!loop) {
    const back = () => {
      s.mixer.removeEventListener('finished', back)
      if (s.action === action) play(s, 'Idle')
    }
    s.mixer.addEventListener('finished', back)
  }
}

// Puts the tweaks on the figure: its overall size now, bone sizes every frame, and its colors
// painted over the palette strip.
function apply(s, tweaks) {
  s.tweaks = tweaks
  s.root?.scale.setScalar(tweaks.size)
  if (!s.canvas) return
  const ctx = s.canvas.getContext('2d')
  ctx.putImageData(s.base, 0, 0)
  for (const [slot, hex] of Object.entries(tweaks.colors)) {
    ctx.fillStyle = hex
    ctx.fillRect(Number(slot) * SWATCH, 0, SWATCH, s.canvas.height)
  }
  if (s.material?.map) s.material.map.needsUpdate = true
}
