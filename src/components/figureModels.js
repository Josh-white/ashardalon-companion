import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { MODEL_PROPS } from '../board/heroModels.js'
import { boneScales, NO_TWEAKS } from '../data/workshop.js'
import { buildFigure, disposeFigure, figureClips } from '../forge/figure.js'
import Knight from '../models/Knight.glb?url'
import Barbarian from '../models/Barbarian.glb?url'
import Mage from '../models/Mage.glb?url'
import Rogue from '../models/Rogue.glb?url'
import RogueHooded from '../models/Rogue_Hooded.glb?url'
import OrcSmasher from '../models/Orc_Smasher.glb?url'
import OrcArcher from '../models/Orc_Archer.glb?url'
import KoboldDragonshield from '../models/Kobold_Dragonshield.glb?url'
import HumanCultist from '../models/Human_Cultist.glb?url'
import DuergarGuard from '../models/Duergar_Guard.glb?url'
import Snake from '../models/Snake.glb?url'
import CaveBear from '../models/Cave_Bear.glb?url'
import LegionDevil from '../models/Legion_Devil.glb?url'
import Grell from '../models/Grell.glb?url'
import Kobold_Dragonlord from '../models/Kobold_Dragonlord.glb?url'
import Duergar_Captain from '../models/Duergar_Captain.glb?url'
import Orc_Storm_Shaman from '../models/Orc_Storm_Shaman.glb?url'
import Gauth from '../models/Gauth.glb?url'
import Otyugh from '../models/Otyugh.glb?url'
import Rage_Drake from '../models/Rage_Drake.glb?url'
import Ashardalon from '../models/Ashardalon.glb?url'
import Villager_Alek from '../models/Villager_Alek.glb?url'
import Villager_Brandis from '../models/Villager_Brandis.glb?url'
import Villager_Cassi from '../models/Villager_Cassi.glb?url'
import Villager_Donnel from '../models/Villager_Donnel.glb?url'
import Villager_Elizar from '../models/Villager_Elizar.glb?url'
import Gibbering_Mouther from '../models/Gibbering_Mouther.glb?url'

// The 3D figures on the 3D board: the heroes are KayKit Adventurers (CC0, src/models, trimmed
// to the moves used here by scripts/models/trim-models.mjs); the monsters are our own, made in
// Blender by scripts/models/make-monsters.py with the same move names. Each file is downloaded once, the
// first time a hero needs it, then copied for every hero on that figure.
//
// A figure stands idle, walks when it moves, swings, shoots or casts when it attacks,
// staggers when hit, sidesteps a miss and falls at 0 HP. On the big screen the idle breathes
// all the time; on iPads the figure only moves while something happens (the iPad lag lesson).

const FILES = {
  Knight,
  Barbarian,
  Mage,
  Rogue,
  Rogue_Hooded: RogueHooded,
  Orc_Smasher: OrcSmasher,
  Orc_Archer: OrcArcher,
  Kobold_Dragonshield: KoboldDragonshield,
  Human_Cultist: HumanCultist,
  Duergar_Guard: DuergarGuard,
  Snake,
  Cave_Bear: CaveBear,
  Legion_Devil: LegionDevil,
  Grell,
  Kobold_Dragonlord,
  Duergar_Captain,
  Orc_Storm_Shaman,
  Gauth,
  Otyugh,
  Rage_Drake,
  Ashardalon,
  Villager_Alek,
  Villager_Brandis,
  Villager_Cassi,
  Villager_Donnel,
  Villager_Elizar,
  Gibbering_Mouther,
}
// The figures are about 2.5 units tall: this makes them one square tall.
const SCALE = 0.44
// How long a figure takes to ease back into standing (seconds).
const EASE = 0.3

