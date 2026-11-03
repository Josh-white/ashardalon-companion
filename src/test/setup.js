// Runs before every test file (vite.config.js test.setupFiles).
//
// The Pi runs the whole suite inside its Docker build before every update, on 4 small
// cores, and rolls the update back if anything fails. Tests there take about 5-7 times as
// long as on GitHub's machines, so the waits that only exist to give slow machines time
// get Pi-sized room here, in one place, instead of test by test.
if (typeof document !== 'undefined') {
  // waitFor / findBy* give up after 1 s by default: too short for a full-app render on the Pi.
  const { configure } = await import('@testing-library/react')
  configure({ asyncUtilTimeout: 5000 })
  // jsdom has no canvas. Saying so quietly (null, like a screen without WebGL) instead of
  // printing "Not implemented: HTMLCanvasElement's getContext()" hundreds of times.
  window.HTMLCanvasElement.prototype.getContext = () => null
}
