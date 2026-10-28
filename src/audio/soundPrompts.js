// The sounds made with ElevenLabs' sound effects, by server/generate-sounds.js. Each
// becomes cards/sounds/<name>.mp3 on the Pi (kept out of git, like the card art), and
// plays in place of the made-up sound it's named for (see RECORDING_NAMES in sfx.js).
// JJ picked these prompts on 2026-10-28.
//
//   seconds   how long it is: ElevenLabs charges 40 credits a second
//   takes     how many versions to make, to pick the best from on the #audition page
//   loop      made to repeat with no gap (the ambient loops)
//   follow    how closely it follows the prompt, 0 to 1 (higher sticks to the words)

const loop = (name, seconds, prompt) => ({ name, group: 'Ambient loops', seconds, takes: 2, loop: true, follow: 0.4, prompt })
const shot = (group, name, seconds, prompt) => ({ name, group, seconds, takes: 3, loop: false, follow: 0.6, prompt })

export const SOUND_PROMPTS = [
  loop('loop-explore', 25, 'Ambient cave atmosphere, slow water drips echoing in a vast stone cavern, distant low volcanic rumble, faint wind through tunnels, no music'),
  loop('loop-battle', 20, 'Tense dungeon combat ambience, low steady tribal war drum pulse, dark subterranean tension, crackling torch fire in stone halls, unobtrusive, no melody'),
  loop('loop-boss', 25, 'Ominous boss chamber, slow heavy war drums, deep rumble of lava, low droning tension, huge creature breathing far off, no melody'),

  shot('Table', 'slide', 2, 'Heavy stone slab sliding across a stone floor and settling with a dull thud, dungeon echo'),
  shot('Table', 'trap', 1.5, 'Hidden blade trap springing, sharp metal click then a fast blade swoosh and slice'),
  shot('Table', 'fanfare', 3, 'Triumphant war horn blast followed by a ringing sword clash, heroic'),
  shot('Table', 'coins', 2, 'Handful of gold coins spilling and clattering onto a wooden table'),
  shot('Table', 'weapon', 1.5, 'Heavy medieval broadsword and battleaxe slash followed by a sharp armor impact'),
  shot('Table', 'arrow', 1.5, 'Heavy composite bowstring twang, fast whistling arrow flight and sharp impact'),

  shot('Monsters', 'monster-cultist', 2, 'Sinister dark cultist chanting whisper followed by a sharp sacrificial dagger draw'),
  shot('Monsters', 'monster-duergar', 2, 'Heavy dwarven iron boots marching on stone, gruff subterranean war grunt and warhammer clank'),
  shot('Monsters', 'monster-orc-archer', 2, 'Snarling orc growl followed by a heavy composite bowstring drawn taut and released'),
  shot('Monsters', 'monster-orc-smasher', 2, 'Massive ferocious orc berserker war cry and a heavy iron maul smashing stone'),
  shot('Monsters', 'monster-snake', 2, 'Loud aggressive giant viper hiss and scales slithering rapidly on stone'),
  shot('Monsters', 'monster-devil', 2, 'Infernal hellfire whoosh, dark demonic metallic snarl and clanking legion armor'),
  shot('Monsters', 'monster-mouther', 2, 'Horrifying wet bubbling flesh, multiple alien mouths babbling and chittering in madness'),
  shot('Monsters', 'monster-grell', 2, 'Eerie floating predator beak snapping clicks and wet tentacles whipping through the air'),
  shot('Monsters', 'monster-bear', 2, 'Massive ferocious cave bear bellowing roar, deep reverberating cavern echo'),
  shot('Monsters', 'monster-kobold', 2, 'High-pitched reptilian kobold yip and vicious hiss, small metal shield bash'),

  shot('Hero powers', 'spell-holy', 2, 'Radiant divine magic burst, shimmering celestial choir chime and golden power surge'),
  shot('Hero powers', 'spell-fire', 2, 'Explosive dragon fire breath whoosh and roaring magical flames'),
  shot('Hero powers', 'spell-lightning', 2, 'High-voltage arcane lightning bolt crackle and electric shock discharge'),
  shot('Hero powers', 'spell-frost', 2, 'Freezing ice magic blast, crystalline frost shattering and howling cold wind'),
  shot('Hero powers', 'spell-psychic', 2, 'Eerie psychic mind-magic pulse, resonant crystalline hum and shadowy whisper'),
  shot('Hero powers', 'spell-arcane', 2, 'Powerful arcane force impact, mystical energy whoosh and heavy magical shockwave'),
  shot('Hero powers', 'spell-thunder', 2, 'Deafening magical thunderclap boom and shockwave echoing in stone dungeon'),
  shot('Hero powers', 'power-heal', 2, 'Warm soothing restoration magic, gentle harp shimmer and glowing vitality chime'),
  shot('Hero powers', 'power-utility', 2, 'Quick arcane teleport shimmer, mystical cloak swoosh and illusion chime'),
]

export const CREDITS_PER_SECOND = 40

// What making every take of these sounds costs, in credits.
export const promptCredits = (prompts) => prompts.reduce((sum, p) => sum + Math.ceil(p.seconds * CREDITS_PER_SECOND) * p.takes, 0)

// The file name of one take.
export const takeFile = (name, take) => `${name}-${take}.mp3`
