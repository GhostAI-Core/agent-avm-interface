'use client'
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import type { Company, SipTrunk } from '@/types'

interface SettingsViewProps {
  role: 'admin' | 'engineer'
  trunks: SipTrunk[]
  setTrunks: (t: SipTrunk[]) => void
}

const EMPTY = { name: '', livekit_trunk_id: '', from_number: '', company_id: '' }

export default function SettingsView({ role, trunks, setTrunks }: SettingsViewProps) {
  const [draft, setDraft] = useState(EMPTY)
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isAdmin = role === 'admin'

  useEffect(() => {
    fetch('/api/companies').then(r => r.json()).then(d => setCompanies(d.companies ?? [])).catch(() => {})
  }, [])

  const set = (field: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft(d => ({ ...d, [field]: e.target.value }))

  const companyName = (id?: number | null) => companies.find(c => c.id === id)?.name ?? null

  const handleAddTrunk = async () => {
    if (!draft.name.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/sip-trunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name.trim(),
          livekit_trunk_id: draft.livekit_trunk_id.trim() || null,
          from_number: draft.from_number.trim() || null,
          company_id: draft.company_id ? Number(draft.company_id) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to add SIP trunk'); return }
      setTrunks([data.trunk, ...trunks])
      setDraft(EMPTY)
    } catch (err) {
      console.error(err)
      setError('Failed to add SIP trunk')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/sip-trunks/${id}`, { method: 'DELETE' })
      if (res.ok) setTrunks(trunks.filter(t => t.id !== id))
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>

      {!isAdmin && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Only administrators can modify SIP trunk configurations and global throttling limits.
        </Alert>
      )}

      {/* Environment toggle */}
      <Paper sx={{ p: 3, mb: 3, opacity: isAdmin ? 1 : 0.6, pointerEvents: isAdmin ? 'auto' : 'none' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Platform Environment</Typography>
        <Stack direction="row" sx={{ gap: 2 }}>
          <Button variant="outlined" fullWidth>Staging Environment</Button>
          <Button variant="text" fullWidth sx={{ color: 'text.secondary' }}>Production Environment</Button>
        </Stack>
      </Paper>

      {/* SIP trunks */}
      <Paper sx={{ p: 3, opacity: isAdmin ? 1 : 0.6, pointerEvents: isAdmin ? 'auto' : 'none' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>SIP Trunks</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Outbound trunks used by the dialer. Calls are placed by evra_callops; this only stores the routing config.
        </Typography>

        {/* Add new trunk */}
        <Box sx={{ p: 2, mb: 3, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mb: 1.5, display: 'block' }}>ADD NEW TRUNK</Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <Stack sx={{ gap: 2 }}>
            <TextField label="Trunk Name (e.g. Primary Routr)" size="small" fullWidth value={draft.name} onChange={set('name')} />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="LiveKit Trunk ID (ST_…)" size="small" fullWidth value={draft.livekit_trunk_id} onChange={set('livekit_trunk_id')} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="From Number" placeholder="+27110000000" size="small" fullWidth value={draft.from_number} onChange={set('from_number')} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField select label="Company (optional)" size="small" fullWidth value={draft.company_id} onChange={set('company_id')}>
                  <MenuItem value="">None</MenuItem>
                  {companies.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </TextField>
              </Grid>
            </Grid>
            <Button variant="contained" disabled={loading || !draft.name.trim()} onClick={handleAddTrunk}>
              {loading ? 'Adding Trunk…' : 'Add SIP Trunk'}
            </Button>
          </Stack>
        </Box>

        {/* Trunk list */}
        <Stack sx={{ gap: 2 }}>
          {trunks.length === 0 && (
            <Typography variant="body2" color="text.secondary">No SIP trunks configured yet.</Typography>
          )}
          {trunks.map(t => (
            <Box key={t.id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>{t.name}</Typography>
                  {companyName(t.company_id) && (
                    <Chip label={companyName(t.company_id)} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                  )}
                </Stack>
                <IconButton size="small" aria-label="Delete trunk" onClick={() => handleDelete(t.id)}>
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField label="LiveKit Trunk ID" size="small" fullWidth value={t.livekit_trunk_id ?? ''} slotProps={{ input: { readOnly: true } }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField label="From Number" size="small" fullWidth value={t.from_number ?? ''} slotProps={{ input: { readOnly: true } }} />
                </Grid>
              </Grid>
            </Box>
          ))}
        </Stack>
      </Paper>
    </Box>
  )
}
