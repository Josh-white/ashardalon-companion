// Teaching the game to someone who has never played: six short cards (HowToPlay.jsx), read
// aloud by the narrator, and a line from the hero's coach at the start of each phase of a
// player's first game (FirstGameHelp in TurnGuide.jsx). Our own words, not the rulebook's.
import { coachFor } from './coaches.js'

const NARRATOR_CUE = '[friendly, clear]'

export const HOW_TO_PLAY = [
  {
    key: 'team',
    pic: '🛡️',
    title: "You're a team",
    text: 'Work together to finish the adventure. Everyone wins together, or everyone loses together.',
  },
  {
    key: 'phases',
    pic: '🔁',
    title: 'Your turn has 3 steps',
    steps: [
      ['⚔️ Hero', 'Move and attack.'],
      ['🗺️ Explore', 'At the edge of the map? Add a new room. A monster pops out!'],
      ['🐉 Villain', 'The monsters you found fight back. No new room? Draw an encounter card.'],
    ],
    text: 'Every turn goes Hero, then Explore, then Villain. The app shows which step you are on.',
  },
  {
    key: 'attack',
    pic: '🎲',
    title: 'Attacking',
    text: 'Pick a power and roll the d20. Your roll plus your attack bonus has to reach the monster’s AC to hit. The app does the math.',
  },
  {
    key: 'explore',
    pic: '🗺️',
    title: 'Exploring',
    text: 'End your move on an open edge of a tile to explore. A new tile goes down with a new monster on it, and that monster is yours to run in the Villain step.',
  },
  {
    key: 'treasure',
    pic: '💰',
    title: 'Beat a monster, get treasure',
    text: 'The first monster you beat on your turn gives you a treasure card. Only one per turn. The app will remind you at the bottom of the screen.',
  },
  {
    key: 'surge',
    pic: '❤️',
    title: 'Knocked out?',
    text: 'At 0 HP, the team spends a healing surge to bring you back. If someone hits 0 HP with no surges left, the whole party loses. Stick together!',
  },
]

// What the narrator says for each card, recorded once on the Pi (src/audio/script.js).
export function howToPlayLine(card) {
  const words = card.steps ? `${card.title}. ${card.steps.map(([step, what]) => `${step.replace(/^\S+\s/, '')}: ${what}`).join(' ')}` : `${card.title}. ${card.text}`
  return { voice: 'narrator', text: `${NARRATOR_CUE} ${words}` }
}

// One plain sentence per phase, for the tap on a phase name and the first-game helper.
export const PHASE_HELP = {
  hero: 'Your move! Walk, attack a monster, or walk twice. When you are done, go on to Exploration.',
  exploration: 'Standing on an open edge of the map? Add a new room, and a monster pops out of it. That monster is yours to run.',
  villain: "The dungeon's turn. The villain and your monsters attack. If you didn't add a room, you draw an encounter card too.",
}

// The hero's coach says the phase's line in their own voice (the coach's cue sets the tone).
export function phaseHelpLine(heroKey, phaseKey) {
  const coach = coachFor(heroKey)
  const text = PHASE_HELP[phaseKey]
  if (!text) return null
  return coach ? { voice: `coach_${heroKey}`, text: `${coach.cue} ${text}` } : { voice: 'narrator', text: `${NARRATOR_CUE} ${text}` }
}

// Who says the phase lines on screen: the coach's name, or nobody for a hero without one.
export const phaseHelper = (heroKey) => coachFor(heroKey)?.coach ?? null

// Lines to record ahead of time for every hero in the box.
export function teachingLines(heroKeys) {
  const lines = HOW_TO_PLAY.map(howToPlayLine)
  for (const key of [...heroKeys, null]) for (const phase of Object.keys(PHASE_HELP)) lines.push(phaseHelpLine(key, phase))
  return lines
}
