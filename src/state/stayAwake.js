import { useEffect, useSyncExternalStore } from 'react'

// Keeps this screen from dimming and locking during a game, the way it stays on while a
// video plays. Browsers that know the Screen Wake Lock API get a wake lock (it only works
// over https, so the real game, not the http test copy). Others, and iPads added to the
// home screen before iPadOS 18.4, play a tiny silent black video off-screen instead, which
// keeps the screen on the same way. On by default on every screen; ☀️ turns it off per screen.

const KEY = 'ashardalon-stay-awake'

// A 2-second, 16x16 black H.264 clip with no sound (1.5 KB), inline so no server
// needs to support byte ranges for Safari.
const CLIP = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMrbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAlV0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAABAAAAAQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHNbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAgABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABeG1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAThzdGJsAAAAuHN0c2QAAAAAAAAAAQAAAKhhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAABAAEABIAAAASAAAAAAAAAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALmF2Y0MBQsAK/+EAFmdCwArZHsBEAAADAAQAAAMACDxImSABAAVoy4PLIAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAAApAAAAKQAAAABhzdHRzAAAAAAAAAAEAAAACAABAAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAACAAAAAQAAABxzdHN6AAAAAAAAAAAAAAACAAAChgAAAAoAAAAUc3RjbwAAAAAAAAABAAADWwAAAGJ1ZHRhAAAAWm1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAG1kaXJhcHBsAAAAAAAAAAAAAAAALWlsc3QAAAAlqXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNjAuMTYuMTAwAAAACGZyZWUAAAKYbWRhdAAAAnAGBf//bNxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjQgcjMxMDggMzFlMTlmOSAtIEguMjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjMgLSBodHRwOi8vd3d3LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0wIHJlZj0zIGRlYmxvY2s9MTowOjAgYW5hbHlzZT0weDE6MHgxMTEgbWU9aGV4IHN1Ym1lPTcgcHN5PTEgcHN5X3JkPTEuMDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0xNiBjaHJvbWFfbWU9MSB0cmVsbGlzPTEgOHg4ZGN0PTAgY3FtPTAgZGVhZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz0xIGxvb2thaGVhZF90aHJlYWRzPTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJhaW5lZF9pbnRyYT0wIGJmcmFtZXM9MCB3ZWlnaHRwPTAga2V5aW50PTI1MCBrZXlpbnRfbWluPTEgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAOZYiEBb///w9FAAFPf4AAAAAGQZo4CvqA'

const listeners = new Set()
let wanted = readWanted()

function readWanted() {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setStayAwake(on) {
  wanted = on
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // Private mode: the switch lasts until the page reloads.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useStayAwakeSetting() {
  const on = useSyncExternalStore(subscribe, () => wanted, () => true)
  return [on, setStayAwake]
}

// The test runner's pretend browser can't play video.
const canPlayVideo = () => typeof navigator !== 'undefined' && !/jsdom/i.test(navigator.userAgent ?? '')

// Keeps the screen on while `active` is true. Wake locks drop whenever the page is
// hidden (another app, the screen locked by hand), so it asks again when the page comes
// back. If the browser refuses or has no wake lock, the video takes over; it starts on the
// next tap when the browser wants one first.
export function useStayAwake(active) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return undefined
    let lock = null
    let asking = false
    let video = null
    let stopped = false
    let tapped = false

    const playVideo = () => {
      if (!canPlayVideo()) return
      if (!video) {
        video = document.createElement('video')
        video.setAttribute('playsinline', '')
        video.setAttribute('muted', '')
        video.setAttribute('aria-hidden', 'true')
        video.muted = true
        video.loop = true
        video.src = CLIP
        Object.assign(video.style, { position: 'fixed', left: '-10px', top: '-10px', width: '1px', height: '1px', opacity: '0.01', pointerEvents: 'none' })
        document.body.appendChild(video)
      }
      if (video.paused) {
        try {
          video.play()?.catch?.(() => {})
        } catch {
          // Waits for the next tap.
        }
      }
    }

    const keepAwake = async () => {
      if (stopped || document.visibilityState !== 'visible') return
      if (video) return playVideo()
      if (lock && !lock.released) return
      if (!navigator.wakeLock?.request) return playVideo()
      if (asking) return
      asking = true
      try {
        const got = await navigator.wakeLock.request('screen')
        if (stopped) got.release().catch(() => {})
        else lock = got
      } catch (error) {
        // NotAllowedError means "ask again after a tap" on some browsers; a second
        // refusal after a tap means wake locks don't work here, so the video takes over.
        if (error?.name !== 'NotAllowedError' || tapped) playVideo()
      } finally {
        asking = false
      }
    }

    const onTap = () => {
      tapped = true
      keepAwake()
    }
    const onVisible = () => keepAwake()

    keepAwake()
    document.addEventListener('visibilitychange', onVisible)
    for (const type of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(type, onTap, { passive: true })

    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      for (const type of ['pointerdown', 'touchend', 'keydown']) document.removeEventListener(type, onTap)
      lock?.release().catch(() => {})
      if (video) {
        video.pause()
        video.remove()
      }
    }
  }, [active])
}
