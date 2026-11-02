import { useEffect, useRef, useState } from 'react'
import TurnGuide from '../components/TurnGuide.jsx'
import { TreasureStep } from '../components/Treasure.jsx'
import { Button } from '../components/ui.jsx'
import { HERO_COLORS } from '../data/heroes.js'
import { firstRollShowing, waitingToRoll } from '../state/firstRoll.js'
import { openingPlaying } from '../state/opening.js'
import { rollD20 } from '../state/random.js'
import { useCards } from '../state/useCards.js'
import { serverNow } from '../state/useSharedGame.js'
import { activeAlly, allyStep, bonusAttack, offTurnMove } from './brain.js'
import { allyReaction } from './powers.js'
import { fanReaction } from './fanPowers.js'
import { teamReaction } from './boardPowers.js'
import { audioBusy } from '../audio/busy.js'
import { isReading } from '../components/CardReading.jsx'

// How long the ally waits between taps, so everyone can see what it did.
export const ALLY_STEP_MS = 2500
// Longer after a monster hits a player's hero, so they have time for a reaction power.
const REACTION_MS = 6000
// Taps in a row with nothing to do before the ally asks for a hand.
const STUCK_TICKS = 3
// The same button this many times in a row: it isn't getting anywhere.
const MAX_REPEATS = 8
// The ally waits for the sounds and the narrator on this screen to finish, but never longer than this.
const MAX_SOUND_WAIT_MS = 20000
// How often it checks whether they have.
const SOUND_CHECK_MS = 400

const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim()

// The turn screen's next button for the ally: the first gold or red button of the step
// (data-primary, see ui.jsx), or the pinned "On to…" button once the step is done. A
// question the board couldn't answer ("Yes…") is left for the players.
export function nextButton(root = document) {
  // A button the screen marks as the computer hero's own choice (Noble Shield) comes first.
  const pick = root.querySelector('[data-ally-scope] button[data-ally-pick]:not(:disabled)')
  if (pick) return { button: pick, label: label(pick) }
  // Never the party falling: a hero down in the middle of their turn just goes on.
  const buttons = [...root.querySelectorAll('[data-ally-scope] button[data-primary]:not(:disabled)')].filter((b) => !/No surges left/i.test(label(b)))
  const step = buttons.filter((b) => !b.closest('[data-turn-footer]'))
  const button = step[0] ?? buttons[0] ?? null
  if (!button) return { button: null }
  if (/^Yes\b/i.test(label(button))) return { button: null, question: true }
  return { button, label: label(button) }
}

