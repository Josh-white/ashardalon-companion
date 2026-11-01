import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createFriendLog, VISIT_GAP_MS } from './friendLog.js'

describe('friends log', () => {
  it('counts a new visit only after 30 minutes away, and keeps it across restarts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'friendlog-'))
    const file = join(dir, 'friends.json')
    let t = 1000
    const log = createFriendLog(file, () => t)
    log.seen('amy@example.com')
    t += 5 * 60 * 1000
    log.tapped('amy@example.com')
    t += VISIT_GAP_MS + 1
    log.seen('amy@example.com')
    log.finished('amy@example.com', true)
    log.flush()
    const again = createFriendLog(file, () => t).list()
    expect(again).toEqual([{ email: 'amy@example.com', firstSeen: 1000, lastSeen: t, visits: 2, gamesStarted: 0, gamesFinished: 1, wins: 1, taps: 1 }])
    rmSync(dir, { recursive: true, force: true })
  })
})
