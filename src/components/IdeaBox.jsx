import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Chip, useConfirm } from './ui.jsx'
import { AdminLink } from './AdminLink.jsx'

// The ideas box. Players send ideas and feedback from the 💡 button on any screen; the Pi
// keeps them in ideas.json (server/ideas.js) and the #ideas page lists them for Dad to go
// through later. Nothing leaves the Pi.

const NAME_KEY = 'ashardalon-idea-from'
function rememberedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

// The players' names from this game, to tap instead of typing.
export function playerNames(state) {
  const names = [...(state?.heroes ?? []), ...(state?.lobby ?? [])].map((h) => (h.player ?? '').trim()).filter(Boolean)
  return [...new Set(names.map((n) => n.toLowerCase()))].map((lower) => names.find((n) => n.toLowerCase() === lower))
}

export async function sendIdea(text, from) {
  const res = await fetch('/ideas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, from }) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not send it.')
  return res.json()
}

export function IdeaButton({ state, me = '', className = '' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={`py-1.5 text-amber-300 ${className}`} onClick={() => setOpen(true)}>
        💡 Send an idea
      </button>
      {open && <IdeaDialog names={playerNames(state)} me={me} onClose={() => setOpen(false)} />}
    </>
  )
}

export function IdeaDialog({ names, me, onClose }) {
  const [text, setText] = useState('')
  const [from, setFrom] = useState(me || rememberedName())
  const [status, setStatus] = useState('writing') // writing | sending | sent | error message
  const send = async () => {
    setStatus('sending')
    try {
      await sendIdea(text, from)
      try {
        localStorage.setItem(NAME_KEY, from.trim())
      } catch {
        // Private mode; the name just isn't remembered.
      }
      setStatus('sent')
    } catch (error) {
      setStatus(error.message)
    }
  }
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-zinc-950/80 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="idea-title"
        className="w-full max-w-lg rounded-2xl border border-amber-700/60 bg-zinc-900 p-5 text-left shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {status === 'sent' ? (
          <div className="py-4 text-center">
            <p className="text-6xl">💡</p>
            <h2 id="idea-title" className="mt-2 font-display text-3xl font-bold text-amber-400">Idea saved!</h2>
            <p className="mt-2 text-lg text-zinc-300">Thanks{from.trim() ? `, ${from.trim()}` : ''}! Dad will look at it later.</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button
                onClick={() => {
                  setText('')
                  setStatus('writing')
                }}
              >
                Send another
              </Button>
              <Button variant="gold" onClick={onClose} autoFocus>
                Back to the game
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h2 id="idea-title" className="font-display text-3xl font-bold text-amber-400">💡 Send an idea</h2>
            <p className="mt-1 text-zinc-400">Something to add, something to fix, or something you love. Dad reads every one.</p>
            <textarea
              className="mt-3 h-36 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-lg text-zinc-100 placeholder:text-zinc-600"
              placeholder="My idea is…"
              value={text}
              maxLength={2000}
              onChange={(e) => setText(e.target.value)}
              autoFocus
            />
            <p className="mt-3 text-sm text-zinc-400">Who's sending it? (you can skip this)</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {names.map((name) => (
                <Chip key={name} active={from === name} onClick={() => setFrom(from === name ? '' : name)}>
                  {name}
                </Chip>
              ))}
              <input
                className="min-h-10 w-36 rounded-full border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600"
                placeholder="Your name"
                aria-label="Your name"
                value={from}
                maxLength={40}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            {status !== 'writing' && status !== 'sending' && <p className="mt-3 text-red-300">{status}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="gold" onClick={send} disabled={!text.trim() || status === 'sending'}>
                {status === 'sending' ? 'Sending…' : 'Send it'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

// The #ideas page: every idea sent, newest first, to mark done once it's been dealt with.
export default function IdeasPage() {
  const [ideas, setIdeas] = useState(null)
  const [showDone, setShowDone] = useState(false)
  const [error, setError] = useState(null)
  const [ask, dialog] = useConfirm()
  const load = () =>
    fetch('/ideas.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setIdeas(data.ideas))
      .catch(() => setError('Could not load the ideas.'))
  useEffect(() => {
    load()
  }, [])
  const change = async (id, init) => {
    const res = await fetch(`/ideas/${id}`, { headers: { 'Content-Type': 'application/json' }, ...init }).catch(() => null)
    if (!res?.ok) setError('Could not save that change.')
    load()
  }
  const open = ideas?.filter((i) => !i.done) ?? []
  const done = ideas?.filter((i) => i.done) ?? []
  const shown = showDone ? ideas ?? [] : open
  return (
    <main className="min-h-screen bg-zinc-950 p-4 text-zinc-100">
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto font-display text-3xl text-amber-400">💡 Ideas box</h1>
          <Chip active={!showDone} onClick={() => setShowDone(false)}>
            To look at ({open.length})
          </Chip>
          <Chip active={showDone} onClick={() => setShowDone(true)}>
            All ({open.length + done.length})
          </Chip>
          <AdminLink />
          <a href="/" className="text-sm text-amber-300 underline">
            Back to the game
          </a>
        </div>
        {error && <p className="mt-3 text-red-300">{error}</p>}
        {ideas === null ? (
          <p className="mt-6 text-zinc-400">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="mt-6 text-lg text-zinc-400">{ideas.length ? 'All caught up. ✓' : 'No ideas yet. They come from the 💡 Send an idea button.'}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {shown.map((idea) => (
              <li key={idea.id} className={`rounded-xl border p-4 ${idea.done ? 'border-zinc-800 bg-zinc-900/40 text-zinc-500' : 'border-zinc-700 bg-zinc-900'}`}>
                <p className={`whitespace-pre-wrap text-lg ${idea.done ? 'line-through' : ''}`}>{idea.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                  <span className="mr-auto">
                    {idea.from ? `From ${idea.from}` : 'No name'}{idea.email ? ` (friend: ${idea.email})` : ''} · {new Date(idea.sentAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <Button className="!py-1 text-sm" onClick={() => change(idea.id, { method: 'POST', body: JSON.stringify({ done: !idea.done }) })}>
                    {idea.done ? 'Not done' : '✓ Done'}
                  </Button>
                  {idea.done && (
                    <Button
                      variant="ghost"
                      className="!py-1 text-sm"
                      onClick={() => ask({ title: 'Delete this idea?', body: 'It goes for good.', yes: 'Delete', danger: true }, () => change(idea.id, { method: 'DELETE' }))}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {dialog}
    </main>
  )
}
