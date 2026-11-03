import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { boardExtras, boardFigures, boardLayout, restFacing } from '../board/scene3d.js'
import { artUrl, useArt } from '../state/useArt.js'
import { useAttackFx } from './AttackFx.jsx'
import { boardHoldMs } from './MomentOverlay.jsx'
import { useHealFx } from './HealFx.jsx'
import { canvasTexture, playAttack3D, playHeal3D } from './board3dFx.js'
import { useWorkshopFigures, withPlayerFigure } from './useWorkshopFigures.js'
import { setWalking, stepModels } from './figureModels.js'
import { FX_DELAY_MS, FX_MS, fxLeadMs } from '../board/attackFx.js'
import { VIEWS, VIEW_LABELS, closeUpShot, eyesCloseUp, restShot, tourShot, viewAngles, walkYaw } from '../board/camera3d.js'
import { IMPACT, msAt } from './attackFxDraw.js'
import { serverNow } from '../state/useSharedGame.js'
import { DRAG_KEY, FIGURES_KEY, FOLLOW_KEY, TAP_SLOP, VIEW_KEY, WALLS_KEY, aimCamera, cameraAngles, cornerButton, dragWanted, fitCamera, followWanted, heroModelsWanted, keepOnBoard, setDragMode, setMaxTilt, stillWanted, tapHit, viewWanted, wallsWanted } from './board3dCamera.js'
import { buildDungeon, buildWalls, disposeTree, frontSide } from './board3dDungeon.js'
import { buildExtras, buildLit, cachedPicture, HERO_LIGHTS, LAVA_LIGHTS, lookAtRest, makeHeroLight, makeLavaLight, placeHeroLights, syncFigures } from './board3dFigures.js'

// The virtual board in 3D (three.js): the dungeon's stone floor and rock, walls along shut
// edges, the stairs, and every figure as a standee carrying its round token art. Attacks
// and heals play on it like on the flat board (board3dFx.js).
//
// It draws only when something changes (a figure walks, a tile goes down, someone drags the
// camera) plus the torches' flicker, which stops with Reduce Motion on. One floor block is
// drawn for every square at once (instancing), so a big dungeon costs little.
// `onFail` hands the screen back to the flat board when this device can't draw 3D.

const TORCH_LIGHTS = 6

// Everything three.js needs, made once when the board opens.
// `calm` (iPads, phones, the table screen): no shadows, a little less sharp, and nothing
// moves unless a figure does, so the board costs nothing between moves (the iPad lag lesson).
function makeStage(mount, calm) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, calm ? 1.5 : 2))
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.shadowMap.enabled = !calm
  renderer.shadowMap.type = THREE.PCFShadowMap
  // Asking the GPU about every new shader makes the browser wait for it to finish building
  // (most of a second on an iPad); the shaders here are three.js's own, so only check them
  // while developing.
  renderer.debug.checkShaderErrors = import.meta.env.DEV
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.touchAction = 'none'
  mount.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#0c0a09')
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.maxPolarAngle = 1.2 // MAX_TILT
  controls.minDistance = 3
  controls.maxDistance = 60
  controls.screenSpacePanning = false

  const hemi = new THREE.HemisphereLight('#8a9bc4', '#2a1d12', 0.9)
  scene.add(hemi)
  const moon = new THREE.DirectionalLight('#c9d4ff', 0.55)
  moon.castShadow = !calm
  moon.shadow.mapSize.set(2048, 2048)
  scene.add(moon, moon.target)
  // The flash of a blow landing (board3dFx.js). Always there, dark until then: adding a
  // light later would make every material rebuild, a stutter right at the hit.
  const flash = new THREE.PointLight('#ffffff', 0, 7, 1.5)
  scene.add(flash)
  // The wall torches' real lights, big screen only, made now for the same reason; the
  // dungeon moves them to its torches (dungeonLook3d.js).
  const torchLights = calm ? [] : Array.from({ length: TORCH_LIGHTS }, () => new THREE.PointLight('#ff9a4a', 0, 4.5, 1.6))
  if (torchLights.length > 0) scene.add(...torchLights)
  // The heroes' torches and the lava pools' glow, made now for the same reason
  // (board3dFigures.js places them).
  const heroLights = Array.from({ length: HERO_LIGHTS }, makeHeroLight)
  const lavaLights = Array.from({ length: LAVA_LIGHTS }, makeLavaLight)
  scene.add(...heroLights, ...lavaLights)

  const blob = canvasTexture(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2)
    r.addColorStop(0, 'rgba(0,0,0,0.75)')
    r.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = r
    g.fillRect(0, 0, w, w)
  })
  const dungeon = new THREE.Group()
  const extras = new THREE.Group()
  const figures = new THREE.Group()
  const lit = new THREE.Group()
  scene.add(dungeon, extras, lit, figures)
  return { renderer, scene, camera, controls, hemi, moon, flash, torchLights, heroLights, lavaLights, blob, dungeon, extras, lit, figures, nodes: new Map(), textures: new Map(), tweens: [], animators: [], leaving: new Set(), center: new THREE.Vector3() }
}

