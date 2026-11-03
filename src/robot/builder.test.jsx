// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { Component, Suspense } from 'react'
import { createServer } from 'node:http'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createForge } from '../../server/forge.js'
import { createWorkshop } from '../../server/workshop.js'
import { STARTERS } from '../forge/recipes.js'
import { FakeWebGLRenderer, fileResponse, installFake3D, renderers } from './fake3d.js'

// The robot in the 🛠️ Hero Builder (#builder) and 🎮 My models (#mine): it taps parts, tabs and
// moves, drags every kind of slider, paints, types names (empty ones, long ones, emoji),
// saves, opens, throws away and turns figures on for the game, then goes to My models and picks
// figures there, all at random, against the Pi's own Hero Builder and Model Workshop code
// (server/forge.js, server/workshop.js) running in the test on a folder of its own. Every
// figure is built for real with three.js (src/forge), on fake3d.js's stand-in for WebGL.
//
// It looks for a screen that crashes, a figure that won't build (the turntable or a picture
// giving up), a save the Pi refuses, and a player left with two figures on, or none picked.
//   BUILDER_SEED=5 BUILDER_RUNS=1 npx vitest run src/robot/builder.test.jsx
//   BUILDER_RUNS=20 BUILDER_TAPS=400 npx vitest run src/robot/builder.test.jsx

const RUNS = Number(process.env.BUILDER_RUNS) || 4
const TAPS = Number(process.env.BUILDER_TAPS) || 150
// Taps on My models after each Hero Builder visit.
const MINE_TAPS = 25
const FIRST_SEED = Number(process.env.BUILDER_SEED) || 1

vi.mock('three', async (importOriginal) => ({ ...(await importOriginal()), WebGLRenderer: FakeWebGLRenderer }))

function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
let random = seeded(FIRST_SEED)
const pick = (list) => list[Math.floor(random() * list.length)]

// --- The Pi: its Hero Builder and Model Workshop, on a folder of the test's own --------------

const pi = { server: null, url: '', dir: '', busy: 0, refused: [] }
// Names the robot types: the boys', the same name in other capitals and spaces (one player),
// nothing at all, emoji, and too long for the box.
const NAMES = ['Colton', ' colton ', 'EASTON', 'Easton', '', '🐉 Dragon Lord', 'Dad', 'x'.repeat(60), 'Zed the Very Long Named Hero of the Deep Halls']

function startPi() {
  pi.dir = mkdtempSync(join(tmpdir(), 'robot-builder-'))
  // One loved Model Workshop model for Colton, already in the game, with its picture and 3D file.
  const id = '2026-11-03-colton-lava-knight-1a2b'
  mkdirSync(join(pi.dir, id), { recursive: true })
  copyFileSync(join(import.meta.dirname, '..', 'models', 'Hero_Quinn.glb'), join(pi.dir, id, 'model-1.glb'))
  writeFileSync(join(pi.dir, id, 'front.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'))
  writeFileSync(join(pi.dir, id, 'reply.json'), JSON.stringify({ rounds: [{ note: 'Here it is', pictures: ['front.png'], model: 'model-1.glb', at: '2026-11-03T10:00:00Z' }] }))
  writeFileSync(join(pi.dir, 'requests.json'), JSON.stringify({ requests: [{ id, idea: 'A lava knight', from: 'Colton', kind: 'hero', colors: [], size: 'normal', holds: 'Sword', attack: 'Swing', sentAt: '2026-11-03T09:00:00Z', answers: [{ round: 1, love: true }], useInGame: true }] }))
  // The Pi turns a player's other figure off when they turn one on (server/server.js).
  let workshop = null
  const forge = createForge(pi.dir, { onUse: (key) => workshop.stopUsing(key) })
  workshop = createWorkshop(pi.dir, { onUse: (key) => forge.stopUsing(key) })
  pi.server = createServer((req, res) => {
    if (forge.handle(req, res) || workshop.handle(req, res)) return
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end('{"error":"not here"}')
  })
  return new Promise((resolve) => {
    pi.server.listen(0, '127.0.0.1', () => {
      pi.url = `http://127.0.0.1:${pi.server.address().port}`
      resolve()
    })
  })
}

// The screens' fetch: the Hero Builder and the workshop go to the Pi, 3D files to fake3d.js.
function installFetch() {
  const realFetch = globalThis.fetch
  vi.stubGlobal('fetch', async (url, init = {}) => {
    const path = String(url?.url ?? url)
    if (/^\/(forge|workshop)/.test(path)) {
      pi.busy++
      try {
        const res = await realFetch(pi.url + path, { method: init.method ?? 'GET', headers: init.headers, body: init.body })
        const text = await res.text()
        if (!res.ok) pi.refused.push(`${init.method ?? 'GET'} ${path}: ${res.status} ${text}`)
        return { ok: res.ok, status: res.status, json: async () => JSON.parse(text) }
      } finally {
        pi.busy--
      }
    }
    return fileResponse(url) ?? { ok: true, status: 200, json: async () => ({}) }
  })
}

