// Turns a robot run (vitest's JSON report, and the robot's own lines from its output) into
// the short summary scripts/nightly-robot.sh saves as cards/robot-check.json for the
// 🛠 Admin page: how many games passed, the ones that didn't and why, and how the
// computer heroes did.
//   node scripts/robot-summary.mjs result.json robot.log
import { readFileSync } from 'node:fs'
import process from 'node:process'

const [reportFile, logFile] = process.argv.slice(2)
const read = (file) => {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}
let report = {}
try {
  report = JSON.parse(read(reportFile))
} catch {
  report = {}
}
const tests = (report.testResults ?? []).flatMap((file) => file.assertionResults ?? [])
const failed = tests.filter((t) => t.status === 'failed')
const games = read(logFile)
  .split('\n')
  .filter((l) => /^(Robot .*game \d+|Ally game \d+|Computer heroes won)/.test(l))
  .map((l) => l.trim())
const wins = games.find((l) => l.startsWith('Computer heroes won')) ?? null
const passed = tests.length - failed.length
const summary = {
  ok: tests.length > 0 && failed.length === 0,
  passed,
  failed: failed.length,
  line: tests.length === 0 ? 'no games ran' : `${passed} of ${tests.length} games played through${failed.length ? `, ${failed.length} got stuck or crashed` : ''}${wins ? `. ${wins.replace(/ \(.*$/, '')}` : ''}.`,
  failures: failed.map((t) => ({ name: t.title ?? t.fullName, why: String(t.failureMessages?.[0] ?? '').split('\n')[0].slice(0, 400) })),
  wins,
  games,
}
process.stdout.write(`${JSON.stringify(summary)}\n`)
