'use client'
import { useEffect, useState, type ReactNode } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import CampaignIcon from '@mui/icons-material/Campaign'
import GraphicEqIcon from '@mui/icons-material/GraphicEq'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { WizardHeader, StepRail, SectionLabel } from '@/components/ui/WizardChrome'
import VoiceGenerator from '@/components/VoiceGenerator'
import { colors, semantic, radius } from '@/lib/tokens'
import { parseContacts } from '@/lib/parseCsv'
import { createClient } from '@/utils/supabase/client'

interface Props { onClose: () => void; onCreated: () => void }

type VoiceMode = 'upload' | 'generate'
interface Trunk { trunk_id: string; name: string; from_number: string | null }

const STEPS = ['Campaign', 'Schedule', 'Voice & Contacts']
const MAX_CSV_BYTES = 15 * 1024 * 1024 // 15MB upload cap
const MAX_VOICE_BYTES = 50 * 1024 * 1024 // 50MB voice-recording cap
const VOICE_BUCKET = 'voice-recordings'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function FileField({ name, label, accept, required, icon, hint, file, onFileChange }: {
  name: string
  label: string
  accept: string
  required?: boolean
  icon: ReactNode
  hint?: string
  file?: File | null
  onFileChange?: (file: File | null) => void
}) {
  const [internalFile, setInternalFile] = useState<File | null>(null)
  const isControlled = onFileChange !== undefined
  const selectedFile = isControlled ? (file ?? null) : internalFile

  function handleChange(next: File | null) {
    if (isControlled) onFileChange!(next)
    else setInternalFile(next)
  }

  return (
    <Box>
      <Box
        component="label"
        tabIndex={0}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.75,
          px: 1.75,
          py: 1.5,
          border: `1px dashed ${selectedFile ? semantic.accent : colors.border3}`,
          borderRadius: `${radius.md}px`,
          bgcolor: selectedFile ? 'rgba(55,166,96,0.07)' : colors.bg2,
          cursor: 'pointer',
          transition: 'border-color .18s ease, background-color .18s ease, transform .18s ease, box-shadow .18s ease',
          '&:hover': {
            borderColor: semantic.accent,
            bgcolor: 'rgba(55,166,96,0.05)',
            transform: 'translateY(-1px)',
            boxShadow: `0 6px 18px -10px ${semantic.accentGlow}`,
          },
          '&:focus-visible': { outline: `2px solid ${semantic.accentBright}`, outlineOffset: 2 },
        }}
      >
        <Box
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: `${radius.sm}px`, flexShrink: 0,
            bgcolor: selectedFile ? 'rgba(55,166,96,0.16)' : colors.bg3,
            color: selectedFile ? semantic.accentBright : semantic.textSoft,
            transition: 'background-color .18s ease, color .18s ease',
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" sx={{ color: semantic.textSoft, display: 'block', letterSpacing: '0.04em' }}>
            {label}{required ? ' *' : ''}
          </Typography>
          <Typography variant="body2" noWrap sx={{ color: selectedFile ? semantic.text : semantic.textMuted, fontWeight: selectedFile ? 600 : 400 }}>
            {selectedFile ? selectedFile.name : 'Drag in or click to choose a file'}
          </Typography>
        </Box>
        {selectedFile && (
          <Chip
            size="small"
            label={formatSize(selectedFile.size)}
            sx={{ bgcolor: 'rgba(55,166,96,0.16)', color: semantic.accentBright, border: `1px solid rgba(55,166,96,0.35)`, fontWeight: 600 }}
          />
        )}
        <input
          type="file"
          name={name}
          accept={accept}
          hidden
          onChange={e => handleChange(e.target.files?.[0] ?? null)}
        />
      </Box>
      {hint && <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 0.25, display: 'block' }}>{hint}</Typography>}
    </Box>
  )
}

