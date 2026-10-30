import { useState } from 'react'
import { createPortal } from 'react-dom'

export function Button({ variant = 'default', className = '', ...props }) {
  const variants = {
    default: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700',
    gold: 'bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold',
    danger: 'bg-red-700 hover:bg-red-600 text-white',
    ghost: 'hover:bg-zinc-800 text-zinc-300',
  }
  return (
    <button
      type="button"
      // Marks the turn's main buttons, so the pinned "next step" button can find the one to do now.
      data-primary={variant === 'gold' || variant === 'danger' ? '' : undefined}
      className={`rounded-xl px-4 py-2 transition active:scale-95 disabled:opacity-40 disabled:active:scale-100 ${variants[variant]} ${className}`}
      {...props}
    />
  )
}

export function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-10 rounded-full px-3 py-1 text-sm transition ${
        active ? 'bg-amber-500 text-zinc-950 font-semibold' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
      }`}
    >
      {children}
    </button>
  )
}

export function HpBar({ hp, maxHp }) {
  const percent = maxHp === 0 ? 0 : (hp / maxHp) * 100
  const color = percent > 50 ? 'bg-emerald-500' : percent > 25 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-800">
      <div className={`h-full ${color} transition-all`} style={{ width: `${percent}%` }} />
    </div>
  )
}

// The app's own yes/no question, in place of the browser's confirm() box (which shows the
// Pi's address as its title and can't be styled). Call ask({ title, body, yes }, onYes) and
// put the returned dialog somewhere in the component's output (it renders on <body>, so a
// blurred or scaled parent can't trap it).
export function useConfirm() {
  const [question, setQuestion] = useState(null)
  const ask = (q, onYes) => setQuestion({ ...q, onYes })
  const answer = (yes) => {
    setQuestion(null)
    if (yes) question.onYes()
  }
  const dialog = question && createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/80 p-4" onClick={() => answer(false)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-sm rounded-2xl border border-amber-700/60 bg-zinc-900 p-5 text-left shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-title" className="font-display text-2xl font-bold text-amber-400">{question.title}</h2>
        {[].concat(question.body ?? []).map((line) => (
          <p key={line} className="mt-2 text-zinc-300">{line}</p>
        ))}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => answer(false)}>{question.no ?? 'Go back'}</Button>
          <Button variant={question.danger ? 'danger' : 'gold'} onClick={() => answer(true)} autoFocus>{question.yes ?? 'OK'}</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
  return [ask, dialog]
}