// --- Watching for crashes ----------------------------------------------------------------------

let crash = null
class CrashCatcher extends Component {
  state = { crashed: false }
  static getDerivedStateFromError() {
    return { crashed: true }
  }
  componentDidCatch(error) {
    crash ??= { where: 'a screen', error }
  }
  render() {
    return this.state.crashed ? <p>crashed</p> : this.props.children
  }
}

beforeAll(async () => {
  installFake3D()
  installFetch()
  window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.HTMLElement.prototype.scrollIntoView = () => {}
  window.addEventListener('error', (event) => {
    crash ??= { where: 'a tap', error: event.error ?? new Error(event.message) }
  })
  // The figures hide their own crashes (a figure that won't build is left out), and say so here.
  const warn = console.warn
  vi.spyOn(console, 'warn').mockImplementation((...args) => {
    if (/did not build|did not load|3D board failed/.test(String(args[0]))) crash ??= { where: `a figure ("${args[0]}")`, error: args[1] }
    else warn(...args)
  })
  await startPi()
})
afterEach(() => cleanup())
afterAll(() => {
  pi.server?.close()
  if (pi.dir) rmSync(pi.dir, { recursive: true, force: true })
})

// --- The robot ---------------------------------------------------------------------------------

const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80)

// Until the Pi has answered and the screen has caught up (a figure's picture is drawn 30 ms
// after its list shows).
async function settle() {
  for (let n = 0; n < 100; n++) {
    await act(() => new Promise((resolve) => setTimeout(resolve, pi.busy > 0 ? 5 : 15)))
    if (pi.busy === 0) return
  }
}

