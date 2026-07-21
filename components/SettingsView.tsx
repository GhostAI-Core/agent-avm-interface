'use client'

import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'

interface SettingsViewProps {
  role: 'admin' | 'engineer'
}

export default function SettingsView({ role }: SettingsViewProps) {
  const isAdmin = role === 'admin'
  const [rate, setRate] = useState('')
  const [savedRate, setSavedRate] = useState<number | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/settings')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Failed to load settings'))))
      .then(j => {
        if (!active) return
        setSavedRate(typeof j.cost_per_minute_zar === 'number' ? j.cost_per_minute_zar : null)
        setRate(j.cost_per_minute_zar != null ? String(j.cost_per_minute_zar) : '')
        setUpdatedAt(j.updated_at ?? null)
      })
      .catch(() => { if (active) setError('Could not load current cost settings.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const handleSave = async () => {
    const value = Number(rate)
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter a valid positive rate.')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cost_per_minute_zar: value }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Failed to save')
      setSavedRate(json.cost_per_minute_zar ?? value)
      setUpdatedAt(json.updated_at ?? new Date().toISOString())
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const dirty = savedRate != null && rate !== '' && Number(rate) !== savedRate

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {!isAdmin && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Only administrators can modify platform settings.
        </Alert>
      )}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Call Cost</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The carrier rate used to price every call, billed per second of talk time. CallOps
          applies this rate at the moment each call outcome is recorded, so changes take effect
          on the next call — historical costs are not recalculated.
        </Typography>

        {loading ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">Loading current rate…</Typography>
          </Box>
        ) : (
          <Stack spacing={2} sx={{ maxWidth: 360 }}>
            <TextField
              label="Cost per minute"
              type="number"
              size="small"
              value={rate}
              onChange={e => { setRate(e.target.value); setSuccess(false) }}
              disabled={!isAdmin || saving}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">R</InputAdornment>,
                  endAdornment: <InputAdornment position="end">/ min</InputAdornment>,
                },
                htmlInput: { min: 0, step: 0.01 },
              }}
            />
            {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
            {success && <Alert severity="success" onClose={() => setSuccess(false)}>Cost per minute updated.</Alert>}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Button
                variant="contained"
                onClick={handleSave}
                disabled={!isAdmin || saving || !dirty}
              >
                {saving ? 'Saving…' : 'Save'}
              </Button>
              {updatedAt && (
                <Typography variant="caption" color="text.secondary">
                  Last updated {new Date(updatedAt).toLocaleString()}
                </Typography>
              )}
            </Box>
          </Stack>
        )}
      </Paper>

      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Telephony</Typography>
        <Typography variant="body2" color="text.secondary">
          Outbound calling uses the LiveKit SIP trunk configured via
          {' '}<code>LIVEKIT_SIP_OUTBOUND_TRUNK_ID</code> (or a per-campaign
          {' '}<code>sip_trunk_id</code>). Manage trunks from the Telephony tab.
        </Typography>
      </Paper>
    </Box>
  )
}
