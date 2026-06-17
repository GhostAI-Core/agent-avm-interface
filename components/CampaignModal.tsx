'use client'
import { useState, type ReactNode } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import CampaignIcon from '@mui/icons-material/Campaign'
import GraphicEqIcon from '@mui/icons-material/GraphicEq'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { WizardHeader, StepRail, SectionLabel } from '@/components/ui/WizardChrome'
import { colors, semantic, radius } from '@/lib/tokens'
import { parseContacts } from '@/lib/parseCsv'
import { createClient } from '@/utils/supabase/client'
import { useTelephonyStore } from '@/lib/telephony-mock'

interface Props { onClose: () => void; onCreated: () => void; onGoToTelephony?: () => void }

const STEPS = ['Campaign', 'Schedule', 'Voice & Contacts']
const MAX_CSV_BYTES = 15 * 1024 * 1024 // 15MB upload cap
const MAX_VOICE_BYTES = 50 * 1024 * 1024 // 50MB voice-recording cap
const MAX_SCRIPT_CHARS = 2000 // Inworld hard limit
const VOICE_BUCKET = 'voice-recordings'

// Inworld voices (same base id, different speaker). Charlotte is the default.
const INWORLD_VOICES = [
  { id: 'default-hzau9tlenfqr0yc2k7co6g__charlotte', label: 'Charlotte' },
  { id: 'default-hzau9tlenfqr0yc2k7co6g__jono', label: 'Jono' },
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function FileField({ name, label, accept, required, icon, hint }: {
  name: string
  label: string
  accept: string
  required?: boolean
  icon: ReactNode
  hint?: string
}) {
  const [file, setFile] = useState<File | null>(null)
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
          border: `1px dashed ${file ? semantic.accent : colors.border3}`,
          borderRadius: `${radius.md}px`,
          bgcolor: file ? 'rgba(55,166,96,0.07)' : colors.bg2,
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
            bgcolor: file ? 'rgba(55,166,96,0.16)' : colors.bg3,
            color: file ? semantic.accentBright : semantic.textSoft,
            transition: 'background-color .18s ease, color .18s ease',
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="caption" sx={{ color: semantic.textSoft, display: 'block', letterSpacing: '0.04em' }}>
            {label}{required ? ' *' : ''}
          </Typography>
          <Typography variant="body2" noWrap sx={{ color: file ? semantic.text : semantic.textMuted, fontWeight: file ? 600 : 400 }}>
            {file ? file.name : 'Drag in or click to choose a file'}
          </Typography>
        </Box>
        {file && (
          <Chip
            size="small"
            label={formatSize(file.size)}
            sx={{ bgcolor: 'rgba(55,166,96,0.16)', color: semantic.accentBright, border: `1px solid rgba(55,166,96,0.35)`, fontWeight: 600 }}
          />
        )}
        <input type="file" name={name} accept={accept} hidden onChange={e => setFile(e.target.files?.[0] ?? null)} />
      </Box>
      {hint && <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 0.25, display: 'block' }}>{hint}</Typography>}
    </Box>
  )
}