// Plays the ally's turns on this screen (only one screen does: allyHostSeat). Each tick it
// asks the brain, or taps the turn screen's next button, then waits ALLY_STEP_MS.
export function useAllyDriver(state, dispatch, drive) {
  const { powers } = useCards()
  const latest = useRef({ state, dispatch, powers })
  latest.current = { state, dispatch, powers }
  const [say, setSay] = useState(null)
  const memory = useRef({ idle: 0, lastLabel: null, sameTaps: 0, lastState: null, attackSeen: null })

  useEffect(() => {
    if (!drive) return undefined
    let timer
    let stopped = false
    const tick = () => {
      if (stopped) return
      const wait = act()
      timer = setTimeout(tick, wait)
    }
    const helpWith = (reason) => {
      const { state: s, dispatch: send } = latest.current
      if (s.turn.allyHelp !== reason) send({ type: 'ALLY_HELP', reason })
    }
    const act = () => {
      const { state: s, dispatch: send, powers: cards } = latest.current
      const mem = memory.current
      if (s.status !== 'playing' || s.allyPaused || openingPlaying(s, serverNow())) return ALLY_STEP_MS
      // The roll for first turn: allies roll their own die.
      const toRoll = waitingToRoll(s.firstRoll).find((id) => s.heroes.find((h) => h.id === id)?.ally)
      if (toRoll) {
        send({ type: 'ROLL_FIRST', heroId: toRoll, value: rollD20() })
        return ALLY_STEP_MS
      }
      if (firstRollShowing(s, serverNow())) return ALLY_STEP_MS
      // A roar, a fanfare or the narrator still going: let it finish, then a short breath.
      // A hero reading a card out loud on any screen: wait for the whole card (a long one
      // takes half a minute; an old reading left by a closed screen stops counting).
      if (isReading(s)) {
        mem.afterSound = true
        return SOUND_CHECK_MS
      }
      if (audioBusy()) {
        mem.soundSince ??= Date.now()
        if (Date.now() - mem.soundSince < MAX_SOUND_WAIT_MS) {
          mem.afterSound = true
          return SOUND_CHECK_MS
        }
      } else mem.soundSince = null
      if (mem.afterSound) {
        mem.afterSound = false
        return ALLY_STEP_MS / 2
      }
      // An extra attack handed to an ally on anyone's turn (Cause Fear).
      const extra = (s.turn.bonusAttacks ?? []).map((b) => s.heroes.find((h) => h.id === b.heroId)).find((h) => h?.ally)
      const bonus = extra && bonusAttack(s, extra, rollD20)
      if (bonus) {
        setSay(bonus.say)
        send(bonus.action)
        return ALLY_STEP_MS
      }
      // A reaction or a hero card ability for a computer hero, on anyone's turn (Tumbling
      // Escape, Furious Assault, Healing Hands, Bravery, To Arms!, One for the Team...).
      const reaction = allyReaction(s, rollD20) ?? fanReaction(s, rollD20) ?? offTurnMove(s) ?? teamReaction(s)
      if (reaction) {
        setSay(reaction.say)
        send(reaction.action)
        return ALLY_STEP_MS
      }
      const hero = activeAlly(s)
      if (!hero) return ALLY_STEP_MS
      // A big moment on screen (a level up, a defeat): let it play first.
      if (s.moment && serverNow() - s.moment.at < 3000) return 800
      // A monster just hit a player's hero: give them time to use a reaction.
      const hit = s.turn.lastMonsterAttack
      if (hit && hit !== mem.attackSeen) {
        mem.attackSeen = hit
        if ((hit.results ?? []).some((r) => r.hit && !s.heroes.find((h) => h.id === r.heroId)?.ally)) return REACTION_MS
      }
      const step = allyStep(s, { powers: cards, roll: rollD20 })
      if (step) {
        mem.idle = 0
        if (s.turn.allyHelp) send({ type: 'ALLY_HELP', reason: null })
        setSay(step.say)
        send(step.action)
        return ALLY_STEP_MS
      }
      const { button, label: text, question } = nextButton()
      if (!button) {
        mem.idle += 1
        if (mem.idle >= STUCK_TICKS) helpWith(question ? `${hero.name} needs an answer to a question.` : `${hero.name} needs a hand with this step.`)
        return ALLY_STEP_MS
      }
      // The same button again and again with nothing changing: it isn't getting anywhere.
      // (Or the same button over and over even though something changes each time.)
      mem.sameTaps = text === mem.lastLabel && s === mem.lastState ? mem.sameTaps + 1 : 0
      mem.repeats = text === mem.lastLabel ? (mem.repeats ?? 0) + 1 : 0
      mem.lastLabel = text
      mem.lastState = s
      if (mem.sameTaps >= STUCK_TICKS || mem.repeats >= MAX_REPEATS) {
        helpWith(`${hero.name} needs a hand with this step.`)
        return ALLY_STEP_MS
      }
      mem.idle = 0
      if (s.turn.allyHelp) send({ type: 'ALLY_HELP', reason: null })
      setSay(text.replace(/^[^\p{L}\d]+/u, ''))
      button.click()
      return ALLY_STEP_MS
    }
    timer = setTimeout(tick, ALLY_STEP_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [drive])
  return say
}

// The pause switch for the computer allies, on any screen.
export function AllyPause({ state, dispatch, className = '' }) {
  return state.allyPaused ? (
    <Button variant="gold" className={className} onClick={() => dispatch({ type: 'ALLY_PAUSE', paused: false })}>
      ▶ Let the computer go on
    </Button>
  ) : (
    <Button className={className} onClick={() => dispatch({ type: 'ALLY_PAUSE', paused: true })}>
      ⏸ Pause the computer
    </Button>
  )
}

// The ally's turn: what it's doing, the pause switch, and the turn screen it taps through.
// `drive` is true on the one screen that plays the allies. `hidden` keeps the turn screen
// off to the side (the projector, which shows the board instead). `treasure` adds the
// treasure card the ally finds, for screens that don't show it already.
export default function AllyPanel({ state, dispatch, drive = false, hidden = false, treasure = false }) {
  const say = useAllyDriver(state, dispatch, drive)
  const hero = activeAlly(state)
  if (!hero) return null
  const color = HERO_COLORS[hero.color]
  const help = state.turn.allyHelp
  const turn = (
    <div data-ally-scope="">
      <TurnGuide state={state} dispatch={dispatch} />
      {treasure && <TreasureStep state={state} dispatch={dispatch} heroId={hero.id} />}
    </div>
  )
  if (hidden) {
    return (
      <div aria-hidden="true" style={{ position: 'fixed', left: -10000, top: 0, width: 420, pointerEvents: 'none' }}>
        {turn}
      </div>
    )
  }
  return (
    <>
      <section className="rounded-2xl border border-sky-800 bg-sky-950/60 p-3">
        <p className="font-semibold text-sky-200">
          🤖 The computer is playing <span className={color.text}>{hero.name}</span>
        </p>
        {help ? (
          <p className="mt-1 text-amber-300">✋ {help} Tap it for them below.</p>
        ) : state.allyPaused ? (
          <p className="mt-1 text-amber-300">Paused. Play {hero.name}'s turn by hand, or let the computer go on.</p>
        ) : (
          say && <p className="mt-1 text-zinc-300">{say}</p>
        )}
        <AllyPause state={state} dispatch={dispatch} className="mt-2 w-full" />
      </section>
      {turn}
    </>
  )
}
