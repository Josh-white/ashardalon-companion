import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, Chip, useConfirm } from './ui.jsx'
import { playerNames } from './IdeaBox.jsx'
import { ATTACKS, COLORS, HOLDS, KINDS, MAX_COLORS, SIZES, lovedRound, STATUS_TEXT, workshopStatus } from '../data/workshop.js'

// The 🎨 Tweak panel brings three.js with it, so it loads only when opened.
const WorkshopTweaker = lazy(() => import('./WorkshopTweaker.jsx'))

// The 🧙 Model Workshop: a player describes their own 3D figure, Claude builds it and
// sends pictures back here, and the player taps "Love it" or asks for changes. The Pi
// keeps it all in cards/workshop (server/workshop.js). Opens from the 🧙 button on the
// game bar, or as its own page at #workshop.

const NAME_KEY = 'ashardalon-idea-from' // the same remembered name as the 💡 ideas box

function rememberedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

export async function loadWorkshop() {
  const res = await fetch('/workshop.json', { cache: 'no-store' })
  if (!res.ok) throw new Error('Could not open the workshop.')
  return (await res.json()).requests
}

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not send it.')
  return res.json()
}

// The workshop's list, loaded now and again every `every` ms while it's showing.
function useWorkshop(every) {
  const [requests, setRequests] = useState(null)
  const [removed, setRemoved] = useState([])
  const [error, setError] = useState(null)
  const reload = useCallback(
    () =>
      loadWorkshop().then(
        (r) => {
          setRequests(r.filter((x) => !x.hidden))
          setRemoved(r.filter((x) => x.hidden))
          setError(null)
        },
        (e) => setError(e.message),
      ),
    [],
  )
  useEffect(() => {
    reload()
    if (!every) return undefined
    const timer = setInterval(reload, every)
    return () => clearInterval(timer)
  }, [reload, every])
  return { requests, removed, error, reload }
}

// The 🧙 pill on the game bar. It says "📸 Pictures!" when Claude has sent new ones.
export function WorkshopButton({ state, me = '', className = '' }) {
  const [open, setOpen] = useState(false)
  const { requests } = useWorkshop(60000)
  const newPictures = (requests ?? []).some((r) => workshopStatus(r) === 'look')
  return (
    <>
      <button type="button" className={`py-1.5 text-violet-200 ${newPictures ? 'animate-pulse bg-violet-500/40' : 'bg-violet-500/15'} ${className}`} onClick={() => setOpen(true)}>
        {newPictures ? '🧙 📸 Pictures!' : '🧙 My model'}
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[70] overflow-y-auto bg-zinc-950/95 p-3 sm:p-6">
            <Workshop names={playerNames(state)} me={me} onClose={() => setOpen(false)} />
          </div>,
          document.body,
        )}
    </>
  )
}

