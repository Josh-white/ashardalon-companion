// Flags tests that would be too slow on the Raspberry Pi, from a vitest JSON report.
//
//   npm test -- --reporter=default --reporter=json --outputFile=test-times.json
//   node scripts/check-slow-tests.mjs test-times.json
//
// The Pi runs every test in its Docker build before each update, and a test that runs out
// of time there rolls the update back, even though it passed here. The Pi takes about
// 5-7 times as long as GitHub's machines (a 1 s test here took 6.7 s there), and each test
// gets 30 s (vite.config.js). So:
//   - over WARN_MS here: a yellow warning on the pull request (about 6 s or more on the Pi)
//   - over FAIL_MS here: the check fails (about 25 s on the Pi, too close to its 30 s)
// A test file that takes very long as a whole is also named, since the Pi's build waits
// for the slowest file.
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import process from 'node:process'
import console from 'node:console'

const WARN_MS = 1000
const FAIL_MS = 4000
const FILE_WARN_MS = 3000
const PI_FACTOR = 6

const file = process.argv[2] ?? 'test-times.json'
const report = JSON.parse(readFileSync(file, 'utf8'))
const gh = Boolean(process.env.GITHUB_ACTIONS)
const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`
const pi = (ms) => `about ${seconds(ms * PI_FACTOR)} on the Pi`

const tests = []
const files = []
for (const result of report.testResults ?? []) {
  const name = relative(process.cwd(), result.name)
  files.push({ name, ms: result.endTime - result.startTime })
  for (const a of result.assertionResults ?? []) {
    tests.push({ name, title: a.fullName ?? a.title, ms: a.duration ?? 0, line: a.location?.line })
  }
}
tests.sort((a, b) => b.ms - a.ms)
files.sort((a, b) => b.ms - a.ms)

console.log('Slowest tests:')
for (const t of tests.slice(0, 10)) console.log(`  ${seconds(t.ms).padStart(6)}  ${t.name} > ${t.title}`)
console.log('Slowest files:')
for (const f of files.slice(0, 5)) console.log(`  ${seconds(f.ms).padStart(6)}  ${f.name}`)

const annotate = (level, t, text) => {
  if (gh) console.log(`::${level} file=${t.name}${t.line ? `,line=${t.line}` : ''},title=Slow on the Pi::${text}`)
}
let failed = 0
for (const t of tests) {
  if (t.ms <= WARN_MS) break
  const text = `"${t.title}" took ${seconds(t.ms)}, ${pi(t.ms)}.`
  if (t.ms > FAIL_MS) {
    failed++
    console.log(`TOO SLOW: ${t.name}: ${text} Make it lighter or split it up.`)
    annotate('error', t, `${text} Each test gets 30 s on the Pi, so make it lighter or split it up.`)
  } else {
    console.log(`Slow: ${t.name}: ${text}`)
    annotate('warning', t, `${text} Fine for now, but keep an eye on it.`)
  }
}
for (const f of files) {
  if (f.ms <= FILE_WARN_MS) break
  console.log(`Slow file: ${f.name} took ${seconds(f.ms)}, ${pi(f.ms)}.`)
  annotate('warning', f, `This file took ${seconds(f.ms)}, ${pi(f.ms)}.`)
}
if (failed) {
  console.log(`${failed} test(s) would come too close to the Pi's 30 s limit.`)
  process.exit(1)
}
console.log('No test is close to the Pi\'s time limit.')