export default function CampaignModal({ onClose, onCreated, onGoToTelephony }: Props) {
  const store = useTelephonyStore()
  const enabledAgents = store.agents.filter(a => a.enabled)
  const enabledTrunks = store.trunks.filter(t => t.enabled)
  const telephonyReady = enabledAgents.length > 0 && enabledTrunks.length > 0

  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [agentName, setAgentName] = useState('')
  const [trunkId, setTrunkId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [warnOpen, setWarnOpen] = useState(!telephonyReady)

  // Voice generation (Inworld)
  const [voiceId, setVoiceId] = useState(INWORLD_VOICES[0].id)
  const [script, setScript] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [genVoicePath, setGenVoicePath] = useState<string | null>(null)
  const [genVoiceUrl, setGenVoiceUrl] = useState<string | null>(null)

  function back() {
    setError('')
    setStep(s => Math.max(s - 1, 0))
  }

  async function generateVoice() {
    if (!script.trim()) { setGenError('Enter a script first.'); return }
    setGenError(''); setGenerating(true); setGenVoiceUrl(null); setGenVoicePath(null)
    try {
      const res = await fetch('/api/voice/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: script.trim(), voiceId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setGenError(json.error || 'Voice generation failed.'); return }
      setGenVoicePath(json.voice_path)
      setGenVoiceUrl(json.signedUrl ?? null)
    } catch {
      setGenError('Network error while generating the voice.')
    } finally {
      setGenerating(false)
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
    delete payload.voice_script
    // Telephony-sourced selections (free-text agent + LiveKit trunk id).
    payload.agent_name = agentName || ''
    payload.sip_trunk_id = trunkId || ''

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

      // Voice: a generated recording takes precedence; otherwise upload the chosen file.
      if (genVoicePath) {
        payload.voice_path = genVoicePath
      } else {
        const voiceFile = formData.get('voice_file') as File | null
        if (voiceFile && voiceFile.size > 0) {
          if (voiceFile.size > MAX_VOICE_BYTES) {
            setError(`Voice recording is too large (max ${MAX_VOICE_BYTES / 1024 / 1024}MB).`)
            return
          }
          const ext = (voiceFile.name.split('.').pop() || 'mp4').toLowerCase()
          const path = `${crypto.randomUUID()}.${ext}`
          const supabase = createClient()
          const { error: upErr } = await supabase.storage
            .from(VOICE_BUCKET)
            .upload(path, voiceFile, { contentType: voiceFile.type || undefined, upsert: false })
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
      slotProps={{ paper: { sx: { overflow: 'hidden', borderRadius: `${radius.lg}px`, display: 'flex', flexDirection: 'column', maxHeight: '92vh' } } }}
    >
      <WizardHeader
        icon={<CampaignIcon fontSize="small" />}
        title="New Campaign"
        subtitle="Set up dialing, schedule, and your contact list."
        onClose={onClose}
      />
      <StepRail steps={STEPS} active={step} />

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <DialogContent sx={{ pt: 3, flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {!telephonyReady && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Telephony isn’t set up — add a trunk and an agent in Telephony so they’re selectable here.
            </Alert>
          )}

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
                    <InputLabel id="agent-label" shrink>Agent</InputLabel>
                    <Select labelId="agent-label" label="Agent" value={agentName} displayEmpty notched
                      onChange={(e) => setAgentName(e.target.value)}
                      renderValue={(v) => (v ? v : <Box component="span" sx={{ color: semantic.textSoft }}>Auto</Box>)}
                    >
                      <MenuItem value="">Auto</MenuItem>
                      {enabledAgents.map(a => <MenuItem key={a.id} value={a.name}>{a.name}</MenuItem>)}
                    </Select>
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
                <SectionLabel>Outbound trunk</SectionLabel>
                <FormControl size="small" fullWidth>
                  <InputLabel id="trunk-label" shrink>Trunk</InputLabel>
                  <Select labelId="trunk-label" label="Trunk" value={trunkId} displayEmpty notched
                    onChange={(e) => setTrunkId(e.target.value)}
                    renderValue={(v) => {
                      const t = enabledTrunks.find(x => (x.trunk_id || x.id) === v)
                      return t ? t.name : <Box component="span" sx={{ color: semantic.textSoft }}>Default (server)</Box>
                    }}
                  >
                    <MenuItem value="">Default (server)</MenuItem>
                    {enabledTrunks.map(t => (
                      <MenuItem key={t.id} value={t.trunk_id || t.id}>{t.name}{t.trunk_id ? ` · ${t.trunk_id}` : ''}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            </Stack>
          </Box>

          {/* Step 3 — Voice & contacts */}
          <Box sx={{ display: step === 2 ? 'block' : 'none' }}>
            <Stack sx={{ gap: 2 }}>
              <SectionLabel>Voice</SectionLabel>

              {/* Generate from a script via Inworld */}
              <Stack sx={{ gap: 1.5 }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormControl size="small" fullWidth>
                      <InputLabel id="voice-label">Voice</InputLabel>
                      <Select labelId="voice-label" label="Voice" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
                        {INWORLD_VOICES.map(v => <MenuItem key={v.id} value={v.id}>{v.label}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 8 }}>
                    <Button variant="contained" fullWidth disabled={generating || !script.trim()}
                      onClick={generateVoice}
                      startIcon={generating ? <CircularProgress size={16} /> : <GraphicEqIcon fontSize="small" />}
                      sx={{ height: '100%' }}>
                      {generating ? 'Generating…' : 'Generate voice'}
                    </Button>
                  </Grid>
                </Grid>
                <TextField
                  name="voice_script"
                  label="Script"
                  placeholder="What the assistant says to the lead…"
                  multiline minRows={3} fullWidth size="small"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  slotProps={{ htmlInput: { maxLength: MAX_SCRIPT_CHARS } }}
                  helperText={`${script.length}/${MAX_SCRIPT_CHARS}`}
                />
                {genError && <Alert severity="error">{genError}</Alert>}
                {genVoicePath && (
                  <Alert severity="success" sx={{ '& .MuiAlert-message': { width: '100%' } }}>
                    Voice generated — this recording will be used for the campaign.
                    {genVoiceUrl && (
                      <Box component="audio" controls src={genVoiceUrl} sx={{ width: '100%', mt: 1 }} />
                    )}
                  </Alert>
                )}
              </Stack>

              <Divider sx={{ '&::before, &::after': { borderColor: colors.border2 } }}>
                <Typography variant="caption" sx={{ color: semantic.textSoft }}>or upload audio</Typography>
              </Divider>

              <FileField name="voice_file" label="Voice Recording" accept="audio/*" icon={<GraphicEqIcon fontSize="small" />} hint={genVoicePath ? 'Ignored — a generated voice is selected above.' : 'Optional — MP3 / WAV / MP4 audio played to the lead.'} />

              <SectionLabel>Contacts</SectionLabel>
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

      {/* Telephony-not-configured warning */}
      <Dialog open={warnOpen} onClose={() => setWarnOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Telephony not set up</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            You haven’t configured any enabled {enabledTrunks.length === 0 ? 'trunks' : 'agents'} in Telephony yet.
            Set them up first so they’re selectable when creating this campaign.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setWarnOpen(false)}>Continue anyway</Button>
          {onGoToTelephony && (
            <Button variant="contained" onClick={() => { onGoToTelephony(); onClose() }}>Set up Telephony</Button>
          )}
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}
