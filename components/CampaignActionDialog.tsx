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
import Grid from '@mui/material/Grid'
import type { Campaign, Company } from '@/types'
import { parseContacts } from '@/lib/parseCsv'
import VoiceGenerator from '@/components/VoiceGenerator'

type Mode = 'edit' | 'reuse'
type SavedScript = { storageKey: string; publicUrl: string; name: string; lastModified: string | null }
type Trunk = { id: number; name: string; livekit_trunk_id: string; from_number: string }

/** Coerce a stored date (ISO timestamp or date) into the YYYY-MM-DD a date input wants. */
function toDateInput(v: string | null | undefined): string {
  return v ? v.slice(0, 10) : ''
}

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

  // Edit-mode fields mirroring the campaigns table (name, agent, company, speed, window).
  // Reuse mode never reads these — its payload carries the source campaign's values verbatim.
  const [agent, setAgent] = useState<string>(campaign.agent ?? '')
  const [companyId, setCompanyId] = useState<number | ''>(campaign.company_id ?? '')
  const [dialingSpeed, setDialingSpeed] = useState<number>(campaign.dialing_speed ?? 1)
  const [windowStart, setWindowStart] = useState<string>(campaign.time_window_start ?? '')
  const [windowEnd, setWindowEnd] = useState<string>(campaign.time_window_end ?? '')
  const [sipTrunkId, setSipTrunkId] = useState<string>(campaign.sip_trunk_id != null ? String(campaign.sip_trunk_id) : '')
  const [startDate, setStartDate] = useState<string>(toDateInput(campaign.start_date))
  const [endDate, setEndDate] = useState<string>(toDateInput(campaign.end_date))
  const [companies, setCompanies] = useState<Company[]>([])
  const [trunks, setTrunks] = useState<Trunk[]>([])

  // Load the saved S3 scripts for the dropdown.
  useEffect(() => {
    let cancelled = false
    fetch('/api/scripts')
      .then(r => (r.ok ? r.json() : { scripts: [] }))
      .then(j => { if (!cancelled) setScripts(j.scripts ?? []) })
      .catch(() => { /* leave empty → paste a URL instead */ })
    return () => { cancelled = true }
  }, [])

  // Load companies + trunks for the edit-mode dropdowns (same sources as the create modal).
  useEffect(() => {
    if (mode !== 'edit') return
    let cancelled = false
    fetch('/api/companies')
      .then(r => (r.ok ? r.json() : { companies: [] }))
      .then(j => { if (!cancelled) setCompanies(j.companies ?? []) })
      .catch(() => { /* leave empty → dropdown shows the current/empty company */ })
    fetch('/api/trunks')
      .then(r => (r.ok ? r.json() : { trunks: [] }))
      .then(j => { if (!cancelled) setTrunks(j.trunks ?? []) })
      .catch(() => { /* leave empty → keep current/default trunk */ })
    return () => { cancelled = true }
  }, [mode])

  async function submit() {
    setLoading(true); setError('')
    try {
      if (mode === 'edit') {
        const res = await fetch(`/api/campaigns/${campaign.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            agent: agent || null,
            company_id: companyId === '' ? null : companyId,
            dialing_speed: dialingSpeed,
            time_window_start: windowStart,
            time_window_end: windowEnd,
            sip_trunk_id: sipTrunkId === '' ? null : Number(sipTrunkId),
            start_date: startDate || null,
            end_date: endDate || null,
            audio_path: scriptUrl,
          }),
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
        {mode === 'edit' ? 'Edit Campaign' : 'Reuse as Template'}
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

          {mode === 'edit' && (
            <>
              <TextField label="Campaign Name" value={name} onChange={e => setName(e.target.value)} fullWidth size="small" required />
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 7 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="edit-company-label">Company</InputLabel>
                    <Select labelId="edit-company-label" label="Company" value={companyId}
                      onChange={e => setCompanyId(Number(e.target.value) || '')} displayEmpty>
                      <MenuItem value=""><em>No company</em></MenuItem>
                      {companies.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 5 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="edit-agent-label">Product</InputLabel>
                    <Select labelId="edit-agent-label" label="Product" value={agent} displayEmpty
                      onChange={e => setAgent(e.target.value)}>
                      <MenuItem value="">Auto</MenuItem>
                      <MenuItem value="seeker">Seeker</MenuItem>
                      <MenuItem value="grace">Grace</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField label="Dialing Speed (calls/sec)" type="number" size="small" fullWidth
                    value={dialingSpeed} onChange={e => setDialingSpeed(Math.max(1, Number(e.target.value) || 1))}
                    slotProps={{ htmlInput: { min: 1, max: 10 } }} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField label="Window Start" type="time" size="small" fullWidth
                    value={windowStart} onChange={e => setWindowStart(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField label="Window End" type="time" size="small" fullWidth
                    value={windowEnd} onChange={e => setWindowEnd(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="edit-trunk-label" shrink>Outbound Trunk</InputLabel>
                    <Select labelId="edit-trunk-label" label="Outbound Trunk" value={sipTrunkId} displayEmpty notched
                      onChange={e => setSipTrunkId(e.target.value)}
                      renderValue={(v) => {
                        if (!v) return <em>Default trunk (env)</em>
                        const t = trunks.find(x => String(x.id) === v)
                        return t ? `${t.name} — ${t.from_number}` : v
                      }}>
                      <MenuItem value=""><em>Default trunk (env)</em></MenuItem>
                      {trunks.map(t => <MenuItem key={t.id} value={String(t.id)}>{t.name} — {t.from_number}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField label="Start Date" type="date" size="small" fullWidth
                    value={startDate} onChange={e => setStartDate(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField label="End Date" type="date" size="small" fullWidth
                    value={endDate} onChange={e => setEndDate(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }} />
                </Grid>
              </Grid>
            </>
          )}

          {/* Edit: full voice editor — click a saved script to load its text + voice, edit it,
              and generate a new voice. The saved audio URL becomes this campaign's audio_path. */}
          {mode === 'edit' && (
            <VoiceGenerator
              campaignName={campaign.name}
              voiceRecordingUrl={scriptUrl || null}
              onVoiceRecordingUrlChange={url => setScriptUrl(url ?? '')}
              disabled={loading}
            />
          )}

          {/* Reuse: a quick saved-script picker (no editing — the template just points at audio). */}
          {mode === 'reuse' && (
            <FormControl fullWidth size="small" disabled={scripts.length === 0}>
              <InputLabel id="script-label">Saved script (S3)</InputLabel>
              <Select labelId="script-label" label="Saved script (S3)" value={dropdownValue}
                onChange={e => setScriptUrl(e.target.value)} displayEmpty>
                <MenuItem value=""><em>{scripts.length === 0 ? 'No saved scripts' : 'Choose a saved script…'}</em></MenuItem>
                {scripts.map(s => <MenuItem key={s.storageKey} value={s.publicUrl}>{s.name}</MenuItem>)}
              </Select>
            </FormControl>
          )}

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
