'use client'
import { useEffect, useRef, useState } from 'react'
import Grid from '@mui/material/Grid'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import InsightCard from '@/components/InsightCard'
import { INSIGHTS, type InsightCtx, type InsightSize } from '@/lib/dashboardInsights'
import type { DashboardLayoutApi } from '@/lib/useDashboardLayout'

const SPAN: Record<InsightSize, { xs: number; sm: number; md: number }> = {
  sm: { xs: 6, sm: 4, md: 3 },
  md: { xs: 12, sm: 12, md: 6 },
  lg: { xs: 12, sm: 12, md: 12 },
}

export default function InsightDashboard({ ctx, dash, onRequestSaveTemplate }: { ctx: InsightCtx; dash: DashboardLayoutApi; onRequestSaveTemplate: () => void }) {
  const { layout, setLayout, available, add, reset, togglePin, hide, isDirty, templates, applyTemplate } = dash
  const [dragId, setDragId] = useState<string | null>(null)
  const [templateSel, setTemplateSel] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

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

  // reorder depends on the component-local dragId, so it stays here (uses the hook's setLayout)
  const reorder = (targetId: string) => {
    if (!dragId || dragId === targetId) return
    setLayout(l => {
      const order = l.order.filter(id => id !== dragId)
      const at = order.indexOf(targetId)
      order.splice(at < 0 ? order.length : at, 0, dragId)
      return { ...l, order }
    })
  }

  const ADD_PLACEHOLDER = '__add__'

  // Reset reverts to the default layout; clear the local template selection too so
  // the picker doesn't keep showing a template that's no longer applied.
  const handleReset = () => { reset(); setTemplateSel('') }

  return (
    <Box ref={rootRef}>
      <Stack direction="row" sx={{ justifyContent: 'flex-end', alignItems: 'center', gap: 1, mb: 1.5, flexWrap: 'wrap' }}>
        {isDirty && (
          <>
            <Button size="small" variant="outlined" onClick={onRequestSaveTemplate}>Save layout template</Button>
            <Button size="small" variant="text" color="inherit" onClick={handleReset}>Reset layout</Button>
          </>
        )}
        <Select<string>
          size="small"
          value={templateSel}
          displayEmpty
          data-tour="dash-templates"
          onChange={e => { const id = e.target.value; setTemplateSel(id); if (id) applyTemplate(id) }}
          renderValue={v => templates.find(t => t.id === v)?.name ?? 'Layout template'}
          sx={{ minWidth: 170 }}
        >
          <MenuItem value="" disabled>{templates.length ? 'Select a template' : 'No templates yet'}</MenuItem>
          {templates.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
        </Select>
        <Select<string>
          size="small"
          value=""
          displayEmpty
          data-tour="add-insight"
          onChange={e => {
            const v = e.target.value
            if (v && v !== ADD_PLACEHOLDER) add(v)
          }}
          renderValue={() => `Add insight${available.length ? ` (${available.length})` : ''}`}
          sx={{ minWidth: 170 }}
        >
          {available.length
            ? available.map(id => <MenuItem key={id} value={id}>{defs.get(id)?.title ?? id}</MenuItem>)
            : <MenuItem value="" disabled>All insights shown</MenuItem>}
        </Select>
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
