// Records every line the narrator can say ahead of time, from the cards on this Pi,
// so the narrator keeps working after the ElevenLabs key is removed. Lines already
// recorded are skipped, so it costs credits only for what's new.
//
//   docker compose exec ashardalon node server/record-narration.js --dry-run   # count only
//   docker compose exec ashardalon node server/record-narration.js             # record
//   ... record-narration.js --cards=rogue,paladin [--dry-run]   # also the heroes reading cards
//
// The heroes reading cards out loud aren't recorded unless asked for with --cards (all five
// heroes with no list): every card in every voice is more credits than a month has. Without
// it, a card is recorded the first time a hero reads it in a game.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cardReadingScript, narrationScript } from '../src/audio/script.js'
import { setHeroTemplates } from '../src/data/heroes.js'
import { CREDITS_PER_LETTER, createNarrator, speakable } from './narrator.js'
import { loadCards } from './server.js'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

export function plan(narrator, lines) {
  const todo = lines.filter((line) => !narrator.isSaved(line.voice, line.text))
  const letters = (line) => speakable(line.text, narrator.modelFor(line.voice)).length
  const credits = todo.reduce((sum, line) => sum + letters(line) * (CREDITS_PER_LETTER[narrator.modelFor(line.voice)] ?? 1), 0)
  return { todo, letters: todo.reduce((sum, line) => sum + letters(line), 0), credits: Math.ceil(credits) }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const saveFile = process.env.SAVE_FILE ?? join(ROOT, 'data', 'game.json')
  const cards = loadCards(process.env.CARDS_FILE ?? join(ROOT, 'cards', 'cards.json'), join(ROOT, 'cards', 'cards.example.json'))
  const narrator = createNarrator({ cacheDir: join(dirname(saveFile), 'narration') })
  setHeroTemplates(cards.heroes)
  const cardsArg = process.argv.find((a) => a === '--cards' || a.startsWith('--cards='))
  const heroKeys = cardsArg?.includes('=') ? cardsArg.split('=')[1].split(',').filter(Boolean) : null
  const lines = [...narrationScript(cards), ...(cardsArg ? cardReadingScript(cards, heroKeys) : [])]
  const { todo, letters, credits } = plan(narrator, lines)
  console.log(`${lines.length} lines in all, ${lines.length - todo.length} already recorded.`)
  console.log(`${todo.length} to record: ${letters} letters, about ${credits} ElevenLabs credits.`)
  if (dryRun) {
    for (const line of todo) console.log(`  [${line.voice}] ${line.text}`)
    return
  }
  if (!narrator.hasKey) {
    console.log('No ELEVENLABS_API_KEY, so nothing can be recorded.')
    process.exitCode = 1
    return
  }
  let done = 0
  for (const line of todo) {
    try {
      await narrator.speakAs(line.voice, line.text)
      done++
      console.log(`  ${done}/${todo.length} [${line.voice}] ${line.text.slice(0, 70)}`)
    } catch (error) {
      console.log(`Stopped: ${error.message}`)
      console.log('Run this again later (for example after the credits reset) to record the rest.')
      process.exitCode = 1
      break
    }
  }
  console.log(`Recorded ${done} of ${todo.length}.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
