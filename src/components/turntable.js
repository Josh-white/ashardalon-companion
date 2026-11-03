import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// One figure turning slowly on a round stand, that a finger can spin and zoom: the 🛠️ Hero
// Builder (ForgeStage.jsx), the 🎨 Tweak panel (WorkshopTweaker.jsx) and the #models page
// (ModelGallery.jsx) all show their figure on one of these. Each page puts its own figure in
// `scene` and moves it on in `onFrame(seconds, now)`.
//
// Returns null when the screen can't draw 3D (no WebGL), so the page can say so.
export function makeTurntable(el, { background = '#1c1426', light = ['#ffffff', '#3b2a4a', 2], key = ['#fff4e0', 2.2, [3, 5, 4]], rim = null, stand = 1.1, standColor = '#3f3a46', fov = 32, camera: [cx, cy, cz] = [0, 1.6, 6], target = [0, 1, 0], near = 1.5, far = 12, spinSpeed = 1.5, toneMapping = false, onFrame = () => {} } = {}) {
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true })
  } catch {
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  if (toneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none'
  el.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(background)
  scene.add(new THREE.HemisphereLight(...light))
  const addLight = ([color, strength, at]) => {
    const l = new THREE.DirectionalLight(color, strength)
    l.position.set(...at)
    scene.add(l)
  }
  addLight(key)
  if (rim) addLight(rim)
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(stand, stand + 0.1, 0.08, 48), new THREE.MeshStandardMaterial({ color: standColor, roughness: 0.9 }))
  floor.position.y = -0.04
  scene.add(floor)

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 60)
  camera.position.set(cx, cy, cz)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(...target)
  controls.enableDamping = true
  controls.enablePan = false
  controls.autoRotate = true
  controls.autoRotateSpeed = spinSpeed
  controls.minDistance = near
  controls.maxDistance = far

  const resize = () => {
    renderer.setSize(el.clientWidth, el.clientHeight, false)
    camera.aspect = el.clientWidth / Math.max(el.clientHeight, 1)
    camera.updateProjectionMatrix()
  }
  resize()
  const watcher = new ResizeObserver(resize)
  watcher.observe(el)
  let last = performance.now()
  let frame = requestAnimationFrame(function draw(now) {
    onFrame(Math.min(Math.max(now - last, 0) / 1000, 0.1), now)
    last = now
    controls.update()
    renderer.render(scene, camera)
    frame = requestAnimationFrame(draw)
  })

  return {
    scene,
    camera,
    controls,
    floor,
    // Stops drawing and frees everything still in the scene (take a shared model out first).
    dispose() {
      cancelAnimationFrame(frame)
      watcher.disconnect()
      controls.dispose()
      scene.traverse((o) => {
        o.geometry?.dispose()
        for (const m of [].concat(o.material ?? [])) {
          m.map?.dispose()
          m.dispose()
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
