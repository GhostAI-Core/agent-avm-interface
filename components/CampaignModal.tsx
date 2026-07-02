'use client'
import { useState, useEffect, type ReactNode } from 'react'
import ResponsiveDialog from '@/components/ui/ResponsiveDialog'
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
import ScheduleIcon from '@mui/icons-material/Schedule'
import { WizardHeader, StepRail, SectionLabel } from '@/components/ui/WizardChrome'
import VoiceGenerator from '@/components/VoiceGenerator'
import { colors, semantic, radius } from '@/lib/tokens'
import { parseContacts } from '@/lib/parseCsv'
import { createClient } from '@/utils/supabase/client'
import type { Company } from '@/types'

interface Props {
  onClose: () => void
  onCreated: () => void
  companies: Company[]
  onNeedCompany?: () => void // open the company-create flow (parent wires this)
}

type VoiceMode = 'upload' | 'generate'

// Dial mode toggle → { agent, routing_mode }. Seeker/Grace are `script` (two-step consent
// subscribe). Lead Gen is `lead` (press-1 → lead, no STS/confirm) — gated until CallOps ships
// the `routing_mode="lead"` gate (openspec: campaign-dial-mode). Flip to true when it's live.
const LEAD_GEN_ENABLED = true
const DIAL_MODES = [
  { value: 'seeker', label: 'Seeker', agent: 'seeker', routing_mode: 'script' },
  { value: 'grace', label: 'Grace', agent: 'grace', routing_mode: 'script' },
  { value: 'lead_gen', label: 'Lead Gen', agent: 'lead_gen', routing_mode: 'lead' },
] as const
type ParsedContact = { phone: string; first_name?: string; last_name?: string }
type Trunk = { id: number; name: string; livekit_trunk_id: string; from_number: string }

const STEPS = ['Basics', 'Trunk', 'Voice', 'Contacts', 'Schedule']
const MAX_CSV_BYTES = 15 * 1024 * 1024
const MAX_VOICE_BYTES = 50 * 1024 * 1024
const VOICE_BUCKET = 'voice-recordings'
const DTMF_RESPONSE_SECONDS = 8 // assumed press-1/9 delay per call (decided 2026-06-18)

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

/** Read an audio file/URL's duration (seconds) client-side, or null if it can't be read. */
function measureAudioDuration(src: string): Promise<number | null> {
  return new Promise(resolve => {
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : null)
    a.onerror = () => resolve(null)
    a.src = src
  })
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
          display: 'flex', alignItems: 'center', gap: 1.75, px: 1.75, py: 1.5,
          border: `1px dashed ${selectedFile ? semantic.accent : colors.border3}`,
          borderRadius: `${radius.md}px`,
          bgcolor: selectedFile ? 'rgba(55,166,96,0.07)' : colors.bg2,
          cursor: 'pointer',
          transition: 'border-color .18s ease, background-color .18s ease, transform .18s ease, box-shadow .18s ease',
          '&:hover': {
            borderColor: semantic.accent, bgcolor: 'rgba(55,166,96,0.05)',
            transform: 'translateY(-1px)', boxShadow: `0 6px 18px -10px ${semantic.accentGlow}`,
          },
          '&:focus-visible': { outline: `2px solid ${semantic.accentBright}`, outlineOffset: 2 },
        }}
      >
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 36, height: 36, borderRadius: `${radius.sm}px`, flexShrink: 0,
          bgcolor: selectedFile ? 'rgba(55,166,96,0.16)' : colors.bg3,
          color: selectedFile ? semantic.accentBright : semantic.textSoft,
          transition: 'background-color .18s ease, color .18s ease',
        }}>
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
          <Chip size="small" label={formatSize(selectedFile.size)}
            sx={{ bgcolor: 'rgba(55,166,96,0.16)', color: semantic.accentBright, border: `1px solid rgba(55,166,96,0.35)`, fontWeight: 600 }} />
        )}
        <input type="file" name={name} accept={accept} hidden onChange={e => handleChange(e.target.files?.[0] ?? null)} />
      </Box>
      {hint && <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 0.25, display: 'block' }}>{hint}</Typography>}
    </Box>
  )
}

