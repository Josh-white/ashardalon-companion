import * as THREE from 'three'
import { buildFigure, disposeFigure } from './figure.js'

// Still pictures of 🛠️ Hero Builder figures (for 🎮 My models and the 📂 My heroes list),
// drawn here on the iPad: one small renderer for every picture, so a long list doesn't run
// out of WebGL contexts, and each picture kept as a PNG data URL so it's drawn only once.

const SIZE = 256
let stage = null
const pictures = new Map()

function setUp() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(SIZE, SIZE, false)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x000000, 0)
  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight('#ffffff', '#3b2a4a', 2.0))
  const key = new THREE.DirectionalLight('#fff4e0', 2.4)
  key.position.set(3, 5, 4)
  scene.add(key)
  const rim = new THREE.DirectionalLight('#a78bfa', 1.2)
  rim.position.set(-4, 3, -4)
  scene.add(rim)
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 60)
  return { renderer, scene, camera }
}

// A PNG data URL of the figure turned a little to one side, or null when this screen can't
// draw 3D (the list then shows the parts' emojis).
export function snapshot(recipe) {
  const key = JSON.stringify(recipe)
  if (pictures.has(key)) return pictures.get(key)
  let url = null
  try {
    stage ??= setUp()
    const { renderer, scene, camera } = stage
    const figure = buildFigure(recipe)
    figure.rotation.y = THREE.MathUtils.degToRad(-28)
    scene.add(figure)
    // Fit the figure itself, head to toe: a long spear or big wings may poke out of the
    // picture, so the hero isn't drawn tiny.
    const box = new THREE.Box3().setFromObject(figure)
    const size = box.getSize(new THREE.Vector3())
    const height = figure.userData.height
    const centre = new THREE.Vector3(0, height * 0.5, 0)
    const reach = Math.max(height * 0.6, Math.min(size.x, height * 1.2) * 0.5, 0.4)
    const distance = reach / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    camera.position.set(0, centre.y + height * 0.15, distance + 0.3)
    camera.lookAt(centre)
    renderer.render(scene, camera)
    url = renderer.domElement.toDataURL('image/png')
    scene.remove(figure)
    disposeFigure(figure)
  } catch {
    url = null
  }
  pictures.set(key, url)
  return url
}
