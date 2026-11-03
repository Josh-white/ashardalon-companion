import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildFigure, disposeFigure, pose } from '../forge/figure.js'

// The 🛠️ Hero Builder's turntable: the figure built from the recipe, turning slowly on a
// stand, playing a move when asked. Every change to the recipe rebuilds the figure here on
// the iPad, which takes a few milliseconds.

export default function ForgeStage({ recipe, move = 'Idle', moveKey = 0, spin = true, className = '' }) {
  const mount = useRef(null)
  const stage = useRef(null)
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
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none'
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#1c1426')
    scene.add(new THREE.HemisphereLight('#ffffff', '#3b2a4a', 2.0))
    const key = new THREE.DirectionalLight('#fff4e0', 2.4)
    key.position.set(3, 5, 4)
    scene.add(key)
    const rim = new THREE.DirectionalLight('#a78bfa', 1.2)
    rim.position.set(-4, 3, -4)
    scene.add(rim)
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.08, 48), new THREE.MeshStandardMaterial({ color: '#3f3a46', roughness: 0.9 }))
    floor.position.y = -0.04
    scene.add(floor)
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60)
    camera.position.set(0, 1.6, 6)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1, 0)
    controls.enableDamping = true
    controls.enablePan = false
    controls.autoRotate = true
    controls.autoRotateSpeed = 1.5
    controls.minDistance = 1.5
    controls.maxDistance = 12
    const s = { scene, camera, controls, figure: null, move: 'Idle', started: 0, framed: false }
    stage.current = s

    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight, false)
      camera.aspect = el.clientWidth / Math.max(el.clientHeight, 1)
      camera.updateProjectionMatrix()
    }
    resize()
    const watcher = new ResizeObserver(resize)
    watcher.observe(el)
    let frame = requestAnimationFrame(function draw(now) {
      if (s.figure && pose(s.figure, s.move, (now - s.started) / 1000) && s.move !== 'Idle') {
        s.move = 'Idle'
        s.started = now
      }
      controls.update()
      renderer.render(scene, camera)
      frame = requestAnimationFrame(draw)
    })
    return () => {
      cancelAnimationFrame(frame)
      watcher.disconnect()
      controls.dispose()
      if (s.figure) disposeFigure(s.figure)
      floor.geometry.dispose()
      floor.material.dispose()
      renderer.dispose()
      renderer.domElement.remove()
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