const MOVES = {
  idle: 'Idle',
  walk: 'Walking_A',
  attack: '1H_Melee_Attack_Chop',
  attack2: '2H_Melee_Attack_Chop',
  shoot: '1H_Ranged_Shoot',
  shoot2: '2H_Ranged_Shoot',
  cast: 'Spellcast_Shoot',
  throw: 'Throw',
  hit: 'Hit_A',
  dodge: 'Dodge_Right',
  fall: 'Death_A',
  down: 'Death_A_Pose',
  cheer: 'Cheer',
}
// Moves a figure may not have: it attacks instead.
const RANGED = new Set(['cast', 'shoot', 'throw'])
// Weapons held in both hands use the two-handed moves.
const TWO_HANDED = /^2H_/

// A figure is one of ours by name (look.model), a player's own from the Model Workshop by
// its address on the Pi (look.url, with the player's 🎨 tweaks in look.tweaks), or one a
// player put together in the 🛠️ Hero Builder (look.recipe, built right here).
const fileOf = (look) => look.url ?? FILES[look.model]

const loads = new Map()
function loadModel(file) {
  if (!loads.has(file)) {
    loads.set(
      file,
      new GLTFLoader().loadAsync(file).catch((error) => {
        loads.delete(file)
        throw error
      }),
    )
  }
  return loads.get(file)
}

// Pixels per colour square in a workshop figure's palette strip (scripts/models/make-monsters.py).
const SWATCH = 4

// The figure's palette with the player's 🎨 colours painted over their squares, or null when
// there are none (or no palette).
function tintedPalette(map, colors) {
  const image = map?.image
  if (!image || !Object.keys(colors ?? {}).length || typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(image, 0, 0)
  for (const [slot, hex] of Object.entries(colors)) {
    ctx.fillStyle = hex
    ctx.fillRect(Number(slot) * SWATCH, 0, SWATCH, canvas.height)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.flipY = false
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  return texture
}

// Moves the figure on, then puts the player's head and body sizes back (a move would undo them).
function update(anim, seconds) {
  anim.mixer.update(seconds)
  for (const [bone, k] of anim.bones) bone.scale.setScalar(k)
}

// Gives the standee `node` its hero figure once the file is in. `look` is heroModel()'s
// pick, `color` the hero's colour (the cape). Calls `ready` after, to draw again.
export function attachModel(node, look, color, ready) {
  if (look.recipe) return attachBuilt(node, look.recipe, ready)
  const file = fileOf(look)
  if (!file) return
  const tweaks = { ...NO_TWEAKS, ...look.tweaks }
  loadModel(file)
    .then((gltf) => {
      if (node.userData.disposed) return
      const figure = cloneSkinned(gltf.scene)
      figure.scale.setScalar(SCALE * tweaks.size)
      figure.scale.y = SCALE * look.height * tweaks.size
      // One coat of paint per hero (it flashes red when hit), the cape dyed its colour.
      let paint = null
      let tint = null
      const sizes = look.tweaks ? boneScales(tweaks) : {}
      const bones = []
      const cape = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide })
      const gear = new Set(look.gear)
      figure.traverse((o) => {
        if (MODEL_PROPS[look.model]?.includes(o.name)) o.visible = gear.has(o.name)
        if (o.isBone && sizes[o.name] && sizes[o.name] !== 1) bones.push([o, sizes[o.name]])
        if (!o.isMesh) return
        o.castShadow = true
        o.frustumCulled = false
        if (/_Cape$/.test(o.name)) {
          o.material = cape
          return
        }
        if (!paint) {
          paint = o.material.clone()
          tint = tintedPalette(paint.map, tweaks.colors)
          if (tint) paint.map = tint
        }
        o.material = paint
      })
      const mixer = new THREE.AnimationMixer(figure)
      const clips = new Map(gltf.animations.map((c) => [c.name, c]))
      const twoHanded = look.gear.some((g) => TWO_HANDED.test(g))
      const action = (move) => {
        const name = MOVES[twoHanded && MOVES[`${move}2`] ? `${move}2` : move]
        if (clips.has(name)) return mixer.clipAction(clips.get(name))
        // A monster with no spell or shot of its own (a mouther's gibbering, a drake's fire)
        // lunges with its attack instead of standing still.
        return RANGED.has(move) && clips.has(MOVES.attack) ? mixer.clipAction(clips.get(MOVES.attack)) : null
      }
      const anim = { mixer, action, clips, state: null, busy: false, cape, paint, tint, bones }
      standUp(node, figure, anim, paint, ready)
    })
    .catch((error) => console.warn('3D hero figure did not load', error))
}