export default function CampaignModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('upload')
  const [voiceFile, setVoiceFile] = useState<File | null>(null)
  const [voiceRecordingUrl, setVoiceRecordingUrl] = useState<string | null>(null)
  const [trunks, setTrunks] = useState<Trunk[]>([])
  const [trunkId, setTrunkId] = useState('')

  // Load the live SIP trunks callops can dial through. A campaign with no trunk is
  // rejected by callops on start, so when only one exists we pre-select it.
  useEffect(() => {
    let active = true
    fetch('/api/trunks')
      .then(r => r.json())
      .then((data: { trunks?: Trunk[] }) => {
        if (!active) return
        const list = data.trunks ?? []
        setTrunks(list)
        if (list.length === 1) setTrunkId(list[0].trunk_id)
      })
      .catch(() => { /* picker stays empty; create route falls back to callops default */ })
    return () => { active = false }
  }, [])

  function back() {
    setError('')
    setStep(s => Math.max(s - 1, 0))
  }

  function handleVoiceModeChange(_: React.MouseEvent<HTMLElement>, next: VoiceMode | null) {
    if (!next) return
    setVoiceMode(next)
    setError('')
    if (next === 'upload') {
      setVoiceRecordingUrl(null)
    } else {
      setVoiceFile(null)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    // Step rail: advance instead of submitting until the last step.
    if (step < STEPS.length - 1) {
      if (step === 0 && !name.trim()) {
        setError('Please name the campaign before continuing.')
        return
      }
      setStep(step + 1)
      return
    }

    const formData = new FormData(e.currentTarget)
    const payload: Record<string, unknown> = Object.fromEntries(formData.entries())
    delete payload.csv_file
    delete payload.voice_file

    // callops dials through this trunk; a campaign without one fails to start.
    if (trunks.length > 0 && !trunkId) {
      setError('Please choose a SIP trunk — the campaign can’t place calls without one.')
      return
    }
    payload.sip_trunk_id = trunkId || null

    const csvFile = formData.get('csv_file') as File | null
    if (!csvFile || csvFile.size === 0) {
      setError('Please choose a contact list (CSV) to create the campaign.')
      return
    }
    if (csvFile.size > MAX_CSV_BYTES) {
      setError(`Contact list is too large (max ${MAX_CSV_BYTES / 1024 / 1024}MB).`)
      return
    }

    setLoading(true)
    try {
      const contacts = parseContacts(await csvFile.text())
      if (contacts.length === 0) {
        setError('No valid contacts found. The CSV needs a "phone" column (also supports first_name, last_name).')
        setLoading(false)
        return
      }
      payload.contacts = contacts

      if (voiceMode === 'generate' && voiceRecordingUrl) {
        payload.voice_recording_url = voiceRecordingUrl
      } else if (voiceMode === 'upload') {
        const uploadFile = voiceFile ?? (formData.get('voice_file') as File | null)
        if (uploadFile && uploadFile.size > 0) {
          if (uploadFile.size > MAX_VOICE_BYTES) {
            setError(`Voice recording is too large (max ${MAX_VOICE_BYTES / 1024 / 1024}MB).`)
            return
          }
          const ext = (uploadFile.name.split('.').pop() || 'mp4').toLowerCase()
          const path = `${crypto.randomUUID()}.${ext}`
          const supabase = createClient()
          const { error: upErr } = await supabase.storage
            .from(VOICE_BUCKET)
            .upload(path, uploadFile, { contentType: uploadFile.type || undefined, upsert: false })
          if (upErr) {
            setError(`Could not upload the voice recording: ${upErr.message}`)
            return
          }
          payload.voice_path = path
        }
      }

      const res = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Failed to create campaign')
        return
      }
      onCreated()
      onClose()
    } catch (err) {
      console.error('Create campaign failed:', err)
      setError('Could not read that file. Please upload a valid CSV.')
    } finally {
      setLoading(false)
    }
  }

  const isLast = step === STEPS.length - 1

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { overflow: 'hidden', borderRadius: `${radius.lg}px` } } }}
    >
      <WizardHeader
        icon={<CampaignIcon fontSize="small" />}
        title="New Campaign"
        subtitle="Set up dialing, schedule, and your contact list."
        onClose={onClose}
      />
      <StepRail steps={STEPS} active={step} />

      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 3, maxHeight: step === 2 ? 'min(70vh, 560px)' : undefined, overflowY: step === 2 ? 'auto' : undefined }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {/* Step 1 — Campaign (kept mounted; toggled so FormData stays intact) */}
          <Box sx={{ display: step === 0 ? 'block' : 'none' }}>
            <Stack sx={{ gap: 1.5 }}>
              <SectionLabel>Campaign</SectionLabel>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <TextField name="name" label="Campaign Name" placeholder="e.g. 1Life BMI AI V5.0" size="small" fullWidth required
                    value={name} onChange={e => setName(e.target.value)} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="agent-label" shrink>Agent (optional)</InputLabel>
                    <Select labelId="agent-label" name="agent" label="Agent (optional)" defaultValue="" displayEmpty notched
                      renderValue={(v) => (v ? (v === 'seeker' ? 'Seeker' : 'Grace') : <Box component="span" sx={{ color: semantic.textSoft }}>Auto</Box>)}
                    >
                      <MenuItem value="">Auto</MenuItem>
                      <MenuItem value="seeker">Seeker</MenuItem>
                      <MenuItem value="grace">Grace</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <FormControl size="small" fullWidth required={trunks.length > 0}>
                    <InputLabel id="trunk-label" shrink>SIP Trunk (caller ID)</InputLabel>
                    <Select labelId="trunk-label" label="SIP Trunk (caller ID)" displayEmpty notched
                      value={trunkId} onChange={e => setTrunkId(e.target.value)}
                      renderValue={(v) => {
                        if (!v) return <Box component="span" sx={{ color: semantic.textSoft }}>{trunks.length ? 'Select a trunk…' : 'No trunks available'}</Box>
                        const t = trunks.find(x => x.trunk_id === v)
                        return t ? `${t.name}${t.from_number ? ` — ${t.from_number}` : ''}` : v
                      }}
                    >
                      {trunks.map(t => (
                        <MenuItem key={t.trunk_id} value={t.trunk_id}>
                          {t.name}{t.from_number ? ` — ${t.from_number}` : ''}
                        </MenuItem>
                      ))}
                    </Select>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 0.25 }}>
                      The number leads see and the carrier route used to dial.
                    </Typography>
                  </FormControl>
                </Grid>
              </Grid>
            </Stack>
          </Box>

          {/* Step 2 — Schedule & routing */}
          <Box sx={{ display: step === 1 ? 'block' : 'none' }}>
            <Stack sx={{ gap: 3 }}>
              <Stack sx={{ gap: 1.5 }}>
                <SectionLabel>Schedule &amp; Speed</SectionLabel>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField name="dialing_speed" label="Dialing Speed (calls/sec)" type="number" size="small" fullWidth defaultValue="1" slotProps={{ htmlInput: { min: 1, max: 10 } }} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField name="window_start" label="Window Start" type="time" size="small" fullWidth defaultValue="08:00" slotProps={{ inputLabel: { shrink: true } }} />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField name="window_end" label="Window End" type="time" size="small" fullWidth defaultValue="20:00" slotProps={{ inputLabel: { shrink: true } }} />
                  </Grid>
                </Grid>
              </Stack>

              <Stack sx={{ gap: 1.5 }}>
                <SectionLabel>Concurrency &amp; Retries</SectionLabel>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField name="max_concurrent" label="Max simultaneous calls" type="number" size="small" fullWidth defaultValue="5" slotProps={{ htmlInput: { min: 1, max: 100 } }} helperText="Callops won't exceed this" />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField name="max_retries" label="Retry attempts" type="number" size="small" fullWidth defaultValue="2" slotProps={{ htmlInput: { min: 0, max: 10 } }} helperText="No-answer / busy" />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField name="retry_cooldown_seconds" label="Retry wait (sec)" type="number" size="small" fullWidth defaultValue="3600" slotProps={{ htmlInput: { min: 0 } }} helperText="Min gap between retries" />
                  </Grid>
                </Grid>
              </Stack>
            </Stack>
          </Box>

          {/* Step 3 — Voice & contacts */}
          <Box sx={{ display: step === 2 ? 'block' : 'none' }}>
            <Stack sx={{ gap: 2 }}>
              <SectionLabel>Voice &amp; Contacts</SectionLabel>

              <ToggleButtonGroup
                exclusive
                fullWidth
                size="small"
                value={voiceMode}
                onChange={handleVoiceModeChange}
              >
                <ToggleButton value="upload">Upload recording</ToggleButton>
                <ToggleButton value="generate">
                  <AutoAwesomeIcon sx={{ fontSize: 16, mr: 0.75 }} />
                  Generate with AI
                </ToggleButton>
              </ToggleButtonGroup>

              {voiceMode === 'upload' ? (
                <FileField
                  name="voice_file"
                  label="Voice Recording"
                  accept="audio/*"
                  icon={<GraphicEqIcon fontSize="small" />}
                  hint="Optional — MP3 / WAV / MP4 audio played to the lead."
                  file={voiceFile}
                  onFileChange={setVoiceFile}
                />
              ) : (
                <VoiceGenerator
                  key="voice-generator"
                  campaignName={name}
                  voiceRecordingUrl={voiceRecordingUrl}
                  onVoiceRecordingUrlChange={setVoiceRecordingUrl}
                  disabled={loading}
                />
              )}

              <FileField name="csv_file" label="Contact List (CSV)" accept=".csv" required icon={<UploadFileIcon fontSize="small" />} hint="Expected columns: phone, first_name, last_name" />
            </Stack>
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.75, pt: 1 }}>
          {step > 0 && <Button onClick={back} variant="outlined" type="button">Back</Button>}
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose} variant="text" type="button" sx={{ color: semantic.textSoft }}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {isLast ? (loading ? 'Creating…' : 'Create Campaign') : 'Next'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
