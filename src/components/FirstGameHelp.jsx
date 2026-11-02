import { useEffect, useState } from 'react'
import { PHASE_HELP, phaseHelpLine, phaseHelper } from '../data/howToPlay.js'
import { useVoice } from '../audio/voiceContext.js'
import { unlockAudio } from '../audio/soundSetting.js'

// The first-game helper: at the start of each phase, the hero's coach says what to do in one
// plain sentence. On by itself for a hero whose player had never played (hero.newPlayer, set
// when they got ready in the lobby), and switched on or off for this screen with a tap.
const KEY = 'ashardalon-companion/first-game-help'

function readSetting() {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function writeSetting(value) {
  try {
    window.localStorage.setItem(KEY, value)
  } catch {
    // Storage blocked: the switch lasts until the page reloads.
  }
}

// [on, setOn] for this screen: 'on'/'off' once switched, else on for a new player's hero.
export function useFirstGameHelp(hero) {
  const [setting, setSetting] = useState(readSetting)
  const on = setting === 'on' || (setting !== 'off' && Boolean(hero?.newPlayer))
  const setOn = (value) => {
    const next = value ? 'on' : 'off'
    writeSetting(next)
    setSetting(next)
  }
  return [on, setOn]
}

const hearLine = (voice, hero, phaseKey) => {
  unlockAudio()
  voice?.say([phaseHelpLine(hero.key, phaseKey)], { force: true, replace: true })
}

// The coach's line for this phase, said once as the phase starts (where sound is on).
export function FirstGameHelp({ hero, phaseKey, stepKey, onHide }) {
  const voice = useVoice()
  const coach = phaseHelper(hero.key)
  useEffect(() => {
    if (voice?.available) voice.say([phaseHelpLine(hero.key, phaseKey)])
  }, [stepKey]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mt-3 rounded-xl border border-amber-800/70 bg-amber-950/40 px-3 py-2 text-amber-50" data-first-game-help="">
      <p>
        <span className="mr-1" aria-hidden>
          🎓
        </span>
        {coach && <span className="font-bold text-amber-300">{coach}: </span>}
        {PHASE_HELP[phaseKey]}
      </p>
      <div className="mt-1 flex justify-end gap-3 text-sm">
        {voice?.available && (
          <button type="button" className="py-1 text-amber-300 underline" onClick={() => hearLine(voice, hero, phaseKey)}>
            🔊 Again
          </button>
        )}
        <button type="button" className="py-1 text-zinc-400 underline" onClick={onHide}>
          Hide tips
        </button>
      </div>
    </div>
  )
}

// What a phase is, from a tap on its name at the top of the turn.
export function PhaseExplainer({ hero, phase, helping, onHelp, onClose }) {
  const voice = useVoice()
  return (
    <div className="mt-2 rounded-xl border border-amber-600 bg-zinc-950 px-3 py-2 text-zinc-100 shadow-xl" role="note">
      <p className="font-bold text-amber-300">
        {phase.emoji} {phase.title}
      </p>
      <p>{PHASE_HELP[phase.key]}</p>
      <div className="mt-1 flex flex-wrap justify-end gap-3 text-sm">
        {voice?.available && (
          <button type="button" className="py-1 text-amber-300 underline" onClick={() => hearLine(voice, hero, phase.key)}>
            🔊 Hear it
          </button>
        )}
        {!helping && (
          <button type="button" className="py-1 text-amber-300 underline" onClick={onHelp}>
            🎓 Tips every phase
          </button>
        )}
        <button type="button" className="py-1 text-zinc-400 underline" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
