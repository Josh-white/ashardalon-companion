import { useEffect, useState } from 'react'

// How the Pi's auto-update is doing (scripts/auto-update.sh writes it, the Pi serves it at
// /auto-update.json, family only). The "Which game?" screen shows a warning when it's
// failing, and the 🛠 Admin page always shows the last result.

// The script runs every 5 minutes; this long without a run means cron stopped.
export const STALE_MINUTES = 30
export const LOG_COMMAND = 'tail -n 60 ~/ashardalon-backups/auto-update.log'

export function useAutoUpdate() {
  const [status, setStatus] = useState(null)
  useEffect(() => {
    let active = true
    fetch('/auto-update.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => active && setStatus(data))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  return status
}

const at = (time) => (time ? new Date(time).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'some time')

// What's wrong, or null when updates are fine (or this Pi doesn't auto-update, like the test copy).
export function autoUpdateProblem(status, now = Date.now()) {
  if (!status || status.none) return null
  if (status.ok === false) return { line: status.line, detail: status.detail, tried: status.tried, at: status.at }
  if (status.checkedAt && now - new Date(status.checkedAt).getTime() > STALE_MINUTES * 60 * 1000) {
    return { line: `The auto-update hasn't run since ${at(status.checkedAt)}. Is the Pi's cron line still there? (crontab -l)` }
  }
  return null
}

function Details({ problem }) {
  return (
    <>
      {problem.tried && <p className="text-sm text-zinc-400">Tried: {problem.tried}</p>}
      {problem.detail && (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-400">Why</summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-lg bg-zinc-950 p-2 text-xs text-zinc-300">{problem.detail}</pre>
        </details>
      )}
      <p className="text-sm text-zinc-400">
        Ask Claude to look, or SSH in and run <code className="text-zinc-200">{LOG_COMMAND}</code>
      </p>
    </>
  )
}

// The warning on "Which game?". Nothing at all while updates are working.
export function AutoUpdateWarning({ status: given }) {
  const fetched = useAutoUpdate()
  const problem = autoUpdateProblem(given ?? fetched)
  if (!problem) return null
  return (
    <section role="alert" className="space-y-1 rounded-2xl bg-red-950/60 p-4 ring-1 ring-red-700">
      <h2 className="font-semibold text-red-300">⚠ The game isn't updating{problem.at ? ` (${at(problem.at)})` : ''}</h2>
      <p className="text-zinc-200">{problem.line}</p>
      <Details problem={problem} />
    </section>
  )
}

// The Admin page's card: the last result either way.
export function AutoUpdateCard() {
  const status = useAutoUpdate()
  if (!status) return null
  if (status.none) {
    return <p className="mt-6 rounded-2xl bg-zinc-900 p-4 text-zinc-400 ring-1 ring-zinc-800">🔄 Auto-update hasn't run on this Pi (scripts/auto-update.sh).</p>
  }
  const problem = autoUpdateProblem(status)
  return (
    <section className={`mt-6 space-y-1 rounded-2xl bg-zinc-900 p-4 ring-1 ${problem ? 'ring-red-700' : 'ring-emerald-700'}`}>
      <h2 className="text-xl font-semibold text-amber-300">🔄 Auto-update</h2>
      {problem ? <p className="text-red-300">⚠ {problem.line}</p> : <p className="text-emerald-300">✓ {status.line ?? 'Up to date.'}</p>}
      <p className="text-xs text-zinc-500">
        {status.at && `Last update ${at(status.at)}`}
        {status.running && ` · running ${status.running}`}
        {status.checkedAt && ` · last checked ${at(status.checkedAt)}`}
      </p>
      {problem && <Details problem={problem} />}
    </section>
  )
}
