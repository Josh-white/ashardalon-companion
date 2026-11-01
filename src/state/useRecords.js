import { useEffect, useState } from 'react'

// The Pi's /records.json: { players, solo, played } (solo games' records kept apart), or null while loading or when the Pi can't
// be reached. Loaded again whenever `refresh` changes.
export function useRecordsFile(refresh) {
  const [file, setFile] = useState(null)
  useEffect(() => {
    let active = true
    fetch('/records.json', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => active && setFile({ players: Array.isArray(data.players) ? data.players : [], solo: Array.isArray(data.solo) ? data.solo : [], played: data.played ?? {} }))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [refresh])
  return file
}

// The players' records and titles from the Pi (state/records.js), or null while loading
// or when the Pi can't be reached. Loaded again whenever `refresh` changes, so the recap
// sees the game that just ended.
export function useRecords(refresh) {
  return useRecordsFile(refresh)?.players ?? null
}
