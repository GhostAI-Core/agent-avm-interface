'use client'
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import CircularProgress from '@mui/material/CircularProgress'
import { maskPhone } from '@/lib/security'
import { semantic } from '@/lib/tokens'

// Every contact who pressed 1 in a Lead-Gen campaign: DOUBLE opt-in (the lead) + SINGLE
// opt-in (pressed 1, listened, no second press). Both are records; both shown here.

type Lead = {
  phone: string; name: string; campaign: string; optin: 'single' | 'double'
  at: string | null; talk_seconds: number; on_air_seconds: number | null
  disposition: string | null; cost: number
}

const fmtTime = (s: number | null) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`
const fmtWhen = (s: string | null) => (s ? new Date(s).toLocaleString() : '—')

export default function LeadsView() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [counts, setCounts] = useState({ double_optin: 0, single_optin: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch('/api/leads')
      .then(r => (r.ok ? r.json() : { leads: [] }))
      .then(j => { if (active) { setLeads(j.leads ?? []); setCounts({ double_optin: j.double_optin ?? 0, single_optin: j.single_optin ?? 0 }) } })
      .catch(() => { if (active) setLeads([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const exportCsv = () => {
    const rows = [
      ['Phone', 'Name', 'Campaign', 'Opt-in', 'When', 'Talk', 'On-air', 'Cost'],
      ...leads.map(l => [l.phone, l.name, l.campaign, l.optin, fmtWhen(l.at), fmtTime(l.talk_seconds), fmtTime(l.on_air_seconds), `R${l.cost.toFixed(2)}`]),
    ]
    const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'leads.csv'; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Leads</Typography>
          <Typography variant="caption" sx={{ color: semantic.textSoft }}>
            {counts.double_optin} double opt-in · {counts.single_optin} single opt-in · pressed 1 in a Lead-Gen campaign
          </Typography>
        </Box>
        <Button size="small" variant="outlined" onClick={exportCsv} disabled={!leads.length}>Export CSV</Button>
      </Box>

      <Paper variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Phone</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Campaign</TableCell>
              <TableCell>Opt-in</TableCell>
              <TableCell>When</TableCell>
              <TableCell align="right">Talk</TableCell>
              <TableCell align="right">On-air</TableCell>
              <TableCell align="right">Cost</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={22} /></TableCell></TableRow>
            ) : leads.length === 0 ? (
              <TableRow><TableCell colSpan={8} sx={{ textAlign: 'center', py: 5, color: semantic.textSoft }}>
                No leads yet — Lead-Gen campaigns will populate this as contacts press 1.
              </TableCell></TableRow>
            ) : (
              leads.map((l, i) => (
                <TableRow key={i} hover>
                  <TableCell sx={{ fontFamily: 'var(--font-mono, monospace)' }}>{maskPhone(l.phone)}</TableCell>
                  <TableCell>{l.name || '—'}</TableCell>
                  <TableCell>{l.campaign}</TableCell>
                  <TableCell>
                    <Chip size="small" label={l.optin === 'double' ? 'Double' : 'Single'}
                      color={l.optin === 'double' ? 'success' : 'default'} variant={l.optin === 'double' ? 'filled' : 'outlined'} />
                  </TableCell>
                  <TableCell>{fmtWhen(l.at)}</TableCell>
                  <TableCell align="right">{fmtTime(l.talk_seconds)}</TableCell>
                  <TableCell align="right">{fmtTime(l.on_air_seconds)}</TableCell>
                  <TableCell align="right">R{l.cost.toFixed(2)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  )
}
