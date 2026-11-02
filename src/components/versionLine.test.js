import { describe, expect, it } from 'vitest'
import { versionLine } from './GamePicker.jsx'

describe('the version line on the game picker', () => {
  it('shows the commit and when it was built', () => {
    expect(versionLine('5cbb645', '2026-10-30T15:47:00Z')).toMatch(/^Version 5cbb645 · built Oct 30/)
  })

  it('still shows the build time without a commit (a test copy built by hand)', () => {
    expect(versionLine('', '2026-10-30T15:47:00Z')).toMatch(/^Version unknown · built Oct 30/)
  })

  it('gets both from the build', () => {
    expect(versionLine()).toMatch(/^Version \S.* · built /)
  })
})
