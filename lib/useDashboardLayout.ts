'use client'
import { useCallback, useEffect, useState } from 'react'
import { INSIGHTS, DEFAULT_INSIGHTS } from '@/lib/dashboardInsights'
import type { DashboardLayout, DashboardTemplate } from '@/types'

const LS_KEY = 'avm.dash.layout.v3'
const ALL_IDS = INSIGHTS.map(i => i.id)
const ADDON_IDS = ALL_IDS.filter(id => !DEFAULT_INSIGHTS.includes(id))

export type Layout = DashboardLayout

export function defaultLayout(): Layout {
  return {
    order: [...DEFAULT_INSIGHTS.filter(id => ALL_IDS.includes(id)), ...ADDON_IDS],
    pinned: [],
    hidden: [...ADDON_IDS],
  }
}

function load(): Layout {
  try {
    const raw = typeof window !== 'undefined' && window.localStorage.getItem(LS_KEY)
    if (!raw) return defaultLayout()
    const saved = JSON.parse(raw) as Layout
    const known = new Set(ALL_IDS)
    const order = saved.order.filter(id => known.has(id))
    ALL_IDS.forEach(id => { if (!order.includes(id)) order.push(id) })
    // New insights added to the registry later default to hidden (available as add-ons)
    const seen = new Set(saved.order)
    const newlyAdded = ALL_IDS.filter(id => !seen.has(id))
    return {
      order,
      pinned: (saved.pinned || []).filter(id => known.has(id)),
      hidden: [...(saved.hidden || []).filter(id => known.has(id)), ...newlyAdded],
    }
  } catch {
    return defaultLayout()
  }
}

export interface DashboardLayoutApi {
  layout: Layout
  setLayout: React.Dispatch<React.SetStateAction<Layout>>
  isDirty: boolean
  available: string[]
  togglePin: (id: string) => void
  hide: (id: string) => void
  add: (id: string) => void
  reset: () => void
  templates: DashboardTemplate[]
  saveTemplate: (name: string) => Promise<void>
  applyTemplate: (id: string) => void
  reloadTemplates: () => Promise<void>
}

export function useDashboardLayout(): DashboardLayoutApi {
  const [layout, setLayout] = useState<Layout>(defaultLayout)
  const [templates, setTemplates] = useState<DashboardTemplate[]>([])

  useEffect(() => { setLayout(load()) }, [])
  useEffect(() => { try { window.localStorage.setItem(LS_KEY, JSON.stringify(layout)) } catch { /* ignore */ } }, [layout])

  const reloadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard-templates')
      const json = await res.json()
      setTemplates(json.templates ?? [])
    } catch { /* keep existing */ }
  }, [])

  useEffect(() => { reloadTemplates() }, [reloadTemplates])

  const hiddenSet = new Set(layout.hidden)
  const available = layout.order.filter(id => hiddenSet.has(id))
  const isDirty = JSON.stringify(layout) !== JSON.stringify(defaultLayout())

  const togglePin = (id: string) => setLayout(l => ({ ...l, pinned: l.pinned.includes(id) ? l.pinned.filter(x => x !== id) : [...l.pinned, id] }))
  const hide = (id: string) => setLayout(l => ({ ...l, hidden: [...l.hidden, id], pinned: l.pinned.filter(x => x !== id) }))
  // Adding from the dropdown un-hides and pins it to the top window
  const add = (id: string) => setLayout(l => ({ ...l, hidden: l.hidden.filter(x => x !== id), pinned: [...l.pinned.filter(x => x !== id), id] }))
  const reset = () => setLayout(defaultLayout())

  const saveTemplate = useCallback(async (name: string) => {
    const n = name.trim()
    if (!n) return
    await fetch('/api/dashboard-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: n, layout }),
    })
    await reloadTemplates()
  }, [layout, reloadTemplates])

  const applyTemplate = useCallback((id: string) => {
    const t = templates.find(x => x.id === id)
    if (t?.layout) setLayout(t.layout)
  }, [templates])

  return { layout, setLayout, isDirty, available, togglePin, hide, add, reset, templates, saveTemplate, applyTemplate, reloadTemplates }
}
