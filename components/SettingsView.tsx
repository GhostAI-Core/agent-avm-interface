'use client'
import { useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Alert from '@mui/material/Alert'
import Grid from '@mui/material/Grid'

interface SettingsViewProps {
  role: 'admin' | 'engineer'
  providers: any[]
  setProviders: (p: any[]) => void
}

export default function SettingsView({ role, providers, setProviders }: SettingsViewProps) {
  const [newProv, setNewProv] = useState({ name: '', key: '', secret: '' })
  const [loading, setLoading] = useState(false)
  const isAdmin = role === 'admin'
  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setNewProv(p => ({ ...p, [field]: e.target.value }))

  const handleAddProvider = async () => {
    if (!newProv.name) return
    setLoading(true)
    try {
      const res  = await fetch('/api/providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newProv.name, api_key: newProv.key, api_secret: newProv.secret }) })
      const data = await res.json()
      if (data.provider) { setProviders([data.provider, ...providers]); setNewProv({ name: '', key: '', secret: '' }) }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto' }}>

      {!isAdmin && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Only administrators can modify VoIP provider configurations and global throttling limits.
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

      {/* VoIP providers */}
      <Paper sx={{ p: 3, opacity: isAdmin ? 1 : 0.6, pointerEvents: isAdmin ? 'auto' : 'none' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>VoIP Provider Integration</Typography>

        {/* Add new provider */}
        <Box sx={{ p: 2, mb: 3, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mb: 1.5, display: 'block' }}>ADD NEW GATEWAY</Typography>
          <Stack sx={{ gap: 2 }}>
            <TextField label="Provider Name (e.g. Twilio Production)" size="small" fullWidth value={newProv.name} onChange={set('name')} />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="API Key / SID" type="password" size="small" fullWidth value={newProv.key} onChange={set('key')} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="API Secret / Token" type="password" size="small" fullWidth value={newProv.secret} onChange={set('secret')} />
              </Grid>
            </Grid>
            <Button variant="contained" disabled={loading || !newProv.name} onClick={handleAddProvider}>
              {loading ? 'Linking Gateway…' : 'Link Provider Account'}
            </Button>
          </Stack>
        </Box>

        {/* Provider list */}
        <Stack sx={{ gap: 2 }}>
          {providers.map(p => (
            <Box key={p.id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography sx={{ fontWeight: 700 }}>{p.name}</Typography>
                <Chip label="ACTIVE" size="small" color="success" variant="outlined" sx={{ fontSize: '0.7rem' }} />
              </Stack>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField label="API Key" type="password" size="small" fullWidth value={p.api_key} slotProps={{ input: { readOnly: true } }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField label="API Secret" type="password" size="small" fullWidth value={p.api_secret} slotProps={{ input: { readOnly: true } }} />
                </Grid>
              </Grid>
            </Box>
          ))}
        </Stack>
      </Paper>
    </Box>
  )
}
