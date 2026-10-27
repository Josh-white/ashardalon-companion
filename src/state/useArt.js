import { useEffect, useState } from 'react'

// Which card pictures the Pi has, shared by every picture on the page. The
// server says when one changes, and every screen loads the list again.
let versions = {}
let request = null
const listeners = new Set()

function publish(next) {
  versions = next
  for (const listener of listeners) listener(versions)
}

export function refreshArt() {
  request = fetch('/art.json', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => versions)
    .then(publish)
  return request
}

export function useArt() {
  const [art, setArt] = useState(versions)
  useEffect(() => {
    listeners.add(setArt)
    if (!request) refreshArt()
    else setArt(versions)
    return () => listeners.delete(setArt)
  }, [])
  return art
}

export const artUrl = (art, name) => (name && art[name] ? `/art/${name}.${art[name].ext}?v=${art[name].v}` : null)

// Saves a cropped picture to the Pi (or takes it away with null). A PNG keeps
// a token's see-through corners; anything else is saved as a JPEG.
export async function saveArt(name, blob) {
  const ext = blob?.type === 'image/png' ? 'png' : 'jpg'
  const res = await fetch(`/art/${name}.${ext}`, blob ? { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } } : { method: 'DELETE' })
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`)
  publish(await res.json())
}
