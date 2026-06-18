'use client'
import { useState, useEffect } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import type { Campaign } from '@/types'
import { parseContacts } from '@/lib/parseCsv'

type Mode = 'edit' | 'reuse'
type SavedScript = { storageKey: string; publicUrl: string; name: string; lastModified: string | null }

export default function CampaignActionDialog({ mode, campaign, onClose, onDone }: {
  mode: Mode
  campaign: Campaign
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(mode === 'reuse' ? `${campaign.name} (copy)` : campaign.name)
  // Unified script pointer (issue #31): audio_path, falling back to the legacy voice_recording_url.
  const [scriptUrl, setScriptUrl] = useState(campaign.audio_path ?? campaign.voice_recording_url ?? '')
  const [scripts, setScripts] = useState<SavedScript[]>([])
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load the saved S3 scripts for the dropdown.
  useEffect(() => {
    let cancelled = false
    fetch('/api/scripts')
      .then(r => (r.ok ? r.json() : { scripts: [] }))
      .then(j => { if (!cancelled) setScripts(j.scripts ?? []) })
      .catch(() => { /* leave empty → paste a URL instead */ })
    return () => { cancelled = true }
  }, [])

  async function submit() {
    setLoading(true); setError('')
    try {
      if (mode === 'edit') {
        const res = await fetch(`/api/campaigns/${campaign.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio_path: scriptUrl }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update')
      } else {
        const contacts = csvFile && csvFile.size > 0 ? parseContacts(await csvFile.text()) : undefined
        const res = await fetch('/api/campaigns', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            company_id: campaign.company_id,   // company is required — carry it from the source campaign
            agent: campaign.agent,
            dialing_speed: campaign.dialing_speed,
            window_start: campaign.time_window_start,
            window_end: campaign.time_window_end,
            audio_path: scriptUrl,
            transfer_key: campaign.transfer_key ?? '',
            transfer_target: campaign.transfer_target ?? '',
            ...(contacts ? { contacts } : {}),
          }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create')
      }
      onDone(); onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // The dropdown's value is the chosen script's URL ('' = none / use the manual field below).
  const dropdownValue = scripts.some(s => s.publicUrl === scriptUrl) ? scriptUrl : ''

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {mode === 'edit' ? 'Edit Campaign — Script' : 'Reuse as Template'}
        <Typography variant="body2" color="text.secondary">
          {mode === 'edit' ? campaign.name : `Clones "${campaign.name}" — change the script and call list, everything else is reused.`}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {mode === 'reuse' && (
            <TextField label="New campaign name" value={name} onChange={e => setName(e.target.value)} fullWidth size="small" />
          )}

          <FormControl fullWidth size="small" disabled={scripts.length === 0}>
            <InputLabel id="script-label">Saved script (S3)</InputLabel>
            <Select labelId="script-label" label="Saved script (S3)" value={dropdownValue}
              onChange={e => setScriptUrl(e.target.value)} displayEmpty>
              <MenuItem value=""><em>{scripts.length === 0 ? 'No saved scripts' : 'Choose a saved script…'}</em></MenuItem>
              {scripts.map(s => <MenuItem key={s.storageKey} value={s.publicUrl}>{s.name}</MenuItem>)}
            </Select>
          </FormControl>

          <TextField label="…or paste an audio URL" value={scriptUrl} onChange={e => setScriptUrl(e.target.value)}
            fullWidth size="small" placeholder="https://…/script.mp3" />

          {mode === 'reuse' && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Call list (CSV: phone, first_name, last_name) — leave empty to reuse none</Typography>
              <input type="file" accept=".csv" onChange={e => setCsvFile(e.target.files?.[0] ?? null)} />
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={loading}>
          {mode === 'edit' ? 'Save' : 'Create from template'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