export function Workshop({ names = [], me = '', onClose = null }) {
  const { requests, removed, error, reload } = useWorkshop(20000)
  const [tab, setTab] = useState(null) // null until loaded: then the list if there is one, else the form
  const shownTab = tab ?? (requests?.length ? 'mine' : requests ? 'new' : null)
  return (
    <div className="mx-auto max-w-3xl text-left text-zinc-100">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto font-display text-3xl font-bold text-violet-300 sm:text-4xl">🧙 Model Workshop</h1>
        {onClose ? (
          <Button onClick={onClose}>Back to the game</Button>
        ) : (
          <a href="/" className="text-sm text-amber-300 underline">
            Back to the game
          </a>
        )}
      </div>
      <p className="mt-1 text-zinc-400">Dream up your own 3D figure. Claude builds it and sends pictures here for you to check.</p>
      <a href="/#builder" className="mt-2 inline-block rounded-xl bg-amber-500/15 px-3 py-2 text-amber-200 underline-offset-2 hover:underline">
        🛠️ Or build one yourself right now in the Hero Builder
      </a>
      <div className="mt-3 flex gap-2">
        <Chip active={shownTab === 'new'} onClick={() => setTab('new')}>
          ✏️ Make a new one
        </Chip>
        <Chip active={shownTab === 'mine'} onClick={() => setTab('mine')}>
          📦 Models{requests?.length ? ` (${requests.length})` : ''}
        </Chip>
      </div>
      {error && <p className="mt-3 text-red-300">{error}</p>}
      {shownTab === 'new' && (
        <RequestForm
          names={names}
          me={me}
          onSent={() => {
            // Stay on the "Sent!" note: the first model would otherwise flip the workshop to the list.
            setTab('new')
            reload()
          }}
          onSeeList={() => setTab('mine')}
        />
      )}
      {shownTab === 'mine' && (
        <>
          <RequestList requests={requests ?? []} reload={reload} onNew={() => setTab('new')} />
          <RemovedList removed={removed} reload={reload} />
        </>
      )}
      {shownTab === null && <p className="mt-6 text-zinc-400">Opening the workshop…</p>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="mt-5">
      <h2 className="text-lg font-semibold text-zinc-200">{title}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">{children}</div>
    </section>
  )
}

const empty = { idea: '', kind: 'hero', colors: [], size: null, holds: '', attack: null }

export function RequestForm({ names, me, onSent, onSeeList }) {
  const [form, setForm] = useState(empty)
  const [from, setFrom] = useState(me || rememberedName())
  const [status, setStatus] = useState('writing') // writing | sending | sent | error message
  const set = (change) => setForm((f) => ({ ...f, ...change }))
  const toggleColor = (key) =>
    set({ colors: form.colors.includes(key) ? form.colors.filter((c) => c !== key) : [...form.colors, key].slice(-MAX_COLORS) })
  const send = async () => {
    setStatus('sending')
    try {
      await post('/workshop', { ...form, from })
      try {
        localStorage.setItem(NAME_KEY, from.trim())
      } catch {
        // Private mode; the name just isn't remembered.
      }
      setStatus('sent')
      onSent?.()
    } catch (error) {
      setStatus(error.message)
    }
  }
  if (status === 'sent') {
    return (
      <div className="mt-6 rounded-2xl border border-violet-700/60 bg-zinc-900 p-6 text-center">
        <p className="text-6xl">✅</p>
        <h2 className="mt-2 font-display text-3xl font-bold text-violet-300">Your model was sent!</h2>
        <p className="mt-3 text-lg text-zinc-200">Building a 3D model takes time, so it won't be ready right away. It can take a day or two.</p>
        <p className="mt-2 text-lg text-zinc-300">
          You can keep playing. When the pictures are ready, the 🧙 button at the top turns into <span className="font-semibold text-violet-200">📸 Pictures!</span>
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button
            onClick={() => {
              setForm(empty)
              setStatus('writing')
            }}
          >
            Make another
          </Button>
          <Button variant="gold" onClick={onSeeList}>
            See my models
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="mt-2">
      <Section title="Who's it for?">
        {names.map((name) => (
          <Chip key={name} active={from === name} onClick={() => setFrom(name)}>
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
      </Section>
      <Section title="What is it?">
        {KINDS.map((k) => (
          <Chip key={k.key} active={form.kind === k.key} onClick={() => set({ kind: k.key })}>
            {k.label}
          </Chip>
        ))}
      </Section>
      <section className="mt-5">
        <h2 className="text-lg font-semibold text-zinc-200">Describe it</h2>
        <textarea
          className="mt-2 h-32 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-lg text-zinc-100 placeholder:text-zinc-600"
          placeholder="A lava knight with a flaming axe and horns on his helmet…"
          aria-label="Describe it"
          value={form.idea}
          maxLength={1000}
          onChange={(e) => set({ idea: e.target.value })}
        />
      </section>
      <Section title={`Colors (pick up to ${MAX_COLORS})`}>
        {COLORS.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-label={c.key}
            aria-pressed={form.colors.includes(c.key)}
            onClick={() => toggleColor(c.key)}
            className={`h-11 w-11 rounded-full border-2 transition active:scale-95 ${form.colors.includes(c.key) ? 'scale-110 border-white ring-2 ring-violet-400' : 'border-zinc-700'}`}
            style={{ background: c.hex }}
          />
        ))}
      </Section>
      <Section title="How big?">
        {SIZES.map((s) => (
          <Chip key={s.key} active={form.size === s.key} onClick={() => set({ size: form.size === s.key ? null : s.key })}>
            {s.label}
          </Chip>
        ))}
      </Section>
      <Section title="What does it hold?">
        {HOLDS.map((h) => (
          <Chip key={h} active={form.holds === h} onClick={() => set({ holds: form.holds === h ? '' : h })}>
            {h}
          </Chip>
        ))}
        <input
          className="min-h-10 w-40 rounded-full border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600"
          placeholder="Something else"
          aria-label="Something else it holds"
          value={HOLDS.includes(form.holds) ? '' : form.holds}
          maxLength={40}
          onChange={(e) => set({ holds: e.target.value })}
        />
      </Section>
      <Section title="How does it attack?">
        {ATTACKS.map((a) => (
          <Chip key={a.key} active={form.attack === a.key} onClick={() => set({ attack: form.attack === a.key ? null : a.key })}>
            {a.label}
          </Chip>
        ))}
      </Section>
      {status !== 'writing' && status !== 'sending' && <p className="mt-4 text-red-300">{status}</p>}
      <div className="mt-6 flex items-center justify-end gap-3">
        {!from.trim() && form.idea.trim() && <span className="text-sm text-zinc-400">Put your name first.</span>}
        <Button variant="gold" className="text-lg" onClick={send} disabled={!form.idea.trim() || !from.trim() || status === 'sending'}>
          {status === 'sending' ? 'Sending…' : '🧙 Send to Claude'}
        </Button>
      </div>
    </div>
  )
}

// The bits a player picked, in one line: "Monster · red, gold · Big · holds Axe · Breathes fire".
export function pickedLine(r) {
  return [
    KINDS.find((k) => k.key === r.kind)?.label.replace(/^\S+\s/, ''),
    r.colors?.length ? r.colors.join(', ') : null,
    SIZES.find((s) => s.key === r.size)?.label,
    r.holds ? `holds ${r.holds}` : null,
    ATTACKS.find((a) => a.key === r.attack)?.label.replace(/^\S+\s/, ''),
  ]
    .filter(Boolean)
    .join(' · ')
}

// Models taken off the list, to bring back (tweaks, love and all).
function RemovedList({ removed, reload }) {
  const [open, setOpen] = useState(false)
  if (!removed.length) return null
  return (
    <div className="mt-6">
      <button type="button" className="text-sm text-zinc-400 underline" onClick={() => setOpen(!open)}>
        ♻️ Taken off the list ({removed.length})
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {removed.map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
              <span className="mr-auto text-zinc-300">
                {r.from ? `${r.from}: ` : ''}
                {r.idea.length > 60 ? `${r.idea.slice(0, 60)}…` : r.idea}
              </span>
              <Button
                onClick={async () => {
                  await post(`/workshop/${r.id}`, { hidden: false }).catch(() => null)
                  reload()
                }}
              >
                Bring it back
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RequestList({ requests, reload, onNew }) {
  const [ask, dialog] = useConfirm()
  if (!requests.length) {
    return (
      <div className="mt-6 text-center text-lg text-zinc-400">
        <p>No models yet.</p>
        <Button variant="gold" className="mt-3" onClick={onNew}>
          ✏️ Make one
        </Button>
      </div>
    )
  }
  return (
    <ul className="mt-4 space-y-4">
      {requests.map((r) => (
        <RequestCard
          key={r.id}
          request={r}
          reload={reload}
          onDelete={() =>
            ask({ title: 'Take this model off the list?', body: 'You can bring it back later from ♻️ Taken off the list, at the bottom.', yes: 'Take it off', danger: true }, async () => {
              await fetch(`/workshop/${r.id}`, { method: 'DELETE' }).catch(() => null)
              reload()
            })
          }
        />
      ))}
      {dialog}
    </ul>
  )
}

// A loved model goes on the player's hero: whenever someone plays with the name on the
// request, their hero is this figure on the 3D board (src/components/Board3D.jsx).
function UseInGame({ request: r, on, answer }) {
  const name = r.from
  return (
    <div className={`mt-4 rounded-2xl border p-4 ${on ? 'border-emerald-500 bg-emerald-950/40' : 'border-amber-500 bg-amber-950/30'}`}>
      <p className="text-lg font-semibold">🎮 Use it in the game</p>
      {name ? (
        <>
          <ol className="mt-2 list-decimal space-y-1 pl-6 text-zinc-200">
            <li>
              Turn it on here{on ? ' (it is on!)' : ''}.
            </li>
            <li>
              Type your name as <b>{name}</b> when you pick your hero (on the solo screen, in the Who's playing? box).
            </li>
            <li>On the 3D board your hero is this figure, with your 🎨 tweaks. Any hero you pick wears it (in a solo game, your first hero).</li>
            <li>
              Seeing a flat board? Tap <b>🧊</b>. Seeing cards instead of figures? Tap <b>🪪 Figures</b> so it says <b>🧍 Figures: 3D</b>.
            </li>
          </ol>
          <div className="mt-3 flex justify-end">
            <Button variant={on ? 'ghost' : 'gold'} className="text-lg" onClick={() => answer({ useInGame: !on })}>
              {on ? 'Stop using it' : `🎮 Use it as ${name}'s hero`}
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-zinc-300">This model has no name on it, so the game can't tell whose hero should wear it. Send it again with your name.</p>
      )}
    </div>
  )
}

function RequestCard({ request: r, reload, onDelete }) {
  const status = workshopStatus(r)
  const [changing, setChanging] = useState(false)
  const [change, setChange] = useState('')
  const [error, setError] = useState(null)
  const [big, setBig] = useState(null)
  const [showOld, setShowOld] = useState(false)
  const [tweaking, setTweaking] = useState(false)
  const latest = r.rounds?.at(-1)
  const answer = async (body) => {
    setError(null)
    try {
      await post(`/workshop/${r.id}`, body)
      setChanging(false)
      setChange('')
      reload()
    } catch (e) {
      setError(e.message)
    }
  }
  const picture = (round, name) => (
    <button key={name} type="button" onClick={() => setBig(`/workshop/${r.id}/${name}`)} className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950">
      <img src={`/workshop/${r.id}/${name}?r=${round}`} alt={`${r.from ?? 'Your'} model, ${name.replace(/\.\w+$/, '')}`} className="aspect-square w-full object-contain" />
    </button>
  )
  return (
    <li data-request={r.id} className={`rounded-2xl border p-4 ${status === 'look' ? 'border-violet-400 bg-violet-950/40' : 'border-zinc-700 bg-zinc-900'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-zinc-800 px-3 py-1 text-sm font-semibold">{STATUS_TEXT[status].badge}</span>
        <span className="mr-auto text-sm text-zinc-400">
          {r.from ? `${r.from}'s` : 'A'} model · {new Date(r.sentAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </span>
        <button type="button" className="text-sm text-zinc-500 underline" onClick={onDelete}>
          Take off list
        </button>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-lg">{r.idea}</p>
      {pickedLine(r) && <p className="mt-1 text-sm text-zinc-400">{pickedLine(r)}</p>}
      <p className="mt-3 text-violet-200">{STATUS_TEXT[status].line}</p>
      {latest && (
        <div className="mt-3">
          {latest.note && <p className="rounded-xl bg-zinc-800/70 p-3 text-zinc-200">🧙 {latest.note}</p>}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{latest.pictures.map((p) => picture(r.rounds.length, p))}</div>
        </div>
      )}
      {latest?.model && !tweaking && (
        <div className="mt-3">
          <Button onClick={() => setTweaking(true)}>🎨 Tweak it yourself{r.tweaks ? ' (saved)' : ''}</Button>
        </div>
      )}
      {tweaking && latest?.model && (
        <Suspense fallback={<p className="mt-3 text-zinc-400">Opening the tweak panel…</p>}>
          <WorkshopTweaker request={r} model={latest.model} onSaved={reload} />
          <button type="button" className="mt-2 text-sm text-zinc-400 underline" onClick={() => setTweaking(false)}>
            Close the tweak panel
          </button>
        </Suspense>
      )}
      {(status === 'loved' || status === 'inGame') && lovedRound(r)?.model && <UseInGame request={r} on={status === 'inGame'} answer={answer} />}
      {status === 'look' && !changing && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button onClick={() => setChanging(true)}>✏️ Change it</Button>
          <Button variant="gold" className="text-lg" onClick={() => answer({ love: true })}>
            ❤️ Love it!
          </Button>
        </div>
      )}
      {changing && (
        <div className="mt-4">
          <textarea
            className="h-24 w-full rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-lg text-zinc-100 placeholder:text-zinc-600"
            placeholder="Make the axe bigger and the horns red…"
            aria-label="What should change?"
            value={change}
            maxLength={1000}
            onChange={(e) => setChange(e.target.value)}
            autoFocus
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setChanging(false)}>
              Cancel
            </Button>
            <Button variant="gold" disabled={!change.trim()} onClick={() => answer({ change })}>
              Send changes
            </Button>
          </div>
        </div>
      )}
      {(r.answers ?? []).some((a) => a.change) && (
        <div className="mt-3 text-sm text-zinc-400">
          {r.answers.filter((a) => a.change).map((a) => (
            <p key={a.round}>
              ✏️ After pictures {a.round}: “{a.change}”
            </p>
          ))}
        </div>
      )}
      {r.rounds?.length > 1 && (
        <div className="mt-3">
          <button type="button" className="text-sm text-violet-300 underline" onClick={() => setShowOld(!showOld)}>
            {showOld ? 'Hide' : 'Show'} earlier pictures ({r.rounds.length - 1})
          </button>
          {showOld &&
            r.rounds.slice(0, -1).map((round, n) => (
              <div key={n} className="mt-2 grid grid-cols-3 gap-2 opacity-80 sm:grid-cols-4">
                {round.pictures.map((p) => picture(n + 1, p))}
              </div>
            ))}
        </div>
      )}
      {error && <p className="mt-2 text-red-300">{error}</p>}
      {big &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4" onClick={() => setBig(null)}>
            <img src={big} alt="Your model, big" className="max-h-full max-w-full rounded-xl" />
          </div>,
          document.body,
        )}
    </li>
  )
}

// The #workshop page: the same workshop, on its own.
export default function WorkshopPage() {
  return (
    <main className="min-h-screen bg-zinc-950 p-4">
      <Workshop />
    </main>
  )
}
