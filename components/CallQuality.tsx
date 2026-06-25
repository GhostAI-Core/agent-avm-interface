'use client'

import { useEffect, useMemo, useState } from 'react'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable'
import GlassCard from '@/components/ui/GlassCard'
import { colors } from '@/lib/tokens'
import type { Campaign, IntentStat } from '@/types'

const MONO = "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace"

type IntentRow = IntentStat & { connectedPct: number; droppedPct: number | null }

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0)
const fmtPct = (n: number) => `${n.toFixed(2)}%`

export default function CallQuality({ campaigns }: { campaigns: Campaign[] }) {
  const [campaignId, setCampaignId] = useState<number | ''>('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [intents, setIntents] = useState<IntentStat[]>([])
  const [connectedTotal, setConnectedTotal] = useState(0)

  // Default to the first campaign once the list loads
  useEffect(() => {
    if (campaignId === '' && campaigns.length) setCampaignId(campaigns[0].id)
  }, [campaigns, campaignId])

  useEffect(() => {
    if (campaignId === '') return
    let active = true
    const p = new URLSearchParams({ campaignId: String(campaignId), date })
    fetch(`/api/intents?${p}`)
      .then(r => r.json())
      .then(j => { if (active) { setIntents(j.intents ?? []); setConnectedTotal(j.connectedTotal ?? 0) } })
    return () => { active = false }
  }, [campaignId, date])

  const campaign = campaigns.find(c => c.id === campaignId)

  // Match Cale's sheet: intents alphabetical; "% dropped from previous" = change vs the row above.
  const rows = useMemo<IntentRow[]>(() => {
    const sorted = [...intents].sort((a, b) => a.intent_name.localeCompare(b.intent_name))
    return sorted.map((it, i) => {
      const prev = sorted[i - 1]
      const dropped = i === 0 || !prev?.reached ? null : ((prev.reached - it.reached) / prev.reached) * 100
      return { ...it, connectedPct: pct(it.reached, connectedTotal), droppedPct: dropped }
    })
  }, [intents, connectedTotal])

  const columns: DataTableColumn<IntentRow>[] = [
    { key: 'intent_name', label: 'Intent Name', width: '2.2fr',
      render: r => <span style={{ fontWeight: 500 }}>{r.intent_name}</span> },
    { key: 'reached', label: 'Count', align: 'right', width: '1fr',
      render: r => <span style={{ fontFamily: MONO }}>{r.reached.toLocaleString()}</span> },
    { key: 'connectedPct', label: '% of Connected', align: 'right', width: '1.3fr',
      render: r => <span style={{ fontFamily: MONO }}>{fmtPct(r.connectedPct)}</span> },
    { key: 'droppedPct', label: '% dropped from previous', align: 'right', width: '1.6fr',
      render: r => {
        const v = r.droppedPct
        return (
          <span style={{ fontFamily: MONO, fontWeight: 600, color: v === null ? colors.fg4 : v >= 0 ? colors.negative : colors.green }}>
            {v === null ? '–' : fmtPct(v)}
          </span>
        )
      } },
  ]

  const exportCsv = () => {
    const head = ['Intent Name', 'Count', '% of Connected', '% dropped from previous']
    const lines = [
      head.join(','),
      ...rows.map(r => [`"${r.intent_name}"`, r.reached, r.connectedPct.toFixed(2), r.droppedPct === null ? '' : r.droppedPct.toFixed(2)].join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `intent_waterfall_${campaign?.name?.replace(/\s+/g, '_') || campaignId}_${date}.csv`
    a.click()
  }

  return (
    <>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>Call Quality — Intent Waterfall</Typography>
          <Typography variant="caption" color="text.secondary">
            Where calls dropped through the conversation flow · single-date view
          </Typography>
        </Box>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Select size="small" value={campaignId} onChange={e => setCampaignId(Number(e.target.value))} displayEmpty sx={{ minWidth: 220 }}>
            {!campaigns.length && <MenuItem value="">No campaigns</MenuItem>}
            {campaigns.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </Select>
          <TextField size="small" type="date" value={date} onChange={e => setDate(e.target.value)}
            slotProps={{ htmlInput: { style: { colorScheme: 'dark' } } }}
          />
          <Button variant="outlined" size="small" onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
        </Stack>
      </Stack>

      <Stack direction="row" sx={{ gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <GlassCard sx={{ p: 1.5, minWidth: 160 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.65rem' }}>Connected (denominator)</Typography>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{connectedTotal.toLocaleString()}</Typography>
        </GlassCard>
        <GlassCard sx={{ p: 1.5, minWidth: 160 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.65rem' }}>Intents fired</Typography>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{rows.length}</Typography>
        </GlassCard>
      </Stack>

      <DataTable<IntentRow>
        rows={rows}
        columns={columns}
        getRowId={(row) => row.intent_name}
      />
    </>
  )
}
