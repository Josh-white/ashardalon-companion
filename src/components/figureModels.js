import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { MODEL_PROPS } from '../board/heroModels.js'
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
// Weapons held in both hands use the two-handed moves.
const TWO_HANDED = /^2H_/

const loads = new Map()
function loadModel(name) {
  if (!loads.has(name)) {
    loads.set(
      name,
      new GLTFLoader().loadAsync(FILES[name]).catch((error) => {
        loads.delete(name)
        throw error
      }),
    )
  }
  return loads.get(name)
}

// Gives the standee `node` its hero figure once the file is in. `look` is heroModel()'s
// pick, `color` the hero's colour (the cape). Calls `ready` after, to draw again.
export function attachModel(node, look, color, ready) {
  if (!FILES[look.model]) return
  loadModel(look.model)
    .then((gltf) => {
      if (node.userData.disposed) return
      const figure = cloneSkinned(gltf.scene)
      figure.scale.setScalar(SCALE)
      figure.scale.y = SCALE * look.height
      // One coat of paint per hero (it flashes red when hit), the cape dyed its colour.
      let paint = null
      const cape = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide })
      const gear = new Set(look.gear)
      figure.traverse((o) => {
        if (MODEL_PROPS[look.model]?.includes(o.name)) o.visible = gear.has(o.name)
        if (!o.isMesh) return
        o.castShadow = true
        o.frustumCulled = false
        if (/_Cape$/.test(o.name)) {
          o.material = cape
          return
        }
        paint ??= o.material.clone()
        o.material = paint
      })
      const mixer = new THREE.AnimationMixer(figure)
      const clips = new Map(gltf.animations.map((c) => [c.name, c]))
      const twoHanded = look.gear.some((g) => TWO_HANDED.test(g))
      const action = (move) => {
        const name = MOVES[twoHanded && MOVES[`${move}2`] ? `${move}2` : move]
        return clips.has(name) ? mixer.clipAction(clips.get(name)) : null
      }
      const anim = { mixer, action, state: null, busy: false, cape, paint }
      mixer.addEventListener('finished', (e) => {
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
      node.userData.capeMat = cape
      settle(anim, true)
      ready()
    })
    .catch((error) => console.warn('3D hero figure did not load', error))
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
  anim.mixer.update(now ? 0.01 : 0)
}

// One move (attack, cast, shoot, throw, hit, dodge, fall), then back to standing.
export function playMove(node, move) {
  const anim = node?.userData.anim
  if (!anim) return
  const next = anim.action(move)
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
    if (anim.busy || ambient) anim.mixer.update(seconds)
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
  anim.cape.dispose()
  card.visible = true
  node.userData.faceMat = standeeMat
  node.userData.model = node.userData.anim = null
}
