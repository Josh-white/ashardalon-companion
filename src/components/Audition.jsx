import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from './ui.jsx'

// The #audition page: every ElevenLabs sound with its takes, to listen to and pick the
// one the game plays. Takes are made on the Pi by server/generate-sounds.js.
export default function Audition() {
  const [sounds, setSounds] = useState(null)
  const [error, setError] = useState(null)
  const [playing, setPlaying] = useState(null) // url
  const player = useRef(null)

  const load = useCallback(() => {
    fetch('/sound-takes.json', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setSounds)
      .catch(() => setError("Couldn't load the list of takes from the Pi."))
  }, [])
  useEffect(load, [load])
  useEffect(() => () => player.current?.pause(), [])

  const play = (url, loop) => {
    const audio = player.current ?? (player.current = new Audio())
    if (playing === url) {
      audio.pause()
      setPlaying(null)
      return
    }
    audio.loop = loop
    audio.src = url
    audio.onended = () => setPlaying(null)
    audio.play().then(() => setPlaying(url), () => setPlaying(null))
  }

  const pick = async (name, take) => {
    const response = await fetch('/sound-takes/pick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, take }) })
    if (!response.ok) setError(`Couldn't use take ${take} of ${name}.`)
    load()
  }

  const groups = [...new Set((sounds ?? []).map((s) => s.group))]
  const made = (sounds ?? []).reduce((n, s) => n + s.takes.length, 0)

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 text-zinc-100">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-amber-400">Sound audition</h1>
        <p className="text-zinc-400">
          Tap a take to hear it, then <b>Use this</b> on your favourite. Screens pick up new sounds the next time they load.
        </p>
        {sounds && made === 0 && <p className="text-amber-300">No takes yet. Make them on the Pi with server/generate-sounds.js.</p>}
        {error && <p className="text-red-400">{error}</p>}
      </header>
      {groups.map((group) => (
        <section key={group} className="space-y-3">
          <h2 className="text-lg font-semibold text-zinc-300">{group}</h2>
          {sounds
            .filter((s) => s.group === group)
            .map((s) => (
              <div key={s.name} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-mono text-amber-300">{s.name}</span>
                  <span className="text-sm text-zinc-500">
                    {s.seconds}s{s.loop ? ' loop' : ''}
                  </span>
                  {s.picked === 'other' && <span className="text-sm text-zinc-400">(the game plays an older recording)</span>}
                </div>
                <p className="text-sm text-zinc-400">{s.prompt}</p>
                <div className="flex flex-wrap gap-2">
                  {s.takes.length === 0 && <span className="text-sm text-zinc-500">No takes yet.</span>}
                  {s.takes.map((take) => {
                    const url = `/sound-takes/${s.name}-${take}.mp3`
                    const chosen = s.picked === take
                    return (
                      <div key={take} className={`flex items-center gap-1 rounded-xl p-1 ${chosen ? 'bg-emerald-900/60 ring-1 ring-emerald-500' : 'bg-zinc-800/60'}`}>
                        <Button className="!px-3 !py-1" onClick={() => play(url, s.loop)}>
                          {playing === url ? '■' : '▶'} Take {take}
                        </Button>
                        {chosen ? (
                          <span className="px-2 text-sm text-emerald-300">In the game</span>
                        ) : (
                          <Button variant="ghost" className="!px-2 !py-1 text-sm" onClick={() => pick(s.name, take)}>
                            Use this
                          </Button>
                        )}
                      </div>
                    )
                  })}
                  {s.picked === 'other' && (
                    <Button variant="ghost" className="!px-3 !py-1 text-sm" onClick={() => play(`/sounds/${s.name}.mp3?v=${Date.now()}`, s.loop)}>
                      ▶ Current
                    </Button>
                  )}
                </div>
              </div>
            ))}
        </section>
      ))}
    </main>
  )
}