// Everything the robot could do on the screen now, with how likely it is to pick it.
function choices() {
  // A question on the screen ("Throw away …?") covers everything under it until it's answered.
  const screen = document.querySelector('[role=alertdialog]') ?? document
  const buttons = [...screen.querySelectorAll('button')].filter((b) => !b.disabled)
  const sliders = [...screen.querySelectorAll('input[type=range]')]
  const colors = [...screen.querySelectorAll('input[type=color]')]
  const texts = [...screen.querySelectorAll('input:not([type]), input[type=text]')]
  const weight = (b) => {
    const text = label(b)
    // The colour swatches come 12 to a row; the robot doesn't paint all night.
    if (/ #[0-9a-f]{6}$/i.test(text)) return 0.15
    // The saved heroes' own buttons, so the list gets used before the robot taps away from it.
    if (/^🎮 (Use|In the game)$|^Open$|^Throw away /.test(text)) return 1.5
    return 1
  }
  return [
    ...buttons.map((el) => ({ el, kind: 'tap', weight: weight(el) })),
    ...sliders.map((el) => ({ el, kind: 'slide', weight: 0.8 })),
    ...colors.map((el) => ({ el, kind: 'paint', weight: 0.2 })),
    ...texts.map((el) => ({ el, kind: 'type', weight: 0.3 })),
  ]
}

function pickWeighted(options) {
  let roll = random() * options.reduce((sum, o) => sum + o.weight, 0)
  return options.find((o) => (roll -= o.weight) < 0) ?? options.at(-1)
}

// The Hero Builder's "Made by" box: whose figure it is, which decides whose hero wears it.
const madeBy = () => document.querySelector('input[placeholder="Your name"]')?.value ?? null
// Taps that start a new figure but keep whose it is.
const KEEPS_MAKER = new RegExp(`^(🎲 Surprise me|${STARTERS.map((r) => r.name).join('|')})$`)

async function doSomething(run) {
  const options = choices()
  if (options.length === 0) return false
  const { el, kind } = pickWeighted(options)
  const maker = madeBy()
  if (kind === 'slide') {
    // Anywhere along it, the very ends most of all.
    const [min, max] = [Number(el.min), Number(el.max)]
    const r = random()
    const value = r < 0.15 ? min : r < 0.3 ? max : min + random() * (max - min)
    run.taps.push(`slide "${label(el)}" to ${value.toFixed(2)}`)
    fireEvent.change(el, { target: { value: String(value) } })
  } else if (kind === 'paint') {
    const hex = `#${Math.floor(random() * 0xffffff).toString(16).padStart(6, '0')}`
    run.taps.push(`paint "${label(el)}" ${hex}`)
    fireEvent.change(el, { target: { value: hex } })
  } else if (kind === 'type') {
    const name = pick(NAMES)
    run.taps.push(`type "${name}" in "${el.closest('label')?.textContent.trim().split(/\s{2,}/)[0] ?? 'a box'}"`)
    fireEvent.change(el, { target: { value: name } })
  } else {
    run.taps.push(`tap "${label(el)}"`)
    fireEvent.click(el)
  }
  await settle()
  if (kind === 'tap' && KEEPS_MAKER.test(label(el)) && madeBy() !== maker) {
    run.problem = `"${label(el)}" changed "Made by" from "${maker}" to "${madeBy()}": saved, that figure wouldn't be anybody's`
  }
  return true
}

// Each player in My models has exactly one figure picked: their normal hero or one model.
function checkMine() {
  for (const section of document.querySelectorAll('section[aria-label$="models"]')) {
    const on = section.querySelectorAll('button[aria-pressed="true"]').length
    if (on !== 1) return `${section.getAttribute('aria-label')} shows ${on} figures picked for the game, not 1`
  }
  return null
}

// Every Hero Builder figure on the screen has its picture drawn by now (src/forge/snapshot.js),
// not just its emojis: a picture that can't be drawn is a figure that won't build.
async function checkPictures(where) {
  await act(() => new Promise((resolve) => setTimeout(resolve, 150)))
  // FigurePicture (MyModels.jsx) shows the emojis in a span until the picture is drawn.
  const waiting = [...document.querySelectorAll('li span.rounded-lg.bg-zinc-950')]
  if (waiting.length === 0) return null
  return `${waiting.length} figures in ${where} never got their picture (${waiting.map((s) => s.closest('li')?.textContent.trim().slice(0, 40)).join('; ')})`
}

async function playRun(seed) {
  random = seeded(seed)
  crash = null
  pi.refused = []
  const run = { seed, taps: [], problem: null }
  const [{ default: HeroBuilder }, { default: MyModelsPage }] = await Promise.all([import('../components/HeroBuilder.jsx'), import('../components/MyModels.jsx')])
  const show = (Page) =>
    render(
      <CrashCatcher>
        <Suspense fallback={<p>Loading…</p>}>
          <Page />
        </Suspense>
      </CrashCatcher>,
    )

  // The Hero Builder, picking up the last visit's draft (as an iPad does).
  run.taps.push('--- the Hero Builder ---')
  const framesBefore = renderers.reduce((n, r) => n + r.info.render.frame, 0)
  show(HeroBuilder)
  await settle()
  for (let n = 0; n < TAPS && !crash && !run.problem; n++) {
    if (!(await doSomething(run))) run.problem = 'nothing left on the Hero Builder to tap'
    if (document.body.textContent.includes("can't show 3D figures")) run.problem = "the Hero Builder's turntable gave up (\"This screen can't show 3D figures\")"
    if (pi.refused.length > 0) run.problem = `the Pi refused: ${pi.refused.join('; ')}`
    if (!run.problem && run.taps.at(-1) === 'tap "📂 My heroes"') run.problem = await checkPictures('My heroes')
  }
  if (!crash && !run.problem && renderers.reduce((n, r) => n + r.info.render.frame, 0) === framesBefore) run.problem = "the Hero Builder's turntable never drew"
  cleanup()

  // 🎮 My models: picking figures for the game.
  run.taps.push('--- My models ---')
  if (!crash && !run.problem) {
    show(MyModelsPage)
    await settle()
    run.problem = checkMine() ?? (await checkPictures('My models'))
    for (let n = 0; n < MINE_TAPS && !crash && !run.problem; n++) {
      if (!(await doSomething(run))) break
      run.problem = checkMine()
      if (pi.refused.length > 0) run.problem = `the Pi refused: ${pi.refused.join('; ')}`
    }
  }
  if (crash) run.problem = `crashed in ${crash.where}: ${crash.error?.stack ?? crash.error}`
  return run
}

function report(run) {
  return [
    `Robot in the Hero Builder, seed ${run.seed}: ${run.problem}`,
    `Play it again: BUILDER_SEED=${run.seed} BUILDER_RUNS=1 npx vitest run src/robot/builder.test.jsx`,
    'Its last taps:',
    ...run.taps.slice(-25).map((t, i, all) => `  ${run.taps.length - all.length + i + 1}. ${t}`),
  ].join('\n')
}

describe('the robot in the Hero Builder and My models', () => {
  for (let i = 0; i < RUNS; i++) {
    const seed = FIRST_SEED + i
    it(`builds, saves and picks figures without crashing (seed ${seed})`, async () => {
      const run = await playRun(seed)
      const saved = (await (await fetch('/forge.json')).json()).figures
      if (process.env.ROBOT_TAPLOG) (await import('node:fs')).appendFileSync(process.env.ROBOT_TAPLOG, `\n# builder run ${seed}\n${run.taps.join('\n')}\n`)
      process.stderr.write(`Robot Hero Builder run ${seed}: ${run.taps.length} taps, ${saved.length} figures saved on the Pi, ${saved.filter((f) => f.useInGame).length} in the game\n`)
      expect(run.problem, run.problem && report(run)).toBeNull()
    }, 120_000 * Math.max(1, TAPS / 150))
  }
})
