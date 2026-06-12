'use client'
import { useState, type ReactNode } from 'react'
import Dialog from '@mui/material/Dialog'
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
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import CampaignIcon from '@mui/icons-material/Campaign'
import CloseIcon from '@mui/icons-material/Close'
import GraphicEqIcon from '@mui/icons-material/GraphicEq'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import { colors, semantic, radius } from '@/lib/tokens'
import { parseContacts } from '@/lib/parseCsv'
import { createClient } from '@/utils/supabase/client'

interface Props { onClose: () => void; onCreated: () => void }

const MAX_CSV_BYTES = 15 * 1024 * 1024 // 15MB upload cap
const MAX_VOICE_BYTES = 50 * 1024 * 1024 // 50MB voice-recording cap
const VOICE_BUCKET = 'voice-recordings'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ width: 3, height: 13, borderRadius: 2, bgcolor: semantic.accent, boxShadow: `0 0 8px ${semantic.accentGlow}55` }} />
      <Typography variant="caption" sx={{ color: semantic.textMuted, textTransform: 'uppercase', letterSpacing: '0.13em', fontWeight: 700 }}>
        {children}
      </Typography>
    </Box>
  )
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

export default function CampaignModal({ onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const formData = new FormData(e.currentTarget)
    const payload: Record<string, unknown> = Object.fromEntries(formData.entries())
    delete payload.csv_file
    delete payload.voice_file

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

      // Upload the voice recording (if any) to the private Supabase Storage bucket.
      // The campaign keeps only the object path; the dial route signs it at call time.
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

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { overflow: 'hidden', borderRadius: `${radius.lg}px` } } }}
    >
      {/* Header — gradient glow band */}
      <Box
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 1.75,
          px: 3,
          pt: 2.75,
          pb: 2.25,
          background: `linear-gradient(135deg, rgba(55,166,96,0.16) 0%, rgba(55,166,96,0.03) 48%, transparent 100%)`,
          '&::after': {
            content: '""',
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '1px',
            background: `linear-gradient(90deg, ${semantic.accent} 0%, rgba(55,166,96,0.15) 40%, ${colors.border1} 100%)`,
          },
        }}
      >
        <Box
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 42, height: 42, borderRadius: `${radius.md}px`, flexShrink: 0,
            bgcolor: 'rgba(55,166,96,0.16)', border: `1px solid rgba(55,166,96,0.4)`, color: semantic.accentBright,
            boxShadow: `0 0 18px -4px ${semantic.accentGlow}66`,
          }}
        >
          <CampaignIcon fontSize="small" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 19, lineHeight: 1.2, letterSpacing: '-0.01em' }}>New Campaign</Typography>
          <Typography variant="body2" color="text.secondary">Set up dialing, schedule, and your contact list.</Typography>
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Close" sx={{ color: semantic.textSoft, alignSelf: 'flex-start', mt: -0.5 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <form onSubmit={handleSubmit}>
        <DialogContent sx={{ pt: 3 }}>
          <Stack sx={{ gap: 3 }}>
            {error && <Alert severity="error">{error}</Alert>}

            {/* Campaign */}
            <Stack sx={{ gap: 1.5 }}>
              <SectionLabel>Campaign</SectionLabel>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <TextField name="name" label="Campaign Name" placeholder="e.g. 1Life BMI AI V5.0" size="small" fullWidth required />
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
              </Grid>
            </Stack>

            {/* Schedule & speed */}
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

            {/* Media & contacts */}
            <Stack sx={{ gap: 1.5 }}>
              <SectionLabel>Voice &amp; Contacts</SectionLabel>
              <FileField name="voice_file" label="Voice Recording" accept="audio/*" icon={<GraphicEqIcon fontSize="small" />} hint="Optional — MP3 / WAV / MP4 audio played to the lead." />
              <FileField name="csv_file" label="Contact List (CSV)" accept=".csv" required icon={<UploadFileIcon fontSize="small" />} hint="Expected columns: phone, first_name, last_name" />
            </Stack>

          </Stack>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.75, pt: 1 }}>
          <Button onClick={onClose} variant="outlined">Cancel</Button>
          <Button type="submit" variant="contained" disabled={loading}>{loading ? 'Creating…' : 'Create Campaign'}</Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