// three.js throws a shader away as soon as nothing drawn uses it, and builds it again the
// next time something needs it. The board throws things away all the time (the whole dungeon
// and every figure on a new tile, each attack's sparks and flashes, condition icons), so the
// same dozen shaders were built over and over, each one a freeze on an iPad (Colton's lag,
// 2026-11-03). Once built, a shader is kept until the board closes.
function keepPrograms(renderer) {
  for (const program of renderer.info.programs) {
    if (program.kept) continue
    program.kept = true
    program.usedTimes++
  }
}
function dropPrograms(renderer) {
  for (const program of [...renderer.info.programs]) if (program.kept) program.destroy()
}

// Drawing slower than this on average (milliseconds a frame, while something moves) means
// this device is better off with the flat board.
const SLOW_FRAME_MS = 45
const SLOW_SAMPLE = 40
// Whether the attack about to play (or playing) defeats the figure on square `at`.
function killedBy(moment, at) {
  if (!moment?.fx || !at || serverNow() - moment.at > fxLeadMs(moment) + FX_DELAY_MS + FX_MS) return false
  return moment.fx.shots.some((s) => s.result === 'kill' && s.to[0] === at[0] && s.to[1] === at[1])
}

// A hero downed by an attack falls when the animation's blow lands, not when the die is
// rolled (the board already knows they're at 0 HP by then). Ms from now, 0 for at once.
function fallDelay(moment, at) {
  const shot = moment?.fx?.shots.find((s) => s.result === 'down' && s.to[0] === at[0] && s.to[1] === at[1])
  if (!shot) return 0
  return Math.max(0, moment.at + fxLeadMs(moment) + FX_DELAY_MS + msAt(IMPACT + 0.25) - serverNow())
}

