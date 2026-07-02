'use client'
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import CircularProgress from '@mui/material/CircularProgress'
import { maskPhone } from '@/lib/security'
import { semantic } from '@/lib/tokens'

// Leads = contacts who pressed 1 in a Lead-Gen campaign (call_records.outcome='lead').
// Empty until CallOps lead-mode ships; then it populates automatically.

type Lead = { phone: string; name: string; campaign: string; at: string | null; talk_seconds: number; disposition: string | null }

const fmtTime = (s: number) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`
const fmtWhen = (s: string | null) => (s ? new Date(s).toLocaleString() : '—')

export default function LeadsView() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch('/api/leads')
      .then(r => (r.ok ? r.json() : { leads: [] }))
      .then(j => { if (active) setLeads(j.leads ?? []) })
      .catch(() => { if (active) setLeads([]) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const exportCsv = () => {
    const rows = [
      ['Phone', 'Name', 'Campaign', 'When', 'Talk'],
      ...leads.map(l => [l.phone, l.name, l.campaign, fmtWhen(l.at), fmtTime(l.talk_seconds)]),
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
            Contacts who pressed 1 in a Lead-Gen campaign · {leads.length} total
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
              <TableCell>When</TableCell>
              <TableCell align="right">Talk</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={22} /></TableCell></TableRow>
            ) : leads.length === 0 ? (
              <TableRow><TableCell colSpan={5} sx={{ textAlign: 'center', py: 5, color: semantic.textSoft }}>
                No leads yet — Lead-Gen campaigns will populate this as contacts press 1.
              </TableCell></TableRow>
            ) : (
              leads.map((l, i) => (
                <TableRow key={i} hover>
                  <TableCell sx={{ fontFamily: 'var(--font-mono, monospace)' }}>{maskPhone(l.phone)}</TableCell>
                  <TableCell>{l.name || '—'}</TableCell>
                  <TableCell>{l.campaign}</TableCell>
                  <TableCell>{fmtWhen(l.at)}</TableCell>
                  <TableCell align="right">{fmtTime(l.talk_seconds)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  )
}
