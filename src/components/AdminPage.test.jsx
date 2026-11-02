// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminPage, { ADMIN_PAGES } from './AdminPage.jsx'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('admin page', () => {
  it('lists every hidden # page in main.jsx', () => {
    const main = readFileSync('src/main.jsx', 'utf8')
    const routes = [...main.matchAll(/'(#[a-z]+)'/g)].map((m) => m[1]).filter((h) => h !== '#admin')
    expect(routes.length).toBeGreaterThan(5)
    const listed = ADMIN_PAGES.map((p) => p.hash).filter(Boolean)
    for (const hash of routes) expect(listed).toContain(hash)
  })

  it('shows the links to the family and not to friends', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ friend: false }) })))
    render(<AdminPage />)
    expect(screen.getByText('🃏 Card check').closest('a').getAttribute('href')).toBe('/#cards')
  })
  it('tells a friend the pages are family only', async () => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ friend: true, email: 'pal@example.com' }) })))
    const { default: FreshAdmin } = await import('./AdminPage.jsx')
    render(<FreshAdmin />)
    await waitFor(() => screen.getByText('These pages are only for the family.'))
    expect(screen.queryByText('🃏 Card check')).toBeNull()
  })
})
