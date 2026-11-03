import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// A stand-in for WebGL, so the robot can play on the 3D screens (the 🧊 3D board, the 🛠️ Hero
// Builder's turntable, 🎮 My models' pictures) in a test browser that can't draw. Everything
// the screens do with three.js runs for real: the dungeon, the figures and their 3D models
// (the real .glb files, read from src/models), walks, attacks, the camera, taps found by
// three.js's own ray casting. Only the last step, the GPU turning it into pixels, is skipped.
// So the robot catches a screen's code crashing, not a picture that comes out wrong.
//
// In a robot test file:
//   vi.mock('three', async (importOriginal) => ({ ...(await importOriginal()), WebGLRenderer: FakeWebGLRenderer }))
//   beforeAll(() => installFake3D())

const ROOT = join(import.meta.dirname, '..', '..')

// The canvas's size on the "screen", for turning a point in 3D into a tap at a spot on it.
export const CANVAS_SIZE = 1000

// Every renderer the screens made, newest last, with what each drew last.
export const renderers = []

export class FakeWebGLRenderer {
  constructor() {
    this.domElement = document.createElement('canvas')
    this.domElement.width = CANVAS_SIZE
    this.domElement.height = CANVAS_SIZE
    this.domElement.getBoundingClientRect = () => ({ left: 0, top: 0, x: 0, y: 0, width: CANVAS_SIZE, height: CANVAS_SIZE, right: CANVAS_SIZE, bottom: CANVAS_SIZE })
    // A tiny real PNG (one see-through pixel), like a snapshot of a figure.
    this.domElement.toDataURL = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    this.domElement.dataset.fake3d = ''
    this.shadowMap = { enabled: false, type: null }
    this.debug = { checkShaderErrors: false }
    this.info = { programs: [], render: { frame: 0, calls: 0 }, memory: { geometries: 0, textures: 0 } }
    this.toneMapping = 0
    this.toneMappingExposure = 1
    this.outputColorSpace = 'srgb'
    this.size = { x: 0, y: 0 }
    this.pixelRatio = 1
    this.scene = null
    this.camera = null
    this.disposed = false
    renderers.push(this)
  }
  setPixelRatio(ratio) {
    this.pixelRatio = ratio
  }
  getPixelRatio() {
    return this.pixelRatio
  }
  setSize(width, height) {
    this.size = { x: width, y: height }
  }
  getSize(target) {
    return target.set(this.size.x, this.size.y)
  }
  setClearColor() {}
  // What the real renderer does with the scene before drawing it, minus the drawing: every
  // object's place in the world worked out, and anything that can't be drawn caught.
  // The big screen draws 60 times a second all game (torches flicker), so the robot looks at
  // every 30th frame closely, and the first one after anything new was added.
  render(scene, camera) {
    if (this.disposed) throw new Error('renderer.render() after dispose()')
    this.info.render.frame++
    this.scene = scene
    this.camera = camera
    const count = scene.children.length + scene.children.reduce((n, c) => n + c.children.length, 0)
    if (this.info.render.frame % 30 !== 1 && count === this.seen) return
    this.seen = count
    this.check(scene, camera)
  }
  check(scene, camera) {
    if (scene.matrixWorldAutoUpdate) scene.updateMatrixWorld()
    if (camera.parent === null && camera.matrixWorldAutoUpdate) camera.updateMatrixWorld()
    scene.traverseVisible((o) => {
      if (!o.isMesh && !o.isSprite && !o.isLine && !o.isPoints) return
      if (!o.geometry) throw new Error(`${o.type} "${o.name}" has no geometry`)
      const materials = [].concat(o.material ?? [])
      if (materials.length === 0) throw new Error(`${o.type} "${o.name}" has no material`)
      for (const m of materials) if (!m?.isMaterial) throw new Error(`${o.type} "${o.name}" has something that isn't a material`)
      for (const v of o.matrixWorld.elements) if (!Number.isFinite(v)) throw new Error(`${o.type} "${o.name}" is at a place that isn't a number (NaN)`)
    })
  }
  compile() {}
  dispose() {
    this.disposed = true
  }
  forceContextLoss() {}
}