// Puts a loaded figure on its standee's spot and starts it standing.
function standUp(node, figure, anim, paint, ready) {
  anim.mixer.addEventListener('finished', (e) => {
    // Only the move playing now: one it cut short doesn't send the figure back to idle.
    if (e.action !== anim.current) return
    anim.busy = false
    settle(anim)
  })
  const { body, card, faceMat } = node.userData
  card.visible = false
  body.add(figure)
  node.userData.model = figure
  node.userData.anim = anim
  // The red flash of a hit, and the grey of a fallen hero, go on the figure now.
  node.userData.standeeMat = faceMat
  node.userData.faceMat = paint ?? faceMat
  node.userData.capeMat = anim.cape
  settle(anim, true)
  ready()
}

// About as tall as the other figures (one square), whatever its own size slider says, so a
// big hero still fits its square; the size slider still makes it a little bigger or smaller.
const BUILT_HEIGHT = 1.0

// A 🛠️ Hero Builder figure: built from its recipe, no file to load. Its parts keep their own
// colours; a hit flashes all of them (they share one flash, `paint`'s glow).
function attachBuilt(node, recipe, ready) {
  let figure
  try {
    figure = buildFigure(recipe)
  } catch (error) {
    console.warn('Hero Builder figure did not build', error)
    return
  }
  const size = recipe.size ?? 1
  figure.scale.setScalar((BUILT_HEIGHT / (figure.userData.height / size)) * (0.85 + 0.15 * size))
  // One material the flashes can light up, shared by every part through onBeforeRender.
  const paint = new THREE.MeshStandardMaterial({ emissive: '#000000', emissiveIntensity: 0 })
  figure.traverse((o) => {
    if (!o.isMesh) return
    o.castShadow = true
    o.frustumCulled = false
    const own = o.material
    o.onBeforeRender = () => {
      own.userData.glow ??= { color: own.emissive.clone(), intensity: own.emissiveIntensity }
      if (paint.emissiveIntensity > 0) {
        own.emissive.copy(paint.emissive)
        own.emissiveIntensity = paint.emissiveIntensity
      } else {
        own.emissive.copy(own.userData.glow.color)
        own.emissiveIntensity = own.userData.glow.intensity
      }
    }
  })
  const mixer = new THREE.AnimationMixer(figure)
  const clips = new Map(figureClips(figure).map((c) => [c.name, c]))
  const action = (move) => {
    const name = MOVES[move]
    return clips.has(name) ? mixer.clipAction(clips.get(name)) : null
  }
  const cape = new THREE.MeshStandardMaterial()
  const anim = { mixer, action, clips, state: null, busy: false, cape, paint, tint: null, bones: [], built: figure }
  standUp(node, figure, anim, paint, ready)
}

// Back to what the figure does when nothing is happening: standing, or lying down.
function settle(anim, now = false) {
  const want = anim.down ? 'down' : 'idle'
  if (anim.state === want) return
  const next = anim.action(want)
  if (!next) return
  next.reset().setLoop(THREE.LoopRepeat, Infinity).play()
  if (anim.current && anim.current !== next && !now) anim.current.crossFadeTo(next, 0.25, false)
  else if (anim.current && anim.current !== next) anim.current.stop()
  anim.current = next
  anim.state = want
  // It keeps drawing while it eases in, even where the idle itself doesn't move.
  anim.busy = !now
  anim.easing = now ? 0 : EASE
  update(anim, now ? 0.01 : 0)
}

