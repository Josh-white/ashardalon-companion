import { useEffect, useState } from 'react'
import { heroArt } from '../data/art.js'
import { HERO_COLORS } from '../data/heroes.js'
import { FIRST_ROLL_SHOW_MS, firstRollShowing, waitingToRoll } from '../state/firstRoll.js'
import { rollD20 } from '../state/random.js'
import { serverNow } from '../state/useSharedGame.js'
import Art from './Art.jsx'
import Die3D from './Die3D.jsx'
import { Button } from './ui.jsx'

// A few words for your own roll, so a low one still gets a laugh.
function rollWords(value) {
  if (value === 20) return 'NATURAL 20! A legendary start!'
  if (value >= 15) return `You rolled ${value}. A mighty roll!`
  if (value >= 8) return `You rolled ${value}. Not bad, hero.`
  if (value === 1) return 'You rolled a 1… somewhere below, Ashardalon chuckles.'
  return `You rolled ${value}. The dragon isn't worried. Yet.`
}

// Keeps the screen up for the few seconds after the roll is decided, then lets it go.
function useShowing(state) {
  const [, tick] = useState(0)
  const showing = firstRollShowing(state, serverNow())
  const decidedAt = state.firstRoll?.decidedAt
  useEffect(() => {
    if (!decidedAt) return
    const left = decidedAt + FIRST_ROLL_SHOW_MS - serverNow()
    if (left <= 0) return
    const timer = setTimeout(() => tick((n) => n + 1), left + 50)
    return () => clearTimeout(timer)
  }, [decidedAt])
  return showing
}

function HeroRoll({ hero, roll, rolled, waiting, winner, big, onRoll }) {
  const color = HERO_COLORS[hero.color]
  return (
    <div className={`flex flex-col items-center gap-[0.3em] ${winner ? 'torch-arrive' : ''}`}>
      <Art name={heroArt(hero.key)} className={`${big ? 'w-[9vw]' : 'w-16'} ${winner ? 'ring-4 ring-amber-400' : ''}`} />
      <span className={`font-display font-bold ${color.text} ${big ? 'text-[2vw]' : 'text-lg'}`}>{hero.name}</span>
      <div className={big ? 'text-[3.5vw]' : 'text-[2.2rem]'}>
        {rolled ? (
          <Die3D value={roll} />
        ) : (
          <span className={`block h-[2.3em] w-[2.3em] ${waiting ? 'animate-pulse' : 'opacity-30'} flex items-center justify-center font-display text-[0.6em] text-zinc-500`}>
            ?
          </span>
        )}
      </div>
      {onRoll && waiting && (
        <Button variant="gold" className="text-sm" onClick={onRoll}>
          Roll for {hero.name}
        </Button>
      )}
    </div>
  )
}

// "Roll for First Turn": right after Enter the dungeon, everyone rolls a d20 and the
// highest roll takes the first turn. On a hero's iPad it's one big die to tap; the
// projector shows everyone's rolls; the table screen can roll for anyone.
export default function FirstRoll({ state, dispatch, heroId = null, big = false }) {
  const showing = useShowing(state)
  // Once "X goes first!" has had its few seconds, release the starting treasure.
  const held = Boolean(state.firstRoll?.winner && state.firstRoll.after)
  useEffect(() => {
    if (held && !showing) dispatch({ type: 'FIRST_ROLL_DONE' })
  }, [held, showing, dispatch])
  if (!showing) return null
  const roll = state.firstRoll
  const waiting = waitingToRoll(roll)
  const winner = state.heroes.find((h) => h.id === roll.winner)
  const me = state.heroes.find((h) => h.id === heroId)
  const myTurnToRoll = me && waiting.includes(me.id)
  const myRoll = me ? roll.rolls[me.id] : null
  const tiedNames = roll.tied ? roll.tied.heroIds.map((id) => state.heroes.find((h) => h.id === id)?.name).join(' and ') : null
  const rollFor = (id) => dispatch({ type: 'ROLL_FIRST', heroId: id, value: rollD20() })
  const skip = () => dispatch({ type: 'SKIP_FIRST_ROLL' })

  const banner = winner
    ? me?.id === winner.id
      ? 'You go first!'
      : `${winner.name} goes first!`
    : roll.tied
      ? `A tie on ${roll.tied.value}! ${tiedNames} roll again.`
      : 'Highest roll leads the party into the dungeon'

  return (
    <div className="fixed inset-0 z-[35] flex flex-col items-center justify-center gap-[3vh] overflow-y-auto bg-[radial-gradient(ellipse_at_50%_30%,#1e293b_0%,#0f172a_45%,#09090b_100%)] p-4 text-center text-zinc-100">
      <h2 className={`font-display font-black text-amber-400 drop-shadow-[0_0_20px_rgb(245_158_11/0.5)] ${big ? 'text-[5vw]' : 'text-4xl sm:text-5xl'}`}>Roll for First Turn</h2>
      <p className={`font-display ${winner ? 'font-bold text-amber-200' : 'text-zinc-300'} ${big ? 'text-[2.4vw]' : 'text-xl'}`}>{banner}</p>

      {me && !winner && (
        <div className="flex flex-col items-center gap-3">
          {myTurnToRoll ? (
            <button
              type="button"
              onClick={() => rollFor(me.id)}
              className="flex flex-col items-center gap-3 rounded-full p-6 transition active:scale-95"
              aria-label="Roll the d20"
            >
              <span className="flex h-48 w-48 animate-bounce items-center justify-center rounded-[30%] border-4 border-amber-300 bg-gradient-to-b from-red-700 to-red-900 font-display text-6xl font-black text-amber-100 shadow-[0_0_40px_rgb(245_158_11/0.5)]">
                d20
              </span>
              <span className="font-display text-2xl font-bold text-amber-300">Tap to roll</span>
            </button>
          ) : myRoll != null ? (
            <>
              <div className="text-[5rem]">
                <Die3D value={myRoll} />
              </div>
              <p className="max-w-md font-display text-2xl font-bold text-amber-100">{rollWords(myRoll)}</p>
              <p className="text-zinc-400">Waiting for {waiting.map((id) => state.heroes.find((h) => h.id === id)?.name).join(', ')} to roll…</p>
            </>
          ) : (
            <p className="text-zinc-400">{tiedNames ? `${tiedNames} are rolling again…` : 'Waiting for the others to roll…'}</p>
          )}
        </div>
      )}

      <div className={`grid w-full max-w-6xl gap-[2vw] ${big ? 'grid-cols-5' : 'grid-cols-3 sm:grid-cols-5'} ${me && !winner ? 'opacity-80' : ''}`}>
        {state.heroes.map((hero) => {
          const value = roll.rolls[hero.id] ?? (roll.tied?.heroIds.includes(hero.id) ? roll.tied.value : null)
          return (
            <HeroRoll
              key={hero.id}
              hero={hero}
              roll={value}
              rolled={value != null}
              waiting={waiting.includes(hero.id)}
              winner={winner?.id === hero.id}
              big={big}
              onRoll={!me && !big ? () => rollFor(hero.id) : null}
            />
          )
        })}
      </div>

      {!winner && !me && (
        <button type="button" className={`text-zinc-500 underline ${big ? 'text-[1.1vw]' : 'text-sm'}`} onClick={skip}>
          Skip the roll ({state.heroes[state.turn.heroIndex]?.name} goes first)
        </button>
      )}
    </div>
  )
}
