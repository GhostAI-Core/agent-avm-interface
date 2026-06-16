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
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import type { LiveKitPeerSettings, ProviderType, RoutrSyncStatus, VoipProvider } from '@/lib/types/voip-provider'
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

function syncChip(status: RoutrSyncStatus) {
  if (status === 'synced') return <Chip label="SYNCED" size="small" color="success" variant="outlined" />
  if (status === 'error') return <Chip label="SYNC ERROR" size="small" color="error" variant="outlined" />
  return <Chip label="PENDING" size="small" color="warning" variant="outlined" />
}

export default function SettingsView({ role, providers, setProviders }: SettingsViewProps) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')
  const [routrStatus, setRoutrStatus] = useState<{ peers?: unknown[]; trunks?: unknown[]; error?: string } | null>(null)
  const [livekit, setLivekit] = useState<LiveKitPeerSettings>({
    sip_host: '',
    allowed_cidrs: '',
    peer_username: 'livekit',
    peer_password: '',
  })
  const [livekitKeepPassword, setLivekitKeepPassword] = useState(false)
  const [livekitLoading, setLivekitLoading] = useState(false)
  const [livekitError, setLivekitError] = useState('')
  const isAdmin = role === 'admin'

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/routr/status')
      .then((r) => r.json())
      .then((d) => setRoutrStatus(d))
      .catch(() => setRoutrStatus({ error: 'Could not load Routr status' }))
    fetch('/api/routr/livekit-peer')
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) {
          setLivekit(d.settings)
          setLivekitKeepPassword(Boolean(d.settings.peer_password))
        }
      })
      .catch(() => {})
  }, [isAdmin])

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
      if (!res.ok && !data.provider) {
        setFormError(data.error || data.sync_error || 'Failed to save provider')
        return
      }
      if (data.provider) {
        setProviders([data.provider, ...providers])
        setForm(EMPTY_FORM)
      }
      if (data.sync_error) setFormError(`Saved but Routr sync failed: ${data.sync_error}`)
      const statusRes = await fetch('/api/routr/status').then((r) => r.json())
      setRoutrStatus(statusRes)
    } catch (err) {
      console.error(err)
      setFormError('Network error saving provider')
    } finally {
      setLoading(false)
    }
  }

  async function saveLiveKitPeer() {
    setLivekitError('')
    setLivekitLoading(true)
    try {
      const res = await fetch('/api/routr/livekit-peer', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...livekit,
          keep_password: livekitKeepPassword && livekit.peer_password === '********',
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLivekitError(data.error || data.sync_error || 'Failed to save LiveKit peer')
        return
      }
      if (data.settings) {
        setLivekit(data.settings)
        setLivekitKeepPassword(Boolean(data.settings.peer_password))
      }
      const statusRes = await fetch('/api/routr/status').then((r) => r.json())
      setRoutrStatus(statusRes)
    } catch {
      setLivekitError('Network error')
    } finally {
      setLivekitLoading(false)
    }
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {!isAdmin && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Only administrators can modify carrier trunks, LiveKit peer settings, and Routr sync.
        </Alert>
      )}

      <Paper sx={{ p: 3, mb: 3, opacity: isAdmin ? 1 : 0.6, pointerEvents: isAdmin ? 'auto' : 'none' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Platform → LiveKit SIP</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Routr peer for LiveKit Cloud. Use host:port only (no sip: prefix). Long hostnames are DNS-resolved for Routr contactAddr (20 char limit).
        </Typography>
        {livekitError && <Alert severity="error" sx={{ mb: 2 }}>{livekitError}</Alert>}
        <Stack sx={{ gap: 2 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="SIP host:port" size="small" fullWidth value={livekit.sip_host}
                onChange={(e) => setLivekit((p) => ({ ...p, sip_host: e.target.value }))}
                placeholder="2exlse86t0v.sip.livekit.cloud:5060" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Peer username" size="small" fullWidth value={livekit.peer_username}
                onChange={(e) => setLivekit((p) => ({ ...p, peer_username: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Allowed CIDRs (optional)" size="small" fullWidth value={livekit.allowed_cidrs || ''}
                onChange={(e) => setLivekit((p) => ({ ...p, allowed_cidrs: e.target.value }))}
                placeholder="145.241.97.0/24" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Peer password (optional)" type="password" size="small" fullWidth
                value={livekit.peer_password || ''}
                onChange={(e) => { setLivekitKeepPassword(false); setLivekit((p) => ({ ...p, peer_password: e.target.value })) }}
                helperText="Leave empty for M1 (no digest auth)" />
            </Grid>
          </Grid>
          <Button variant="contained" disabled={livekitLoading} onClick={saveLiveKitPeer}>
            {livekitLoading ? 'Saving…' : 'Save & sync LiveKit peer'}
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: 3, mb: 3, opacity: isAdmin ? 1 : 0.6, pointerEvents: isAdmin ? 'auto' : 'none' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Routr status</Typography>
        {routrStatus?.error ? (
          <Alert severity="warning">{routrStatus.error}</Alert>
        ) : (
          <Stack sx={{ gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              Peers: {(routrStatus?.peers as unknown[] | undefined)?.length ?? 0} · Trunks: {(routrStatus?.trunks as unknown[] | undefined)?.length ?? 0}
            </Typography>
            {(routrStatus?.peers as { ref?: string; username?: string; contactAddr?: string }[] | undefined)?.map((p) => (
              <Box key={p.ref} sx={{ fontFamily: 'monospace', fontSize: 12, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                peer {p.ref} · user={p.username} · contact={p.contactAddr || '—'}
              </Box>
            ))}
            {(routrStatus?.trunks as { ref?: string; inboundUri?: string; name?: string }[] | undefined)?.map((t) => (
              <Box key={t.ref} sx={{ fontFamily: 'monospace', fontSize: 12, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                trunk {t.ref} · {t.name} · inbound={t.inboundUri}
              </Box>
            ))}
          </Stack>
        )}
      </Paper>

      <Paper sx={{ p: 3, opacity: isAdmin ? 1 : 0.6, pointerEvents: isAdmin ? 'auto' : 'none' }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 3 }}>Carrier trunks (Routr sync)</Typography>

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
                <TextField label="Slug (inboundUri)" size="small" fullWidth value={form.slug} onChange={setField('slug')}
                  helperText="{slug}.evra.local" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField label="SIP host" size="small" fullWidth value={form.sip_host} onChange={setField('sip_host')}
                  placeholder="evra-routr.pstn.twilio.com" />
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
              {loading ? 'Saving & syncing…' : 'Save carrier & sync to Routr'}
            </Button>
          </Stack>
        </Box>

        <Stack sx={{ gap: 2 }}>
          {providers.map((p) => (
            <Box key={p.id} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography sx={{ fontWeight: 700 }}>{p.name}</Typography>
                {syncChip(p.sync_status || 'pending')}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {p.provider_type || 'twilio'} · {p.slug}.evra.local → {p.sip_host}:{p.sip_port}
              </Typography>
              {p.sync_error && <Alert severity="error" sx={{ mb: 1 }}>{p.sync_error}</Alert>}
              <Typography variant="caption" color="text.secondary">
                Routr refs: trunk={p.routr_trunk_ref || '—'} cred={p.routr_credentials_ref || '—'}
                {p.last_synced_at ? ` · synced ${new Date(p.last_synced_at).toLocaleString()}` : ''}
              </Typography>
            </Box>
          ))}
          {providers.length === 0 && (
            <Typography variant="body2" color="text.secondary">No carriers configured. Env bootstrap may still apply a default trunk.</Typography>
          )}
        </Stack>
      </Paper>
    </Box>
  )
}
