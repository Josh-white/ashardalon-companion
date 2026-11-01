// The top bars of a game screen: the party bar (table and big screen) and the solo / hero
// iPad bar. Used by App.jsx.
import { useState } from 'react'
import { DifficultySwitch } from './Adventure.jsx'
import { AreaName } from './AreaBackdrop.jsx'
import { LOST_QUESTION, newGameQuestion } from './Recap.jsx'
import { TilesLeft } from './Tiles.jsx'
import UndoButton from './UndoButton.jsx'
import { MusicToggle, SoundToggle, StayAwakeToggle } from './SoundToggle.jsx'
import { BoardSwitch } from './SoundBoard.jsx'
import { Button, useConfirm } from './ui.jsx'

export function PartyBar({ state, dispatch, undo, undoDepth, seatLabel, onSwitchSeat, sound, boardSwitch }) {
  const [ask, dialog] = useConfirm()
  const newGame = () => ask(newGameQuestion(state), () => dispatch({ type: 'NEW_GAME' }))
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <h1 className="font-display text-xl font-bold text-amber-400">Wrath of Ashardalon</h1>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">XP</span>
          <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_XP', amount: -1 })}>−</Button>
          <span className="w-8 text-center text-2xl font-bold text-amber-400">{state.xp}</span>
          <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_XP', amount: 1 })}>+</Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">Healing surges</span>
          <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_SURGES', amount: -1 })}>−</Button>
          <span className={`text-2xl ${state.surges === 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {state.surges === 0 ? '0' : '❤'.repeat(state.surges)}
          </span>
          <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_SURGES', amount: 1 })}>+</Button>
        </div>
        {state.tileStack && (
          <div className="flex items-center gap-2">
            <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_TILES', amount: -1 })}>−</Button>
            <TilesLeft state={state} className="text-lg" />
            <Button className="!px-2 !py-0" onClick={() => dispatch({ type: 'ADJUST_TILES', amount: 1 })}>+</Button>
          </div>
        )}
        <AreaName state={state} className="font-semibold" />
        <div className="ml-auto flex flex-wrap gap-2">
          <UndoButton undo={undo} depth={undoDepth} dispatch={dispatch} className="max-w-56 truncate" />
          <SoundToggle on={sound.on} setOn={sound.setOn} elsewhere={sound.elsewhere} className="text-sm" />
          <MusicToggle on={sound.musicOn} setOn={sound.setMusicOn} soundOn={sound.on} className="text-sm" />
          <StayAwakeToggle className="text-sm" />
          {boardSwitch && <BoardSwitch state={state} dispatch={dispatch} className="text-sm" />}
          <DifficultySwitch state={state} dispatch={dispatch} className="text-sm" />
          <Button variant="ghost" className="text-sm" onClick={onSwitchSeat}>
            {seatLabel} · switch
          </Button>
          <Button variant="ghost" className="text-sm" onClick={() => dispatch({ type: 'END_GAME', result: 'won' })}>
            We won!
          </Button>
          <Button
            variant="ghost"
            className="text-sm"
            onClick={() => ask(LOST_QUESTION, () => dispatch({ type: 'END_GAME', result: 'lost' }))}
          >
            We lost
          </Button>
          <Button variant="ghost" className="text-sm" onClick={newGame}>
            New game
          </Button>
        </div>
      </div>
      {state.surges === 0 && (
        <p className="bg-red-950 px-4 py-1 text-center text-sm font-semibold text-red-300">
          No healing surges left! If a hero starts a turn at 0 HP, the party loses.
        </p>
      )}
      {dialog}
    </header>
  )
}

// The top bar on a hero's iPad and in a solo game: one short line on a phone (undo, XP, surges, tiles) and a ☰ menu
// with everything else, so the board and the turn get the screen.
export function SoloBar({ state, dispatch, undo, undoDepth, onSwitchSeat, sound, seatLabel = 'Table', boardSwitch = true }) {
  const [open, setOpen] = useState(false)
  const [ask, dialog] = useConfirm()
  const newGame = () => ask(newGameQuestion(state), () => dispatch({ type: 'NEW_GAME' }))
  const stepper = (label, type, value) => (
    <div className="flex items-center gap-2">
      <span className="w-28 text-zinc-400">{label}</span>
      <Button className="min-h-10 min-w-10 !px-3 !py-1" onClick={() => dispatch({ type, amount: -1 })}>−</Button>
      <span className="w-14 text-center text-lg font-bold text-amber-400">{value}</span>
      <Button className="min-h-10 min-w-10 !px-3 !py-1" onClick={() => dispatch({ type, amount: 1 })}>+</Button>
    </div>
  )
  return (
    <header className="relative z-50 shrink-0 border-b border-zinc-800 bg-zinc-950/95">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <UndoButton undo={undo} depth={undoDepth} dispatch={dispatch} className="min-w-0 flex-1 truncate !px-2 text-left" />
        <span className="whitespace-nowrap text-sm text-zinc-300">
          <b className="text-amber-400">{state.xp}</b> XP
        </span>
        <span className={`whitespace-nowrap text-sm ${state.surges === 0 ? 'text-red-400' : 'text-emerald-400'}`} title="Healing surges">
          {state.surges === 0 ? '0 ❤' : '❤'.repeat(state.surges)}
        </span>
        {state.tileStack && <TilesLeft state={state} className="whitespace-nowrap text-sm" />}
        <Button variant={open ? 'gold' : 'default'} className="min-h-10 min-w-10 !px-3 !py-1" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>
          ☰
        </Button>
      </div>
      {state.surges === 0 && (
        <p className="bg-red-950 px-3 py-0.5 text-center text-xs font-semibold text-red-300">No healing surges left! A hero starting a turn at 0 HP loses the game.</p>
      )}
      {open && (
        <div className="absolute inset-x-0 top-full max-h-[80dvh] space-y-3 overflow-y-auto border-b border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
          <AreaName state={state} className="font-semibold" />
          {stepper('XP', 'ADJUST_XP', state.xp)}
          {stepper('Healing surges', 'ADJUST_SURGES', state.surges)}
          {state.tileStack && stepper('Tiles left', 'ADJUST_TILES', state.tileStack.stack.length)}
          <div className="flex flex-wrap gap-2">
            <SoundToggle on={sound.on} setOn={sound.setOn} elsewhere={sound.elsewhere} className="text-sm" />
            <MusicToggle on={sound.musicOn} setOn={sound.setMusicOn} soundOn={sound.on} className="text-sm" />
            <StayAwakeToggle className="text-sm" />
            {boardSwitch && <BoardSwitch state={state} dispatch={dispatch} className="text-sm" />}
          </div>
          <DifficultySwitch state={state} dispatch={dispatch} place="inline" className="text-sm" />
          <div className="flex flex-wrap gap-2">
            <Button className="text-sm" onClick={() => dispatch({ type: 'END_GAME', result: 'won' })}>We won!</Button>
            <Button
              className="text-sm"
              onClick={() => ask(LOST_QUESTION, () => dispatch({ type: 'END_GAME', result: 'lost' }))}
            >
              We lost
            </Button>
            <Button className="text-sm" onClick={newGame}>New game</Button>
            <Button variant="ghost" className="text-sm" onClick={onSwitchSeat}>{seatLabel} · switch</Button>
          </div>
          <Button variant="gold" className="w-full" onClick={() => setOpen(false)}>Back to the game</Button>
        </div>
      )}
      {dialog}
    </header>
  )
}
