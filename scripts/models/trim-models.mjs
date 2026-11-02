/* global process, console */
// Makes the hero figures in src/models from the KayKit Adventurers pack (CC0, Kay Lousberg,
// https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0), keeping only
// the moves the 3D board uses (src/components/figureModels.js MOVES), which takes each file
// from about 3.6 MB to about 0.75 MB.
//
//   npm install --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4
//   node scripts/models/trim-models.mjs <pack>/addons/kaykit_character_pack_adventures/Characters/gltf
import { readdirSync } from 'node:fs'
import { basename, join } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, resample } from '@gltf-transform/functions'

const KEEP = new Set([
  'Idle', 'Walking_A', '1H_Melee_Attack_Chop', '2H_Melee_Attack_Chop', '1H_Ranged_Shoot', '2H_Ranged_Shoot',
  'Spellcast_Shoot', 'Throw', 'Hit_A', 'Dodge_Right', 'Death_A', 'Death_A_Pose', 'Cheer',
])
const FIGURES = ['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded']

const from = process.argv[2]
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
for (const file of readdirSync(from).filter((f) => FIGURES.includes(basename(f, '.glb')))) {
  const doc = await io.read(join(from, file))
  for (const animation of doc.getRoot().listAnimations()) {
    if (KEEP.has(animation.getName())) continue
    // An animation's channels and samplers outlive it unless they go first.
    for (const channel of animation.listChannels()) channel.dispose()
    for (const sampler of animation.listSamplers()) sampler.dispose()
    animation.dispose()
  }
  await doc.transform(prune({ keepLeaves: false }), resample(), dedup())
  await io.write(join('src/models', file), doc)
  console.log(file)
}
