'use client'

import { useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Grid from '@mui/material/Grid'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import type { ProviderType, VoipProvider } from '@/lib/types/voip-provider'
import { slugifyName } from '@/lib/validate-carrier'

interface SettingsViewProps {
  role: 'admin' | 'engineer'
  providers: VoipProvider[]
  setProviders: (p: VoipProvider[]) => void
}

const EMPTY_FORM = {
  name: '',
  slug: '',
  provider_type: 'twilio' as ProviderType,
  sip_host: '',
  sip_port: '5060',
  sip_username: '',
  sip_password: '',
  send_register: false,
}

export default function SettingsView({ role, providers, setProviders }: SettingsViewProps) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const isAdmin = role === 'admin'

  const setField = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = field === 'send_register' ? e.target.checked : e.target.value
    setForm((p) => {
      const next = { ...p, [field]: value }
      if (field === 'name' && !p.slug) next.slug = slugifyName(String(value))
      return next
    })
  }

  async function handleAddProvider() {
    if (!form.name || !form.sip_host || !form.sip_username || !form.sip_password) {
      setFormError('Name, SIP host, username, and password are required.')
      return
    }
    setFormError('')
    setLoading(true)
    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          sip_port: Number(form.sip_port) || 5060,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Failed to save provider')
        return
      }
      if (data.provider) {
        setProviders([data.provider, ...providers])
        setForm(EMPTY_FORM)
      }
    } catch (err) {
      console.error(err)
      setFormError('Network error saving provider')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {!isAdmin && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Only administrators can modify carrier trunks.
        </Alert>
      )}

      <Paper sx={{ p: 3, opacity: isAdmin ? 1 : 0.6, pointerEvents: isAdmin ? 'auto' : 'none' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>Carrier trunks</Typography>

        <Box sx={{ p: 2, mb: 3, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', mb: 1.5, display: 'block' }}>ADD CARRIER</Typography>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Stack sx={{ gap: 2 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Provider name" size="small" fullWidth value={form.name} onChange={setField('name')} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl size="small" fullWidth>
                  <InputLabel id="ptype-label">Type</InputLabel>
                  <Select labelId="ptype-label" label="Type" value={form.provider_type}
                    onChange={(e) => setForm((p) => ({ ...p, provider_type: e.target.value as ProviderType }))}>
                    <MenuItem value="twilio">Twilio</MenuItem>
                    <MenuItem value="telnyx">Telnyx</MenuItem>
                    <MenuItem value="sangoma">Sangoma</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="Slug" size="small" fullWidth value={form.slug} onChange={setField('slug')} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="SIP host" size="small" fullWidth value={form.sip_host} onChange={setField('sip_host')}
                  placeholder="your-carrier.sip.example.com" />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <TextField label="Port" type="number" size="small" fullWidth value={form.sip_port} onChange={setField('sip_port')}
                  slotProps={{ htmlInput: { min: 1, max: 65535 } }} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <FormControlLabel control={<Checkbox checked={form.send_register} onChange={setField('send_register')} />}
                  label="Send register" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="SIP username" size="small" fullWidth value={form.sip_username} onChange={setField('sip_username')} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="SIP password" type="password" size="small" fullWidth value={form.sip_password} onChange={setField('sip_password')} />
              </Grid>
            </Grid>
            <Button variant="contained" disabled={loading || !form.name} onClick={handleAddProvider}>
              {loading ? 'Saving…' : 'Save carrier'}
            </Button>
          </Stack>
        </Box>

        <Stack sx={{ gap: 2 }}>
          {providers.map((p) => (
            <Box key={p.id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>{p.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {p.provider_type || 'twilio'} · {p.slug} → {p.sip_host}:{p.sip_port}
              </Typography>
            </Box>
          ))}
          {providers.length === 0 && (
            <Typography variant="body2" color="text.secondary">No carriers configured.</Typography>
          )}
        </Stack>
      </Paper>
    </Box>
  )
}