// A pretend 2D canvas: drawing does nothing, sizes and colours are kept, text measures.
function fake2d(canvas) {
  const kept = { canvas, fillStyle: '#000', strokeStyle: '#000', font: '10px sans-serif', globalAlpha: 1, lineWidth: 1 }
  const gradient = () => ({ addColorStop() {} })
  const special = {
    measureText: (text) => ({ width: String(text).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    createLinearGradient: gradient,
    createRadialGradient: gradient,
    createConicGradient: gradient,
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getLineDash: () => [],
    isPointInPath: () => false,
  }
  return new Proxy(kept, {
    get(target, key) {
      if (key in special) return special[key]
      if (key in target) return target[key]
      return () => {}
    },
    set(target, key, value) {
      target[key] = value
      return true
    },
  })
}

// The page's own bits a 3D screen needs: a 2D canvas for labels and pictures, finger tracking
// for the camera, and image decoding for the models' textures.
export function installFake3D() {
  const contexts = new WeakMap()
  window.HTMLCanvasElement.prototype.getContext = function (kind) {
    if (kind !== '2d') return null
    if (!contexts.has(this)) contexts.set(this, fake2d(this))
    return contexts.get(this)
  }
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,'
  // jsdom lays nothing out, so every box is 0 wide; the box a 3D canvas sits in is the
  // canvas's size, as on a screen.
  for (const side of ['clientWidth', 'clientHeight']) {
    Object.defineProperty(window.HTMLElement.prototype, side, {
      configurable: true,
      get() {
        return this.querySelector(':scope > canvas[data-fake3d]') ? CANVAS_SIZE : 0
      },
    })
  }
  window.Element.prototype.setPointerCapture = function () {}
  window.Element.prototype.releasePointerCapture = function () {}
  window.Element.prototype.hasPointerCapture = () => false
  // GLTFLoader turns a model's texture into a picture through a blob URL and createImageBitmap.
  let blobs = 0
  URL.createObjectURL = () => `blob:robot-${++blobs}`
  URL.revokeObjectURL = () => {}
  globalThis.createImageBitmap = async () => ({ width: 16, height: 16, close() {} })
  // three.js's FileLoader asks for a model with new Request(url): a relative one, here.
  globalThis.Request = class {
    constructor(url, init = {}) {
      this.url = String(url)
      this.headers = init.headers
      this.signal = init.signal
    }
  }
}

// What a 3D screen's fetch gets for a 3D model file, a blob or a picture (the real .glb files
// from the repo), or null when it isn't one.
export function fileResponse(url) {
  const path = String(url?.url ?? url)
  if (path.startsWith('blob:')) return { ok: true, status: 200, blob: async () => new Blob([]) }
  if (!/\.(glb|png|jpe?g)(\?|$)/.test(path)) return null
  // A Vite asset (/src/models/Knight.glb) is the repo's file; a player's Model Workshop model
  // (/workshop/<id>/model-1.glb) is played by one of the repo's.
  const repoPath = path.startsWith('/src/') ? path.split('?')[0] : /\.glb/.test(path) ? '/src/models/Hero_Quinn.glb' : null
  if (!repoPath) return { ok: true, status: 200, blob: async () => new Blob([]), arrayBuffer: async () => new ArrayBuffer(0) }
  const bytes = readFileSync(join(ROOT, repoPath))
  // Copied into this page's own ArrayBuffer: GLTFLoader checks for one with instanceof.
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return { ok: true, status: 200, statusText: 'OK', headers: new Headers({ 'Content-Type': 'model/gltf-binary' }), body: undefined, arrayBuffer: async () => buffer, blob: async () => new Blob([buffer]) }
}

// Points on the 3D board the robot can tap: every figure, marker, item and lit square that
// renderer last drew, as a spot on its canvas.
export function boardTargets(renderer) {
  const { scene, camera } = renderer
  if (!scene || !camera) return []
  scene.updateMatrixWorld()
  camera.updateMatrixWorld()
  const targets = []
  scene.traverseVisible((o) => {
    const what = o.userData.figId ? `figure ${o.userData.figId}` : o.userData.markerId ? `marker ${o.userData.markerId}` : o.userData.itemId ? `item ${o.userData.itemId}` : o.userData.square ? `square ${o.userData.square}` : null
    if (!what) return
    const Vector3 = camera.position.constructor
    const centre = o.getWorldPosition(new Vector3())
    // A figure is tapped about halfway up, where its body is. A square is tapped near its edge
    // closest to the camera (lowest on the screen), so a figure standing on it isn't hit instead.
    const spots = o.userData.figId ? [centre.add(new Vector3(0, 0.4, 0))] : o.userData.square ? [-0.35, 0.35].flatMap((dx) => [-0.35, 0.35].map((dz) => centre.clone().add(new Vector3(dx, 0, dz)))) : [centre]
    const p = spots.map((s) => s.project(camera)).sort((a, b) => a.y - b.y)[0]
    if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || p.z > 1) return
    targets.push({ what, kind: o.userData.figId ? 'figure' : o.userData.square ? 'square' : 'thing', x: ((p.x + 1) / 2) * CANVAS_SIZE, y: ((1 - p.y) / 2) * CANVAS_SIZE })
  })
  return targets
}