// `taps` (a board that moves figures): { targets, selected, onSquare, onFigure, onItem,
// onMarker, onBackground }, the same handlers the flat board uses. `calm`: see makeStage.
export default function Board3D({ state, onFail, onSlow, taps = null, calm = false, look = 'full', walls = 'cutaway' }) {
  const mountRef = useRef(null)
  const stageRef = useRef(null)
  const tapsRef = useRef(taps)
  tapsRef.current = taps
  const art = useArt()
  const ownFigures = useWorkshopFigures()
  const [ready, setReady] = useState(false)
  const [heroModels, setHeroModels] = useState(heroModelsWanted)
  const [drag, setDrag] = useState(dragWanted)
  const [follow, setFollow] = useState(followWanted)
  const [wallPick, setWallPick] = useState(wallsWanted)
  // A board drawn with walls that cut away keeps them full height when this screen says so.
  const wallStyle = walls === 'cutaway' && wallPick === 'tall' ? 'tall' : walls
  const [view, setView] = useState(viewWanted)
  const [directTick, setDirectTick] = useState(0)
  const board = state.board
  // Rebuilt only when the dungeon itself changes (a tile, a door), not every time a figure moves.
  const layoutKey = board ? `${board.tiles.map((t) => t.uid).join()}|${(board.doors ?? []).map((d) => d.id).join()}` : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => (board ? boardLayout(board) : null), [layoutKey])
  const selected = taps?.selected ?? new Set()
  const figures = boardFigures(state).map((f) => ({ ...withPlayerFigure(f, ownFigures), selected: selected.has(f.id) }))
  const extras = boardExtras(state)
  const extrasKey = JSON.stringify(extras)
  const targetsKey = (taps?.targets ?? []).join(' ')
  const playing = useAttackFx(state.moment)
  const heals = useHealFx(state.healFx, state.moment)

  // Make the stage once; hand back to the flat board if this screen can't draw 3D.
  useEffect(() => {
    const mount = mountRef.current
    let stage
    try {
      stage = makeStage(mount, calm)
    } catch {
      onFail?.()
      return undefined
    }
    stage.still = stillWanted()
    stage.calm = calm
    stage.look = look
    stage.walls = wallStyle
    stage.heroModels = heroModels
    // Torch flicker, lava and fog keep the board drawing all the time: only on the big screen.
    stage.ambient = !stage.still && !calm
    let frame = 0
    let last = 0
    const slow = { frames: 0, ms: 0, done: !onSlow }
    const tick = (now) => {
      frame = 0
      // How long frames take while something keeps moving (a walk, the camera turning).
      // Frames closer than 200 ms apart are one run of drawing; a pause starts a new run.
      if (!slow.done && last && now - last < 200) {
        slow.frames++
        slow.ms += now - last
        if (slow.frames >= SLOW_SAMPLE) {
          slow.done = true
          if (slow.ms / slow.frames > SLOW_FRAME_MS) onSlow()
        }
      }
      stage.tweens = stage.tweens.filter((t) => {
        t.start ??= now + (t.wait ?? 0)
        const k = Math.max(0, Math.min(1, (now - t.start) / t.ms))
        t.step(k)
        return k < 1
      })
      if (stage.ambient) {
        for (const animate of stage.animators) animate(now)
        for (const animate of stage.dungeonAnimators ?? []) animate(now)
      }
      // Hero figures breathe on the big screen, and make their moves everywhere.
      const models = stepModels([...stage.nodes.values(), ...stage.leaving], last ? Math.min(0.1, (now - last) / 1000) : 0, stage.ambient)
      // Standees turn to face the camera.
      for (const node of stage.nodes.values()) {
        const p = node.position
        node.userData.card.rotation.set(-0.3, Math.atan2(stage.camera.position.x - p.x, stage.camera.position.z - p.z), 0, 'YXZ')
      }
      // Walls cut low on the camera's side follow it round.
      if (stage.walls === 'cutaway' && stage.layout && frontSide(stage) !== stage.front) {
        stage.front = frontSide(stage)
        buildWalls(stage)
      }
      placeHeroLights(stage, now)
      stage.renderer.render(stage.scene, stage.camera)
      keepPrograms(stage.renderer)
      const torches = stage.ambient && [...stage.nodes.values()].some((n) => n.userData.torch?.visible)
      const keepGoing = models || stage.tweens.length > 0 || torches || (stage.ambient && (stage.animators.length > 0 || stage.dungeonAnimators?.length > 0))
      last = now
      if (keepGoing) stage.render()
    }
    stage.render = () => {
      if (!frame) frame = requestAnimationFrame(tick)
    }
    const resize = () => {
      const w = mount.clientWidth || 1
      const h = mount.clientHeight || 1
      // Sizing the canvas throws its drawing away and makes a new one (a long stall on an
      // iPad), even at the same size: the board's box is measured again on many updates
      // (a new tile, the buttons above it changing) without really changing size.
      const now = stage.renderer.getSize(stage.sizeWas ??= new THREE.Vector2())
      if (now.x !== w || now.y !== h) stage.renderer.setSize(w, h, false)
      stage.camera.aspect = w / h
      stage.camera.updateProjectionMatrix()
      stage.render()
    }
    stage.resize = resize
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    // A hand on the camera stops the director's glide, and what it leaves is this screen's
    // own angle and zoom from then on (not while an attack close-up is showing).
    stage.controls.addEventListener('start', () => {
      stage.tweens = stage.tweens.filter((tw) => !tw.camera)
    })
    stage.controls.addEventListener('end', () => {
      if (!(stage.closeUntil > performance.now())) stage.keep = cameraAngles(stage)
    })
    stage.controls.addEventListener('change', () => {
      keepOnBoard(stage)
      stage.render()
    })

    // A tap (not a drag) on the board goes to the same handlers as the flat board's.
    const canvas = stage.renderer.domElement
    let down = null
    const press = (e) => {
      down = e.isPrimary ? { x: e.clientX, y: e.clientY } : null
    }
    const release = (e) => {
      const t = tapsRef.current
      if (!t || !down || !e.isPrimary || Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP) return
      down = null
      const hit = tapHit(stage, e)
      if (hit.figure) t.onFigure?.(hit.figure)
      else if (hit.marker) t.onMarker?.(hit.marker)
      else if (hit.item) t.onItem?.(hit.item)
      else if (hit.square) t.onSquare?.(hit.square)
      else t.onBackground?.()
    }
    canvas.addEventListener('pointerdown', press)
    canvas.addEventListener('pointerup', release)
    stageRef.current = stage
    setReady(true)
    return () => {
      stage.stopFx?.()
      for (const stop of stage.stopHeals ?? []) stop()
      cancelAnimationFrame(frame)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', press)
      canvas.removeEventListener('pointerup', release)
      stage.controls.dispose()
      disposeTree(stage.scene)
      dropPrograms(stage.renderer)
      for (const tex of stage.textures.values()) tex.dispose()
      stage.blob.dispose()
      stage.renderer.dispose()
      canvas.remove()
      stageRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A new tile (or a door opening) redraws the dungeon. The first time, the camera looks
  // over all of it; after that it keeps this screen's zoom and angle on the same spot (the
  // dungeon's middle moves as it grows), and Follow slides it on to the hero.
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage || !layout) return
    const before = stage.viewed ? stage.center.clone() : null
    buildDungeon(stage, layout)
    // The figures stay (rebuilding them all, a Hero Builder figure most of all, is slow on an
    // iPad): each just moves to its square in the grown dungeon. A walk still going ends there.
    for (const node of stage.nodes.values()) {
      const walk = stage.tweens.find((t) => t.node === node)
      if (walk) {
        stage.tweens = stage.tweens.filter((t) => t !== walk)
        node.userData.body.position.y = 0
        setWalking(node, false)
      }
      const sq = node.userData.at
      if (!sq) continue
      const [x, z] = stage.at(sq[0], sq[1])
      node.position.set(x, stage.heights?.get(`${sq[0]},${sq[1]}`) ?? 0, z)
    }
    for (const node of [...stage.leaving]) node.userData.gone()
    stage.bounds = layout.bounds
    stage.resize()
    if (before) {
      const shift = before.sub(stage.center)
      stage.controls.target.add(shift)
      stage.camera.position.add(shift)
      keepOnBoard(stage)
      stage.controls.update()
    } else {
      fitCamera(stage, layout.bounds, stage.camera.aspect)
      stage.viewed = true
    }
    stage.render()
  }, [ready, layout])

  // Markers and tokens, when one of them changes (and after the dungeon is rebuilt).
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage?.at) return
    buildExtras(stage, JSON.parse(extrasKey))
    stage.render()
  }, [ready, layout, extrasKey])

  // The squares a tap can go to.
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage?.at) return
    buildLit(stage, targetsKey ? targetsKey.split(' ') : [])
    stage.render()
  }, [ready, layout, targetsKey])

  // Figures every time the game changes.
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage?.at) return
    stage.heroModels = heroModels
    // What comes with a new moment waits for its card to step aside (boardHoldMs).
    // (Not a moment already there when the board opened.)
    let hold = 0
    const momentId = state.moment?.id ?? null
    if (stage.momentSeen !== undefined && momentId && momentId !== stage.momentSeen && !stage.still) {
      hold = Math.max(0, state.moment.at + boardHoldMs(state.moment) - serverNow())
    }
    stage.momentSeen = momentId
    syncFigures(stage, figures, art, (f) => fallDelay(state.moment, f.at), (at) => killedBy(state.moment, at), hold)
    const looks = restFacing(figures)
    for (const [id, node] of stage.nodes) {
      node.userData.lookAt = looks[id] ?? null
      const walking = stage.tweens.some((t) => t.node === node)
      if (!walking) lookAtRest(stage, node)
    }
    stage.render()
  })

  // The camera director (with 🎯 Follow on): it rests on the hero whose turn it is, glides to
  // each monster or villain as it takes its turn, and swoops in close for every attack.
  const active = figures.find((f) => f.active)
  const acting = figures.find((f) => f.acting)
  const foes = figures.filter((f) => f.kind === 'monster' || f.kind === 'villain')
  const heroes = figures.filter((f) => f.kind === 'hero' && !f.faded)
  const where = (f) => stageRef.current.at(f.at[0], f.at[1])
  const directKey = [active?.id, active?.at, acting?.id, acting?.at, foes.map((f) => f.at).join(';'), playing?.id].join('|')
  useEffect(() => {
    if (ready && stageRef.current) setMaxTilt(stageRef.current, view)
  }, [ready, view])
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage?.at || !follow) return
    stage.keep ??= cameraAngles(stage)
    const keep = { ...stage.keep, fitTilt: stage.fitTilt }
    clearTimeout(stage.closeTimer)
    let shot = null
    let quick = false
    let slow = 0
    if (playing && stage.closeUpOf !== playing.id) {
      const fx = playing.fx
      const from = stage.at(fx.from[0], fx.from[1])
      const to = stage.at(fx.shots[0].to[0], fx.shots[0].to[1])
      stage.closeUpOf = playing.id
      stage.closeUntil = performance.now() + FX_MS + 400
      if (view === 'eyes') {
        // Through the hero's eyes: the attacker's, or the one being attacked.
        const heroAt = (sq) => heroes.some((h) => h.at[0] === sq[0] && h.at[1] === sq[1])
        shot = heroAt(fx.from) ? eyesCloseUp(from, to) : eyesCloseUp(to, from)
      } else {
        shot = closeUpShot(from, to, cameraAngles(stage).yaw)
      }
      quick = true
    } else if (stage.closeUntil > performance.now()) {
      // An attack still playing: stay close, and look again once it's over.
    } else if (acting) {
      shot = tourShot(view, where(acting), heroes.map(where), keep)
      // It walks there: the camera goes along at its pace.
      const walking = stage.nodes.get(acting.id) && stage.tweens.find((tw) => tw.node === stage.nodes.get(acting.id))
      if (walking) slow = walking.ms
    } else if (active) {
      // Through the hero's eyes with no monster about: look the way the hero just walked.
      const here = where(active)
      const was = stage.heroWas
      stage.heroWas = { id: active.id, at: here }
      const walked = was?.id === active.id ? walkYaw(was.at, here) : null
      if (view === 'eyes' && walked !== null && !foes.length) {
        keep.yaw = walked
        stage.keep = { ...stage.keep, yaw: walked }
      }
      shot = restShot(view, here, foes.map(where), keep)
      // It walks there: the camera goes along at its pace.
      const node = stage.nodes.get(active.id)
      const walking = node && stage.tweens.find((tw) => tw.node === node)
      if (walking) slow = walking.ms
    }
    if (stage.closeUntil > performance.now()) {
      stage.closeTimer = setTimeout(() => {
        stage.closeUntil = 0
        setDirectTick((n) => n + 1)
      }, stage.closeUntil - performance.now())
    }
    if (shot) aimCamera(stage, shot, quick ? 550 : Math.max(800, slow))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, layout, directKey, follow, view, directTick])
  useEffect(() => () => clearTimeout(stageRef.current?.closeTimer), [])

  // An attack flies, strikes and fades (one at a time: a new one clears the last).
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage?.at || !playing) return
    stage.stopFx?.()
    stage.stopFx = playAttack3D(stage, playing.fx, (name) => cachedPicture(stage, artUrl(art, name)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, playing?.id])

  // Each heal floats up once over its hero.
  const healsKey = heals.map((h) => h.key).join()
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage?.at) return
    stage.healsShown ??= new Set()
    stage.stopHeals ??= []
    for (const h of heals) {
      const node = stage.nodes.get(h.heroId)
      if (stage.healsShown.has(h.key) || !node) continue
      stage.healsShown.add(h.key)
      stage.stopHeals.push(playHeal3D(stage, node, h.amount, h.delay))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, healsKey])

  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage) return
    stage.drag = drag
    setDragMode(stage.controls, drag, view)
  }, [ready, drag, view])

  const switchFollow = () => {
    const on = !follow
    setFollow(on)
    try {
      localStorage.setItem(FOLLOW_KEY, on ? 'on' : 'off')
    } catch {
      // Private browsing: it just isn't remembered.
    }
  }

  // Walls shrink / stay tall: rebuilt right away, no need to wait for the camera to turn.
  useEffect(() => {
    const stage = stageRef.current
    if (!ready || !stage || stage.walls === wallStyle) return
    stage.walls = wallStyle
    if (!stage.layout) return
    stage.front = frontSide(stage)
    buildWalls(stage)
    stage.render()
  }, [ready, wallStyle])

  const switchWalls = () => {
    const next = wallPick === 'tall' ? 'shrink' : 'tall'
    setWallPick(next)
    try {
      localStorage.setItem(WALLS_KEY, next)
    } catch {
      // Private browsing: it just isn't remembered.
    }
  }

  const switchDrag = () => {
    const next = drag === 'move' ? 'turn' : 'move'
    setDrag(next)
    try {
      localStorage.setItem(DRAG_KEY, next)
    } catch {
      // Private browsing: it just isn't remembered.
    }
  }

  const switchFigures = () => {
    const on = !heroModels
    setHeroModels(on)
    try {
      localStorage.setItem(FIGURES_KEY, on ? 'models' : 'standees')
    } catch {
      // Private browsing: it just isn't remembered.
    }
  }

  const fit = () => {
    const stage = stageRef.current
    if (!stage || !layout) return
    stage.tweens = stage.tweens.filter((tw) => !tw.camera)
    fitCamera(stage, layout.bounds, stage.camera.aspect)
    stage.render()
  }

  // 🎥 Top, Corner, Behind hero: each picks its angle, then the director keeps it on the hero.
  const switchView = () => {
    const next = VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]
    setView(next)
    try {
      localStorage.setItem(VIEW_KEY, next)
    } catch {
      // Private browsing: it just isn't remembered.
    }
    const stage = stageRef.current
    if (!stage?.at) return
    // Hero eyes is right up close: coming out of it goes back to the zoom from before.
    if (next === 'eyes') stage.keepBeforeEyes = stage.keep
    if (view === 'eyes' && stage.keepBeforeEyes) stage.keep = stage.keepBeforeEyes
    setMaxTilt(stage, next)
    const now = { ...(stage.keep ?? cameraAngles(stage)), fitTilt: stage.fitTilt }
    const { fitTilt: _fit, ...keep } = viewAngles(next, stage.fitYaw ?? 0, now)
    stage.keep = keep
    if (next === 'eyes' && active) {
      if (!follow) aimCamera(stage, restShot('eyes', where(active), foes.map(where), keep))
    } else if (!follow || !active) aimCamera(stage, { ...keep, target: [stage.controls.target.x, stage.controls.target.z] })
  }

  if (!board) return null
  return (
    <section className="relative h-full min-h-0 flex-1 overflow-hidden rounded-2xl" data-board3d>
      <div ref={mountRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-2 right-2 top-2 flex flex-wrap justify-end gap-2 [&>*]:pointer-events-auto">
        <button type="button" onClick={switchFigures} aria-pressed={heroModels} className={cornerButton(calm)}>
          {heroModels ? '🧍 Figures: 3D' : '🪪 Figures: tokens'}
        </button>
        <button type="button" onClick={switchView} title="Camera angle: from the top, from a corner, from behind the hero, or through the hero's eyes" className={cornerButton(calm)}>
          🎥 {VIEW_LABELS[view]}
        </button>
        <button type="button" onClick={switchFollow} aria-pressed={follow} title="The map slides to the hero whose turn it is" className={cornerButton(calm)}>
          {follow ? '🎯 Follow: on' : '🎯 Follow: off'}
        </button>
        <button
          type="button"
          onClick={switchDrag}
          aria-pressed={drag === 'move'}
          title={drag === 'move' ? 'Dragging slides the board. Two fingers or right-drag turn it.' : 'Dragging turns the board. Two fingers or right-drag slide it.'}
          className={cornerButton(calm)}
        >
          {drag === 'move' ? '✋ Drag: move' : '🔄 Drag: turn'}
        </button>
        {walls === 'cutaway' && (
          <button
            type="button"
            onClick={switchWalls}
            aria-pressed={wallPick === 'tall'}
            title={wallPick === 'tall' ? 'Walls always stay full height, even when they hide a square.' : 'Walls between you and the floor drop low so they never hide anyone.'}
            className={cornerButton(calm)}
          >
            {wallPick === 'tall' ? '🧱 Walls: stay tall' : '🧱 Walls: shrink'}
          </button>
        )}
        <button type="button" onClick={fit} className={cornerButton(calm)}>
          Fit
        </button>
      </div>
    </section>
  )
}
