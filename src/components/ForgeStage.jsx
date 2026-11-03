import { useEffect, useRef, useState } from 'react'
import { makeTurntable } from './turntable.js'
import { buildFigure, disposeFigure, pose } from '../forge/figure.js'

// The 🛠️ Hero Builder's turntable: the figure built from the recipe, turning slowly on a
// stand, playing a move when asked. Every change to the recipe rebuilds the figure here on
// the iPad, which takes a few milliseconds.

export default function ForgeStage({ recipe, move = 'Idle', moveKey = 0, spin = true, className = '' }) {
  const mount = useRef(null)
  const stage = useRef(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const s = { scene: null, camera: null, controls: null, figure: null, move: 'Idle', started: 0, framed: false }
    const table = makeTurntable(mount.current, {
      light: ['#ffffff', '#3b2a4a', 2.0],
      key: ['#fff4e0', 2.4, [3, 5, 4]],
      rim: ['#a78bfa', 1.2, [-4, 3, -4]],
      fov: 30,
      onFrame: (_, now) => {
        if (s.figure && pose(s.figure, s.move, (now - s.started) / 1000) && s.move !== 'Idle') {
          s.move = 'Idle'
          s.started = now
        }
      },
    })
    if (!table) {
      setFailed(true)
      return undefined
    }
    Object.assign(s, { scene: table.scene, camera: table.camera, controls: table.controls })
    stage.current = s
    return () => {
      // Hero Builder figures share materials between parts, so they're freed their own way.
      if (s.figure) {
        table.scene.remove(s.figure)
        disposeFigure(s.figure)
      }
      table.dispose()
      stage.current = null
    }
  }, [])

  // A new figure for every change to the recipe.
  useEffect(() => {
    const s = stage.current
    if (!s) return
    const figure = buildFigure(recipe)
    if (s.figure) {
      s.scene.remove(s.figure)
      disposeFigure(s.figure)
    }
    s.figure = figure
    s.scene.add(figure)
    // Aim at the middle of the figure; back the camera off for a big one, the first time.
    const height = Math.max(1.2, figure.userData.height + 0.3)
    s.controls.target.set(0, height * 0.48, 0)
    if (!s.framed) {
      s.camera.position.set(0, height * 0.6, height * 2.3 + 0.6)
      s.framed = true
    }
  }, [recipe])

  useEffect(() => {
    const s = stage.current
    if (!s) return
    s.move = move
    s.started = performance.now()
  }, [move, moveKey])

  useEffect(() => {
    if (stage.current) stage.current.controls.autoRotate = spin
  }, [spin])

  if (failed) return <p className={`flex items-center justify-center p-6 text-center text-red-300 ${className}`}>This screen can't show 3D figures.</p>
  return <div ref={mount} className={`overflow-hidden rounded-2xl ${className}`} data-forge-stage />
}
