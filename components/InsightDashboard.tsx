'use client'
import { useEffect, useRef, useState } from 'react'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import AddIcon from '@mui/icons-material/Add'
import InsightCard from '@/components/InsightCard'
import { INSIGHTS, DEFAULT_INSIGHTS, type InsightCtx, type InsightSize } from '@/lib/dashboardInsights'

const LS_KEY = 'avm.dash.layout.v2'
const ALL_IDS = INSIGHTS.map(i => i.id)
const ADDON_IDS = ALL_IDS.filter(id => !DEFAULT_INSIGHTS.includes(id))
const SPAN: Record<InsightSize, { xs: number; sm: number; md: number }> = {
  sm: { xs: 6, sm: 4, md: 3 },
  md: { xs: 12, sm: 12, md: 6 },
  lg: { xs: 12, sm: 12, md: 12 },
}

type Layout = { order: string[]; pinned: string[]; hidden: string[] }

function defaultLayout(): Layout {
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

export default function InsightDashboard({ ctx }: { ctx: InsightCtx }) {
  const [layout, setLayout] = useState<Layout>(defaultLayout)
  const [dragId, setDragId] = useState<string | null>(null)
  const [addAnchor, setAddAnchor] = useState<null | HTMLElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setLayout(load()) }, [])
  useEffect(() => { try { window.localStorage.setItem(LS_KEY, JSON.stringify(layout)) } catch { /* ignore */ } }, [layout])

  // Auto-scroll the page while dragging near the top/bottom edge (native DnD doesn't)
  useEffect(() => {
    if (!dragId) return
    const findScroller = (): HTMLElement => {
      let el: HTMLElement | null = rootRef.current?.parentElement ?? null
      while (el) {
        const oy = getComputedStyle(el).overflowY
        if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el
        el = el.parentElement
      }
      return (document.scrollingElement as HTMLElement) || document.documentElement
    }
    const scroller = findScroller()
    const onDragOver = (e: DragEvent) => {
      e.preventDefault()
      const margin = 90, speed = 22
      const y = e.clientY
      const top = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top
      const bottom = scroller === document.scrollingElement ? window.innerHeight : scroller.getBoundingClientRect().bottom
      if (y < top + margin) scroller.scrollTop -= speed
      else if (y > bottom - margin) scroller.scrollTop += speed
    }
    window.addEventListener('dragover', onDragOver)
    return () => window.removeEventListener('dragover', onDragOver)
  }, [dragId])

  const defs = new Map(INSIGHTS.map(i => [i.id, i]))
  const hiddenSet = new Set(layout.hidden)
  const pinnedSet = new Set(layout.pinned)
  const visible = layout.order.filter(id => !hiddenSet.has(id))
  const display = [...visible.filter(id => pinnedSet.has(id)), ...visible.filter(id => !pinnedSet.has(id))]
  const available = layout.order.filter(id => hiddenSet.has(id))

  const reorder = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    setLayout(l => {
      const order = l.order.filter(id => id !== dragId)
      const at = order.indexOf(targetId)
      order.splice(at < 0 ? order.length : at, 0, dragId)
      return { ...l, order }
    })
  }
  const togglePin = (id: string) => setLayout(l => ({ ...l, pinned: l.pinned.includes(id) ? l.pinned.filter(x => x !== id) : [...l.pinned, id] }))
  const hide = (id: string) => setLayout(l => ({ ...l, hidden: [...l.hidden, id], pinned: l.pinned.filter(x => x !== id) }))
  // Adding from the dropdown un-hides and pins it to the top window
  const add = (id: string) => setLayout(l => ({ ...l, hidden: l.hidden.filter(x => x !== id), pinned: [...l.pinned.filter(x => x !== id), id] }))
  const reset = () => setLayout(defaultLayout())

  return (
    <Box ref={rootRef}>
      <Stack direction="row" sx={{ justifyContent: 'flex-end', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Button size="small" variant="outlined" startIcon={<AddIcon />} disabled={!available.length} onClick={e => setAddAnchor(e.currentTarget)}>
          Add insight{available.length ? ` (${available.length})` : ''}
        </Button>
        <Button size="small" variant="text" onClick={reset}>Reset layout</Button>
        <Menu anchorEl={addAnchor} open={!!addAnchor} onClose={() => setAddAnchor(null)}>
          {available.map(id => (
            <MenuItem key={id} onClick={() => { add(id); setAddAnchor(null) }}>{defs.get(id)?.title ?? id}</MenuItem>
          ))}
        </Menu>
      </Stack>

      <Grid container spacing={2}>
        {display.map(id => {
          const def = defs.get(id)
          if (!def) return null
          return (
            <Grid key={id} size={SPAN[def.size]}>
              <InsightCard
                title={def.title}
                pinned={pinnedSet.has(id)}
                dragging={dragId === id}
                onPin={() => togglePin(id)}
                onHide={() => hide(id)}
                onDragStart={() => setDragId(id)}
                onDragOver={e => e.preventDefault()}
                onDragEnter={() => reorder(id)}
                onDrop={() => setDragId(null)}
                onDragEnd={() => setDragId(null)}
              >
                {def.render(ctx)}
              </InsightCard>
            </Grid>
          )
        })}
      </Grid>
    </Box>
  )
}
