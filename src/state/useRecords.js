import { useEffect, useState } from 'react'

// The players' records and titles from the Pi (state/records.js), or null while loading
// or when the Pi can't be reached. Loaded again whenever `refresh` changes, so the recap
// sees the game that just ended.
export function useRecords(refresh) {
  const [records, setRecords] = useState(null)
  useEffect(() => {
    let active = true
    fetch('/records.json', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => active && setRecords(Array.isArray(data.players) ? data.players : []))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [refresh])
  return records
}
