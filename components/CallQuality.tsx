'use client'

import { useEffect, useMemo, useState } from 'react'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import GlassCard from '@/components/ui/GlassCard'
import type { Campaign, IntentStat } from '@/types'

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0)
const fmtPct = (n: number) => `${n.toFixed(2)}%`

export default function CallQuality({ campaigns }: { campaigns: Campaign[] }) {
  const [campaignId, setCampaignId] = useState<number | ''>('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [intents, setIntents] = useState<IntentStat[]>([])
  const [connectedTotal, setConnectedTotal] = useState(0)
  const [loading, setLoading] = useState(false)

  // Default to the first campaign once the list loads
  useEffect(() => {
    if (campaignId === '' && campaigns.length) setCampaignId(campaigns[0].id)
  }, [campaigns, campaignId])

  useEffect(() => {
    if (campaignId === '') return
    let active = true
    setLoading(true)
    const p = new URLSearchParams({ campaignId: String(campaignId), date })
    fetch(`/api/intents?${p}`)
      .then(r => r.json())
      .then(j => { if (active) { setIntents(j.intents ?? []); setConnectedTotal(j.connectedTotal ?? 0) } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [campaignId, date])

  const campaign = campaigns.find(c => c.id === campaignId)

  // Match Cale's sheet: intents alphabetical; "% dropped from previous" = change vs the row above.
  const rows = useMemo(() => {
    const sorted = [...intents].sort((a, b) => a.intent_name.localeCompare(b.intent_name))
    return sorted.map((it, i) => {
      const prev = sorted[i - 1]
      const dropped = i === 0 || !prev?.reached ? null : ((prev.reached - it.reached) / prev.reached) * 100
      return { ...it, connectedPct: pct(it.reached, connectedTotal), droppedPct: dropped }
    })
  }, [intents, connectedTotal])

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

      <GlassCard sx={{ p: 0, overflow: 'auto' }}>
        <TableContainer>
          <Table size="small" sx={{ minWidth: 640 }}>
            <TableHead>
              <TableRow>
                {['Intent Name', 'Count', '% of Connected', '% dropped from previous'].map((h, i) => (
                  <TableCell key={h} align={i === 0 ? 'left' : 'right'} sx={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', color: 'text.secondary', bgcolor: 'rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.intent_name} hover>
                  <TableCell sx={{ fontSize: '0.82rem', fontWeight: 500 }}>{r.intent_name}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.82rem' }}>{r.reached.toLocaleString()}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.82rem' }}>{fmtPct(r.connectedPct)}</TableCell>
                  <TableCell align="right" sx={{ fontSize: '0.82rem', color: r.droppedPct === null ? 'text.disabled' : r.droppedPct >= 0 ? 'error.main' : 'success.main', fontWeight: 600 }}>
                    {r.droppedPct === null ? '–' : fmtPct(r.droppedPct)}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && !rows.length && (
                <TableRow><TableCell colSpan={4} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>No intent data for this campaign and date.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </GlassCard>
    </>
  )
}