export default function CampaignModal({ onClose, onCreated, companies, onNeedCompany }: Props) {
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1 — basics
  const [name, setName] = useState('')
  const [companyId, setCompanyId] = useState<number | ''>('')
  const [product, setProduct] = useState('') // dial mode toggle: 'seeker' | 'grace' | 'lead_gen'

  // Step 2 — outbound trunk
  const [trunks, setTrunks] = useState<Trunk[]>([])
  const [sipTrunkId, setSipTrunkId] = useState('') // sip_trunks.id (integer FK, as string); '' = env default

  // Step 3 — voice (→ audio_path)
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('upload')
  const [voiceFile, setVoiceFile] = useState<File | null>(null)
  const [voiceRecordingUrl, setVoiceRecordingUrl] = useState<string | null>(null)
  const [voiceId, setVoiceId] = useState<string | null>(null) // Inworld voice id → campaigns.voice_id (generate mode only)
  const [scriptSeconds, setScriptSeconds] = useState<number | null>(null)

  // Step 4 — contacts
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [contacts, setContacts] = useState<ParsedContact[]>([])

  // Step 5 — schedule
  const [dialingSpeed, setDialingSpeed] = useState(1)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [windowStart, setWindowStart] = useState('08:00')
  const [windowEnd, setWindowEnd] = useState('20:00')

  const hasCompanies = companies.length > 0

  // Load the configured outbound trunks for the Trunk step. Uses the global trunk catalog
  // (`/api/trunks`) — the per-company endpoint returns nothing because trunks aren't
  // company-scoped in the data (company_id is null), which left the dropdown empty and produced
  // trunk-less campaigns that fail `/start` with campaign_missing_sip_trunk.
  useEffect(() => {
    let cancelled = false
    fetch('/api/trunks')
      .then(r => (r.ok ? r.json() : { trunks: [] }))
      .then(j => { if (!cancelled) setTrunks(j.trunks ?? []) })
      .catch(() => { /* leave empty → env default trunk */ })
    return () => { cancelled = true }
  }, [])

  // Measure the script's audio length (for the schedule estimate) whenever the source changes.
  useEffect(() => {
    let revoke: string | null = null
    const src = voiceMode === 'upload'
      ? (voiceFile ? (revoke = URL.createObjectURL(voiceFile)) : null)
      : voiceRecordingUrl
    let cancelled = false
    const measured = src ? measureAudioDuration(src) : Promise.resolve(null)
    measured.then(d => { if (!cancelled) setScriptSeconds(d) })
    return () => { cancelled = true; if (revoke) URL.revokeObjectURL(revoke) }
  }, [voiceMode, voiceFile, voiceRecordingUrl])

  // Run-time estimate: contacts × (script + press-1/9 delay) ÷ dialing speed.
  const perCallSeconds = (scriptSeconds ?? 0) + DTMF_RESPONSE_SECONDS
  const estimateSeconds = contacts.length * perCallSeconds / Math.max(1, dialingSpeed)

  function back() {
    setError('')
    setStep(s => Math.max(s - 1, 0))
  }

  function handleVoiceModeChange(_: React.MouseEvent<HTMLElement>, next: VoiceMode | null) {
    if (!next) return
    setVoiceMode(next)
    setError('')
    if (next === 'upload') { setVoiceRecordingUrl(null); setVoiceId(null) }
    else setVoiceFile(null)
  }

  async function handleCsvChange(file: File | null) {
    setError('')
    setCsvFile(file)
    if (!file) { setContacts([]); return }
    if (file.size > MAX_CSV_BYTES) {
      setError(`Contact list is too large (max ${MAX_CSV_BYTES / 1024 / 1024}MB).`)
      setContacts([]); return
    }
    try {
      const parsed = parseContacts(await file.text())
      if (parsed.length === 0) {
        setError('No valid contacts found. The CSV needs a "phone" column (also supports first_name, last_name).')
        setContacts([]); return
      }
      setContacts(parsed)
    } catch {
      setError('Could not read that file. Please upload a valid CSV.')
      setContacts([])
    }
  }

  // Essential fields per step. While anything's missing the step is blocked and the gaps are listed.
  function missingForStep(s: number): string[] {
    const m: string[] = []
    if (s === 0) {
      if (!name.trim()) m.push('Campaign name')
      if (!companyId) m.push('A company')
    }
    if (s === 2 && !voiceFile && !voiceRecordingUrl) m.push('A script — upload a recording or generate one')
    if (s === 3 && contacts.length === 0) m.push('A contact list (CSV)')
    return m
  }

  function next() {
    if (missingForStep(step).length) return
    setError('')
    setStep(s => Math.min(s + 1, STEPS.length - 1))
  }

  async function submit() {
    setError('')
    for (const s of [0, 2, 3]) {
      if (missingForStep(s).length) { setStep(s); return }
    }

    setLoading(true)
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        company_id: companyId,
        agent: (DIAL_MODES.find(m => m.value === product)?.agent) ?? null,
        routing_mode: DIAL_MODES.find(m => m.value === product)?.routing_mode,
        sip_trunk_id: sipTrunkId || null,
        dialing_speed: dialingSpeed,
        window_start: windowStart,
        window_end: windowEnd,
        start_date: startDate || null,
        end_date: endDate || null,
        contacts,
      }

      // Unified audio_path (issue #31): AI-generated → public URL; upload → private storage key.
      if (voiceMode === 'generate' && voiceRecordingUrl) {
        payload.audio_path = voiceRecordingUrl
        // callops matches this voice to its two-step-consent confirm audio. Uploads have no Inworld id.
        if (voiceId) payload.voice_id = voiceId
      } else if (voiceMode === 'upload' && voiceFile) {
        if (voiceFile.size > MAX_VOICE_BYTES) {
          setError(`Voice recording is too large (max ${MAX_VOICE_BYTES / 1024 / 1024}MB).`)
          setLoading(false); return
        }
        const ext = (voiceFile.name.split('.').pop() || 'mp4').toLowerCase()
        const path = `${crypto.randomUUID()}.${ext}`
        const supabase = createClient()
        const { error: upErr } = await supabase.storage
          .from(VOICE_BUCKET)
          .upload(path, voiceFile, { contentType: voiceFile.type || undefined, upsert: false })
        if (upErr) { setError(`Could not upload the voice recording: ${upErr.message}`); setLoading(false); return }
        payload.audio_path = path
      }

      const res = await fetch('/api/campaigns', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error || 'Failed to create campaign'); return }
      onCreated()
      onClose()
    } catch (err) {
      console.error('Create campaign failed:', err)
      setError('Something went wrong creating the campaign. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const isLast = step === STEPS.length - 1
  const blockedNoCompany = step === 0 && !hasCompanies
  const missing = missingForStep(step)
  const stepBlocked = blockedNoCompany || missing.length > 0

  return (
    <ResponsiveDialog open onClose={onClose} maxWidth="sm" fullWidth
      slotProps={{ paper: { sx: { overflow: 'hidden', borderRadius: `${radius.lg}px` } } }}>
      <WizardHeader
        icon={<CampaignIcon fontSize="small" />}
        title="New Campaign"
        subtitle="Basics → trunk → voice → contacts → schedule."
        onClose={onClose}
      />
      <StepRail steps={STEPS} active={step} />

      <DialogContent sx={{ pt: 3, maxHeight: step === 2 ? 'min(70vh, 560px)' : undefined, overflowY: step === 2 ? 'auto' : undefined }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Step 1 — Basics: name + company (required) + product */}
        <Box sx={{ display: step === 0 ? 'block' : 'none' }}>
          <Stack sx={{ gap: 1.5 }}>
            <SectionLabel>Basic Details</SectionLabel>
            {!hasCompanies && (
              <Alert severity="warning" action={
                onNeedCompany && <Button color="inherit" size="small" onClick={onNeedCompany}>Create company</Button>
              }>
                A campaign must belong to a company. Create one first.
              </Alert>
            )}
            <TextField label="Campaign Name" placeholder="e.g. 1Life BMI AI V5.0" size="small" fullWidth required
              value={name} onChange={e => setName(e.target.value)} />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 7 }}>
                <FormControl size="small" fullWidth required disabled={!hasCompanies}>
                  <InputLabel id="company-label">Company</InputLabel>
                  <Select labelId="company-label" label="Company" value={companyId}
                    onChange={e => setCompanyId(Number(e.target.value) || '')}>
                    {companies.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 5 }}>
                <Typography variant="caption" sx={{ color: semantic.textSoft, display: 'block', mb: 0.5 }}>Mode</Typography>
                <ToggleButtonGroup exclusive fullWidth size="small" value={product}
                  onChange={(_, next) => { if (next) setProduct(next) }}>
                  {DIAL_MODES.map(m => {
                    const disabled = m.value === 'lead_gen' && !LEAD_GEN_ENABLED
                    return (
                      <ToggleButton key={m.value} value={m.value} disabled={disabled}>
                        {m.label}{disabled ? ' · soon' : ''}
                      </ToggleButton>
                    )
                  })}
                </ToggleButtonGroup>
                {product === 'lead_gen' && (
                  <Typography variant="caption" sx={{ color: semantic.textSoft, display: 'block', mt: 0.5 }}>
                    Lead capture — a press of 1 marks the contact a lead (no product subscribe / consent step).
                  </Typography>
                )}
              </Grid>
            </Grid>
          </Stack>
        </Box>

        {/* Step 2 — Outbound Trunk */}
        <Box sx={{ display: step === 1 ? 'block' : 'none' }}>
          <Stack sx={{ gap: 1.5 }}>
            <SectionLabel>Outbound Trunk</SectionLabel>
            <FormControl size="small" fullWidth>
              <InputLabel id="trunk-label" shrink>Outbound Trunk</InputLabel>
              <Select labelId="trunk-label" label="Outbound Trunk" value={sipTrunkId} displayEmpty notched
                onChange={e => setSipTrunkId(e.target.value)}
                renderValue={(v) => {
                  if (!v) return <Box component="span" sx={{ color: semantic.textSoft }}>Default trunk (env)</Box>
                  const t = trunks.find(x => String(x.id) === v)
                  return t ? `${t.name} — ${t.from_number}` : v
                }}>
                <MenuItem value="">Default trunk (env)</MenuItem>
                {trunks.map(t => (
                  <MenuItem key={t.id} value={String(t.id)}>{t.name} — {t.from_number}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary">
              {trunks.length === 0
                ? 'No trunks configured — the campaign will dial via the default (env) trunk.'
                : 'The SIP outbound trunk this campaign dials through (caller ID comes from the trunk).'}
            </Typography>
          </Stack>
        </Box>

        {/* Step 3 — Voice (Script): upload or generate → audio_path */}
        <Box sx={{ display: step === 2 ? 'block' : 'none' }}>
          <Stack sx={{ gap: 2 }}>
            <SectionLabel>Voice (Script)</SectionLabel>
            <ToggleButtonGroup exclusive fullWidth size="small" value={voiceMode} onChange={handleVoiceModeChange}>
              <ToggleButton value="upload">Audio Upload</ToggleButton>
              <ToggleButton value="generate">
                <AutoAwesomeIcon sx={{ fontSize: 16, mr: 0.75 }} />
                Generate AI Script
              </ToggleButton>
            </ToggleButtonGroup>

            {voiceMode === 'upload' ? (
              <FileField name="voice_file" label="Audio Upload" accept="audio/*"
                icon={<GraphicEqIcon fontSize="small" />}
                hint="MP3 / WAV / MP4 audio played to the lead. Its length feeds the schedule estimate."
                file={voiceFile} onFileChange={setVoiceFile} />
            ) : (
              <VoiceGenerator key="voice-generator" campaignName={name}
                voiceRecordingUrl={voiceRecordingUrl} onVoiceRecordingUrlChange={setVoiceRecordingUrl}
                onVoiceIdChange={setVoiceId} disabled={loading} />
            )}

            {scriptSeconds !== null && (
              <Typography variant="caption" sx={{ color: semantic.accentBright }}>
                Script length: {formatDuration(scriptSeconds)}
              </Typography>
            )}
          </Stack>
        </Box>

        {/* Step 4 — Contacts */}
        <Box sx={{ display: step === 3 ? 'block' : 'none' }}>
          <Stack sx={{ gap: 1.5 }}>
            <SectionLabel>Contacts</SectionLabel>
            <FileField name="csv_file" label="Contact List (CSV)" accept=".csv" required
              icon={<UploadFileIcon fontSize="small" />}
              hint="Expected columns: phone, first_name, last_name"
              file={csvFile} onFileChange={handleCsvChange} />
            {contacts.length > 0 && (
              <Typography variant="caption" sx={{ color: semantic.accentBright }}>
                {contacts.length.toLocaleString()} valid contact{contacts.length === 1 ? '' : 's'} parsed.
              </Typography>
            )}
          </Stack>
        </Box>

        {/* Step 5 — Schedule (last, so it can estimate run time) */}
        <Box sx={{ display: step === 4 ? 'block' : 'none' }}>
          <Stack sx={{ gap: 2 }}>
            <SectionLabel>Schedule &amp; Speed</SectionLabel>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <TextField label="Dialing Speed (calls/sec)" type="number" size="small" fullWidth
                  value={dialingSpeed} onChange={e => setDialingSpeed(Math.max(1, Number(e.target.value) || 1))}
                  slotProps={{ htmlInput: { min: 1, max: 10 } }} />
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
              <Grid size={{ xs: 6, sm: 6 }}>
                <TextField label="Window Start" type="time" size="small" fullWidth
                  value={windowStart} onChange={e => setWindowStart(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={{ xs: 6, sm: 6 }}>
                <TextField label="Window End" type="time" size="small" fullWidth
                  value={windowEnd} onChange={e => setWindowEnd(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
            </Grid>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.75, borderRadius: `${radius.md}px`, bgcolor: colors.bg2, border: `1px solid ${colors.border3}` }}>
              <ScheduleIcon sx={{ color: semantic.accentBright }} />
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  Estimated run: ~{formatDuration(estimateSeconds)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {contacts.length.toLocaleString()} contacts × ({scriptSeconds !== null ? formatDuration(scriptSeconds) : 'no script'} + {DTMF_RESPONSE_SECONDS}s press delay) ÷ {dialingSpeed}/sec
                </Typography>
              </Box>
            </Box>
          </Stack>
        </Box>

        {!blockedNoCompany && missing.length > 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.25 }}>
              This step still needs:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {missing.map(x => <li key={x}><Typography variant="caption">{x}</Typography></li>)}
            </Box>
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.75, pt: 1 }}>
        {step > 0 && <Button onClick={back} variant="outlined" type="button">Back</Button>}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} variant="text" type="button" sx={{ color: semantic.textSoft }}>Cancel</Button>
        <Button onClick={isLast ? submit : next} variant="contained" disabled={loading || stepBlocked}>
          {isLast ? (loading ? 'Creating…' : 'Create Campaign') : 'Next'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  )
}