// One move (attack, cast, shoot, throw, hit, dodge, fall), then back to standing.
export function playMove(node, move) {
  const anim = node?.userData.anim
  if (!anim) return
  // A monster figure with no shooting or casting move swings instead.
  const next = anim.action(move) ?? (['shoot', 'cast', 'throw'].includes(move) ? anim.action('attack') : null)
  if (!next) return
  next.reset().setLoop(THREE.LoopOnce, 1)
  next.clampWhenFinished = true
  next.play()
  if (anim.current && anim.current !== next) anim.current.crossFadeTo(next, 0.12, false)
  anim.current = next
  anim.state = move
  anim.busy = true
  anim.easing = 0
}

// Any of the figure's own moves by its name in the file (the #models page's buttons). A
// looping one (Idle, Walking) keeps going; any other plays once, then the figure stands again.
export function playClip(node, name, loop = false) {
  const anim = node?.userData.anim
  const clip = anim?.clips.get(name)
  if (!clip) return
  const next = anim.mixer.clipAction(clip)
  anim.down = name === 'Death_A_Pose'
  next.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1)
  next.clampWhenFinished = !loop
  next.play()
  if (anim.current && anim.current !== next) anim.current.crossFadeTo(next, 0.15, false)
  anim.current = next
  anim.state = loop ? name : 'clip'
  anim.busy = !loop
  anim.easing = 0
}

// The names of a figure's moves, once it has loaded.
export const clipNames = (node) => [...(node?.userData.anim?.clips.keys() ?? [])]

// Walking while gliding to a new square, standing again after.
export function setWalking(node, walking) {
  const anim = node?.userData.anim
  if (!anim) return
  if (!walking) {
    if (anim.state === 'walk') {
      anim.busy = false
      settle(anim)
    }
    return
  }
  if (anim.state === 'walk' || anim.down) return
  const next = anim.action('walk')
  if (!next) return
  next.reset().setLoop(THREE.LoopRepeat, Infinity).play()
  if (anim.current && anim.current !== next) anim.current.crossFadeTo(next, 0.15, false)
  anim.current = next
  anim.state = 'walk'
  anim.busy = true
  anim.easing = 0
}

// A hero at 0 HP falls (once) and lies there; healed, it stands up again.
export function setDown(node, down) {
  const anim = node?.userData.anim
  if (!anim || Boolean(anim.down) === down) return
  anim.down = down
  if (down) {
    playMove(node, 'fall')
  } else {
    anim.busy = false
    settle(anim)
  }
}

// Turns the figure (not its ring or icons) to look along (dx, dz).
export function face(node, dx, dz) {
  if (!node?.userData.model || (Math.abs(dx) < 1e-3 && Math.abs(dz) < 1e-3)) return
  node.userData.model.rotation.y = Math.atan2(dx, dz)
}

// Moves every figure on by `seconds`. Returns whether any is in the middle of a move.
export function stepModels(nodes, seconds, ambient) {
  let moving = false
  for (const node of nodes) {
    const anim = node.userData.anim
    if (!anim) continue
    if (anim.busy || ambient) update(anim, seconds)
    if (anim.easing > 0) {
      anim.easing -= seconds
      if (anim.easing <= 0) anim.busy = false
    }
    moving ||= anim.busy
  }
  return moving
}

// Takes the figure off again (back to the standee).
export function detachModel(node) {
  const { model, anim, standeeMat, card, body } = node.userData
  if (!model) return
  anim.mixer.stopAllAction()
  body.remove(model)
  anim.paint?.dispose()
  anim.tint?.dispose()
  if (anim.built) disposeFigure(anim.built)
  anim.cape.dispose()
  card.visible = true
  node.userData.faceMat = standeeMat
  node.userData.model = node.userData.anim = null
}
