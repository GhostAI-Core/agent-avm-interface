'use client'
import { useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import type { Campaign } from '@/types'
import { parseContacts } from '@/lib/parseCsv'

type Mode = 'edit' | 'reuse'

export default function CampaignActionDialog({ mode, campaign, onClose, onDone }: {
  mode: Mode
  campaign: Campaign
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(mode === 'reuse' ? `${campaign.name} (copy)` : campaign.name)
  const [mp4, setMp4] = useState(campaign.voice_recording_url ?? '')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setLoading(true); setError('')
    try {
      if (mode === 'edit') {
        const res = await fetch(`/api/campaigns/${campaign.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voice_recording_url: mp4 }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update')
      } else {
        const contacts = csvFile && csvFile.size > 0 ? parseContacts(await csvFile.text()) : undefined
        const res = await fetch('/api/campaigns', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            agent: campaign.agent,
            dialing_speed: campaign.dialing_speed,
            window_start: campaign.time_window_start,
            window_end: campaign.time_window_end,
            voice_recording_url: mp4,
            transfer_key: campaign.transfer_key ?? '',
            transfer_target: campaign.transfer_target ?? '',
            ...(contacts ? { contacts } : {}),
          }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create')
      }
      onDone(); onClose()
    } catch (e: any) {
      setError(e.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {mode === 'edit' ? 'Edit Campaign — Voice (MP4)' : 'Reuse as Template'}
        <Typography variant="body2" color="text.secondary">
          {mode === 'edit' ? campaign.name : `Clones "${campaign.name}" — change the MP4 and call list, everything else is reused.`}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {mode === 'reuse' && (
            <TextField label="New campaign name" value={name} onChange={e => setName(e.target.value)} fullWidth size="small" />
          )}
          <TextField label="Voice recording URL (MP4)" value={mp4} onChange={e => setMp4(e.target.value)} fullWidth size="small" placeholder="https://…/voice.mp4" />
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
