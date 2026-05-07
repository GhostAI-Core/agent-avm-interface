'use client'
import { useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'

interface Props { onClose: () => void; onCreated: () => void }

export default function CampaignModal({ onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const payload: any = Object.fromEntries(formData.entries())

    const csvFile = formData.get('csv_file') as File
    if (csvFile && csvFile.size > 0) {
      const text = await csvFile.text()
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim())
      payload.contacts = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim())
        const contact: any = {}
        headers.forEach((h, i) => { if (['phone','first_name','last_name'].includes(h)) contact[h] = values[i] })
        return contact
      }).filter(c => c.phone)
    }

    await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setLoading(false)
    onCreated()
    onClose()
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Create New Campaign</DialogTitle>

      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 1 }}>
          <Stack sx={{ gap: 2 }}>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 8 }}>
                <TextField name="name" label="Campaign Name" placeholder="e.g. 1Life BMI AI V5.0" size="small" fullWidth required />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <FormControl size="small" fullWidth required>
                  <InputLabel>Agent</InputLabel>
                  <Select name="agent" label="Agent" defaultValue="">
                    <MenuItem value="seeker">Seeker</MenuItem>
                    <MenuItem value="grace">Grace</MenuItem>
                    <MenuItem value="sangoma">Sangoma</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField name="dialing_speed" label="Dialing Speed (calls/sec)" type="number" size="small" fullWidth defaultValue="1" slotProps={{ htmlInput: { min: 1, max: 10 } }} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField name="voice_file" label="Voice Recording" type="file" size="small" fullWidth slotProps={{ inputLabel: { shrink: true }, htmlInput: { accept: 'audio/*' } }} />
              </Grid>
            </Grid>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField name="window_start" label="Time Window Start" type="time" size="small" fullWidth defaultValue="08:00" />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField name="window_end" label="Time Window End" type="time" size="small" fullWidth defaultValue="20:00" />
              </Grid>
            </Grid>

            <Box>
              <TextField name="csv_file" label="Contact List (CSV)" type="file" size="small" fullWidth required slotProps={{ inputLabel: { shrink: true }, htmlInput: { accept: '.csv' } }} />
              <Typography variant="caption" color="text.secondary">Expected columns: phone, first_name, last_name</Typography>
            </Box>

            {/* Hotkey transfer */}
            <Box sx={{ p: 2, border: '1px solid rgba(59,130,246,0.2)', borderRadius: 2, bgcolor: 'rgba(59,130,246,0.05)' }}>
              <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main', mb: 1.5 }}>Hotkey Call Transfer</Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Transfer Key</InputLabel>
                    <Select name="transfer_key" label="Transfer Key" defaultValue="1">
                      <MenuItem value="1">Press 1</MenuItem>
                      <MenuItem value="2">Press 2</MenuItem>
                      <MenuItem value="3">Press 3</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <TextField name="transfer_target" label="Transfer Target (SIP/Phone)" placeholder="e.g. +27…" size="small" fullWidth />
                </Grid>
              </Grid>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Lead will be transferred to this target when the hotkey is pressed.</Typography>
            </Box>

          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} variant="outlined">Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}>{loading ? 'Creating…' : 'Create Campaign'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
