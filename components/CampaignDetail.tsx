'use client'

import { useMemo, useState } from 'react'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import AgentChip from '@/components/ui/AgentChip'
import StatusChip from '@/components/ui/StatusChip'
import GlassCard from '@/components/ui/GlassCard'
import { maskPhone } from '@/lib/security'
import { networkProvider } from '@/lib/networks'
import { semantic } from '@/lib/tokens'
import type { CallRecord, CampaignReport } from '@/types'

const fmtTime = (s: number) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`

// Brand-ish colours for the network label derived from the dialled number's prefix.
const PROVIDER_COLORS: Record<string, { bg: string; fg: string }> = {
  Vodacom: { bg: 'rgba(230,0,0,0.16)', fg: '#ff7a7a' },
  MTN: { bg: 'rgba(255,204,0,0.16)', fg: '#ffd24d' },
  'Cell C': { bg: 'rgba(0,122,255,0.16)', fg: '#5aa9ff' },
}

function NetworkLabel({ phone }: { phone: string }) {
  const p = networkProvider(phone)
  if (!p) return <Box component="span" sx={{ color: 'text.disabled' }}>–</Box>
  const c = PROVIDER_COLORS[p]
  return (
    <Box component="span" sx={{ px: 0.75, py: 0.25, borderRadius: 1, fontSize: '0.7rem', fontWeight: 700, bgcolor: c.bg, color: c.fg, whiteSpace: 'nowrap' }}>{p}</Box>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <GlassCard sx={{ p: 1.5, minWidth: 120, flex: 1 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.65rem' }}>{label}</Typography>
      <Typography variant="h6" sx={{ fontWeight: 800, color: accent ?? 'text.primary' }}>{value}</Typography>
    </GlassCard>
  )
}

export default function CampaignDetail({ report, calls, onBack }: { report: CampaignReport; calls: CallRecord[]; onBack: () => void }) {
  const [outcome, setOutcome] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('recent')

  const outcomes = useMemo(() => Array.from(new Set(calls.map(c => c.outcome))).sort(), [calls])

  const kpis = useMemo(() => {
    const total = calls.length || 1
    const answered = calls.filter(c => (c.talk_seconds || 0) > 0)
    const qualified = calls.filter(c => c.outcome === 'qualified')
    const transfers = calls.filter(c => c.transferred)
    const spend = calls.reduce((s, c) => s + Number(c.cost || 0), 0)
    const avgTalk = answered.length ? answered.reduce((s, c) => s + (c.talk_seconds || 0), 0) / answered.length : 0
    return {
      connectPct: ((answered.length / total) * 100).toFixed(1),
      qualifyPct: ((qualified.length / total) * 100).toFixed(2),
      avgTalk: fmtTime(avgTalk),
      cpl: qualified.length ? (spend / qualified.length).toFixed(2) : '0.00',
      transferPct: ((transfers.length / total) * 100).toFixed(1),
    }
  }, [calls])

  const rows = useMemo(() => {
    let r = calls
    if (outcome) r = r.filter(c => c.outcome === outcome)
    if (search) r = r.filter(c => (c.phone || '').includes(search))
    const sorted = [...r]
    if (sort === 'talk') sorted.sort((a, b) => (b.talk_seconds || 0) - (a.talk_seconds || 0))
    else if (sort === 'cost') sorted.sort((a, b) => Number(b.cost || 0) - Number(a.cost || 0))
    else if (sort === 'outcome') sorted.sort((a, b) => (a.outcome || '').localeCompare(b.outcome || ''))
    else sorted.sort((a, b) => +new Date(b.called_at) - +new Date(a.called_at))
    return sorted
  }, [calls, outcome, search, sort])

  const exportCsv = () => {
    const head = ['Phone', 'Network', 'Outcome', 'Disposition', 'Talk (s)', 'Cost', 'Transferred', 'Recording', 'Called At']
    const lines = [
      head.join(','),
      ...rows.map(c => [`"${maskPhone(c.phone)}"`, networkProvider(c.phone) ?? '', c.outcome, c.business_disposition ?? '', c.talk_seconds, c.cost, c.transferred ? 'yes' : 'no', c.recording_url ?? '', c.called_at].join(',')),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `calls_${report.campaign?.name?.replace(/\s+/g, '_') || report.campaign_id}.csv`
    a.click()
  }

  return (
    <>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack} size="small" variant="outlined">Back to Reports</Button>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>{report.campaign?.name}</Typography>
          <AgentChip agent={report.campaign?.agent ?? ''} />
        </Box>
        <Button variant="outlined" size="small" onClick={exportCsv}>Export Calls CSV</Button>
      </Stack>

      <Stack direction="row" sx={{ gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Stat label="Connect %" value={`${kpis.connectPct}%`} accent={semantic.info} />
        <Stat label="Qualify %" value={`${kpis.qualifyPct}%`} accent={semantic.accent} />
        <Stat label="Avg Talk" value={kpis.avgTalk} />
        <Stat label="CPL" value={`R${kpis.cpl}`} accent={semantic.warning} />
        <Stat label="Transfer %" value={`${kpis.transferPct}%`} />
      </Stack>

      <Stack direction="row" sx={{ gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select size="small" value={outcome} onChange={e => setOutcome(e.target.value)} displayEmpty sx={{ minWidth: 150 }}>
          <MenuItem value="">All Outcomes</MenuItem>
          {outcomes.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
        </Select>
        <TextField size="small" placeholder="Search number…" value={search} onChange={e => setSearch(e.target.value)} />
        <Select size="small" value={sort} onChange={e => setSort(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="recent">Sort: Most Recent</MenuItem>
          <MenuItem value="talk">Sort: Talk Time</MenuItem>
          <MenuItem value="cost">Sort: Cost</MenuItem>
          <MenuItem value="outcome">Sort: Outcome</MenuItem>
        </Select>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{rows.length} calls</Typography>
      </Stack>

      <GlassCard sx={{ p: 0, overflow: 'auto' }}>
        <TableContainer>
          <Table size="small" sx={{ minWidth: 760 }}>
            <TableHead>
              <TableRow>
                {['Phone', 'Network', 'Outcome', 'Disposition', 'Talk', 'Cost', 'Transfer', 'Rec', 'Timestamp'].map(h => (
                  <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', color: 'text.secondary', bgcolor: 'rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map(c => (
                <TableRow key={c.id} hover>
                  <TableCell sx={{ fontSize: '0.82rem' }}>{maskPhone(c.phone)}</TableCell>
                  <TableCell><NetworkLabel phone={c.phone} /></TableCell>
                  <TableCell><StatusChip status={c.outcome} /></TableCell>
                  <TableCell>{c.business_disposition ? <StatusChip status={c.business_disposition} /> : <Box component="span" sx={{ color: 'text.disabled' }}>—</Box>}</TableCell>
                  <TableCell sx={{ fontSize: '0.82rem' }}>{fmtTime(c.talk_seconds)}</TableCell>
                  <TableCell sx={{ fontSize: '0.82rem' }}>R{Number(c.cost).toFixed(2)}</TableCell>
                  <TableCell sx={{ fontSize: '0.95rem', color: c.transferred ? 'success.main' : 'text.disabled', fontWeight: 700 }}>{c.transferred ? '✓' : '–'}</TableCell>
                  <TableCell>
                    <Tooltip title={c.recording_url ? 'Play recording' : 'No recording'}>
                      <span>
                        <IconButton size="small" disabled={!c.recording_url} onClick={() => c.recording_url && window.open(c.recording_url, '_blank')}>
                          <PlayArrowIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>{new Date(c.called_at).toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {!rows.length && (
                <TableRow><TableCell colSpan={8} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>No calls match your filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </GlassCard>
    </>
  )
}
