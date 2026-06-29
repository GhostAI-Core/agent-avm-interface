'use client'

import { useEffect, useState } from 'react'

export type LookupItem = { value: string; label: string }

// Module-level session cache: one fetch per lookup type per page load.
const cache = new Map<string, LookupItem[]>()
const inflight = new Map<string, Promise<LookupItem[]>>()

async function load(type: string): Promise<LookupItem[]> {
  if (cache.has(type)) return cache.get(type)!
  if (inflight.has(type)) return inflight.get(type)!
  const p = (async () => {
    const res = await fetch(`/api/lookups/${type}`)
    if (!res.ok) throw new Error(`lookup ${type}: ${res.status}`)
    const json = await res.json()
    const items: LookupItem[] = Array.isArray(json) ? json : json.items ?? []
    cache.set(type, items)
    return items
  })()
  inflight.set(type, p)
  try {
    return await p
  } finally {
    inflight.delete(type)
  }
}

// Fetch a lookup list; tolerates in-flight/failed states without throwing so a
// missing lookups endpoint degrades to empty dropdowns rather than crashing.
export function useLookup(type: string): { items: LookupItem[]; loading: boolean; error: boolean } {
  const [items, setItems] = useState<LookupItem[]>(() => cache.get(type) ?? [])
  const [loading, setLoading] = useState(!cache.has(type))
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    if (cache.has(type)) {
      setItems(cache.get(type)!)
      setLoading(false)
      return
    }
    setLoading(true)
    load(type)
      .then((it) => { if (active) { setItems(it); setError(false) } })
      .catch(() => { if (active) { setItems([]); setError(true) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [type])

  return { items, loading, error }
}
