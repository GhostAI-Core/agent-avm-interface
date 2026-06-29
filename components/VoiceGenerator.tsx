'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import FormControl from '@mui/material/FormControl'
import Grid from '@mui/material/Grid'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import SaveIcon from '@mui/icons-material/Save'
import {
  ethnicities,
  ethnicityLabel,
  findVoice,
  genderLabel,
  genders,
  type InworldVoice,
  type VoiceEthnicity,
  type VoiceGender,
  voices,
} from '@/lib/inworld-voices'

interface Props {
  campaignName: string
  voiceRecordingUrl: string | null
  onVoiceRecordingUrlChange: (url: string | null) => void
  /** Surfaces the chosen Inworld voice id so the campaign can persist `voice_id` (callops confirm-audio match). */
  onVoiceIdChange?: (voiceId: string | null) => void
  disabled?: boolean
}

type SavedVoiceScript = {
  id: number
  text: string
  voice_id: string | null
  audio_url: string | null
  campaign_name: string | null
  created_at: string
}

function base64ToBlob(base64: string, contentType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: contentType })
}

export default function VoiceGenerator({
  campaignName,
  voiceRecordingUrl,
  onVoiceRecordingUrlChange,
  onVoiceIdChange,
  disabled,
}: Props) {
  const defaultGender = genders()[0] ?? 'female'
  const defaultEthnicity = ethnicities(defaultGender)[0] ?? 'white'
  const defaultVoice = voices(defaultGender, defaultEthnicity)[0]

  const [gender, setGender] = useState<VoiceGender>(defaultGender)
  const [ethnicity, setEthnicity] = useState<VoiceEthnicity>(defaultEthnicity)
  const [voiceId, setVoiceId] = useState(defaultVoice?.voiceId ?? '')
  const [script, setScript] = useState('')
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState('')
  const [savedScripts, setSavedScripts] = useState<SavedVoiceScript[]>([])

  const sampleRef = useRef<HTMLAudioElement>(null)
  const generatedRef = useRef<HTMLAudioElement>(null)
  const bubbleRef = useRef<HTMLAudioElement>(null)

  // Reuse bubbles: previously-saved scripts (text + voice + audio), newest first.
  function refreshSavedScripts() {
    fetch('/api/voice-scripts')
      .then(r => (r.ok ? r.json() : { scripts: [] }))
      .then(j => setSavedScripts(Array.isArray(j.scripts) ? j.scripts : []))
      .catch(() => { /* ignore — the bubbles just won't show */ })
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/voice-scripts')
      .then(r => (r.ok ? r.json() : { scripts: [] }))
      .then(j => { if (!cancelled) setSavedScripts(Array.isArray(j.scripts) ? j.scripts : []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const selectedVoice = useMemo(() => findVoice(voiceId), [voiceId])
  const ethnicityOptions = useMemo(() => ethnicities(gender), [gender])
  const voiceOptions = useMemo(() => voices(gender, ethnicity), [gender, ethnicity])

  const clearGenerated = useCallback(() => {
    setAudioBlob(null)
    setAudioUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setSavedMessage('')
    onVoiceRecordingUrlChange(null)
    // The voice id only travels with a saved recording — drop it when the recording is cleared.
    onVoiceIdChange?.(null)
  }, [onVoiceRecordingUrlChange, onVoiceIdChange])

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  function handleGenderChange(next: VoiceGender) {
    const eths = ethnicities(next)
    const nextEthnicity = eths.includes(ethnicity) ? ethnicity : (eths[0] ?? 'white')
    const nextVoices = voices(next, nextEthnicity)
    setGender(next)
    setEthnicity(nextEthnicity)
    setVoiceId(nextVoices[0]?.voiceId ?? '')
    clearGenerated()
    setError('')
  }

  function handleEthnicityChange(next: VoiceEthnicity) {
    const nextVoices = voices(gender, next)
    setEthnicity(next)
    setVoiceId(nextVoices[0]?.voiceId ?? '')
    clearGenerated()
    setError('')
  }

  function handleVoiceChange(next: string) {
    setVoiceId(next)
    clearGenerated()
    setError('')
  }

  async function handleGenerate() {
    if (!script.trim() || !voiceId) return
    setGenerating(true)
    setError('')
    setSavedMessage('')
    clearGenerated()

    try {
      const res = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: script.trim(), voiceId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Could not generate audio')
        return
      }
      const blob = base64ToBlob(json.audioBase64, json.contentType || 'audio/mpeg')
      const url = URL.createObjectURL(blob)
      setAudioBlob(blob)
      setAudioUrl(url)
    } catch {
      setError('Could not generate audio')
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    if (!audioBlob) return
    if (!campaignName.trim()) {
      setError('Enter a campaign name in step 1 before saving.')
      return
    }

    setSaving(true)
    setError('')
    setSavedMessage('')

    try {
      const reader = new FileReader()
      const audioBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result
          if (typeof result !== 'string') {
            reject(new Error('Could not read audio'))
            return
          }
          const comma = result.indexOf(',')
          resolve(comma >= 0 ? result.slice(comma + 1) : result)
        }
        reader.onerror = () => reject(reader.error ?? new Error('Could not read audio'))
        reader.readAsDataURL(audioBlob)
      })

      const res = await fetch('/api/tts/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName: campaignName.trim(),
          audioBase64,
          voiceId,
          text: script.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Could not save recording')
        return
      }
      onVoiceRecordingUrlChange(json.publicUrl)
      onVoiceIdChange?.(voiceId) // persist the voice the saved recording was generated with
      setSavedMessage(`Recording saved as ${json.storageKey ?? 'script'} for "${campaignName.trim()}".`)
      refreshSavedScripts() // surface the just-saved script as a reuse bubble
    } catch {
      setError('Could not save recording')
    } finally {
      setSaving(false)
    }
  }

  function playSample() {
    const el = sampleRef.current
    if (!el || !selectedVoice) return
    el.src = selectedVoice.samplePath
    el.play().catch(() => {})
  }

  // Listen to a saved script's audio without changing the editor.
  function playBubble(url: string) {
    const el = bubbleRef.current
    if (!el) return
    el.src = url
    el.play().catch(() => {})
  }

  // Load a saved script into the editor: its text + the voice it was generated with (both editable).
  function applySavedScript(s: SavedVoiceScript) {
    clearGenerated()
    setScript(s.text)
    const v = s.voice_id ? findVoice(s.voice_id) : null
    if (v) {
      setGender(v.gender)
      setEthnicity(v.ethnicity)
      setVoiceId(v.voiceId)
    }
    setError('')
  }

  return (
    <Stack spacing={2}>
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <FormControl size="small" fullWidth disabled={disabled}>
            <InputLabel id="voice-gender-label" shrink>Gender</InputLabel>
            <Select
              labelId="voice-gender-label"
              label="Gender"
              value={gender}
              notched
              onChange={e => handleGenderChange(e.target.value as VoiceGender)}
            >
              {genders().map(g => (
                <MenuItem key={g} value={g}>{genderLabel(g)}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <FormControl size="small" fullWidth disabled={disabled}>
            <InputLabel id="voice-ethnicity-label" shrink>Ethnicity</InputLabel>
            <Select
              labelId="voice-ethnicity-label"
              label="Ethnicity"
              value={ethnicity}
              notched
              onChange={e => handleEthnicityChange(e.target.value as VoiceEthnicity)}
            >
              {ethnicityOptions.map(e => (
                <MenuItem key={e} value={e}>{ethnicityLabel(e)}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <FormControl size="small" fullWidth disabled={disabled}>
            <InputLabel id="voice-name-label" shrink>Voice</InputLabel>
            <Select
              labelId="voice-name-label"
              label="Voice"
              value={voiceId}
              notched
              onChange={e => handleVoiceChange(e.target.value)}
            >
              {voiceOptions.map((v: InworldVoice) => (
                <MenuItem key={v.voiceId} value={v.voiceId}>{v.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {selectedVoice && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PlayArrowIcon />}
            onClick={playSample}
            disabled={disabled}
          >
            Play voice sample
          </Button>
          <audio ref={sampleRef} hidden preload="none" />
        </Box>
      )}

      {savedScripts.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Reuse a previous script — ▶ to listen, click to load &amp; edit
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {savedScripts.map(s => (
              <Tooltip key={s.id} title={s.text} arrow>
                <Chip
                  variant="outlined"
                  size="small"
                  icon={s.audio_url ? (
                    <PlayArrowIcon
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => { e.stopPropagation(); playBubble(s.audio_url!) }}
                      sx={{ cursor: 'pointer' }}
                    />
                  ) : undefined}
                  label={s.text.length > 42 ? `${s.text.slice(0, 42)}…` : s.text}
                  onClick={() => applySavedScript(s)}
                  disabled={disabled || generating}
                  sx={{ maxWidth: 320 }}
                />
              </Tooltip>
            ))}
          </Box>
          <audio ref={bubbleRef} hidden preload="none" />
        </Box>
      )}

      <TextField
        label="Script"
        placeholder="Enter the message to speak to leads…"
        value={script}
        onChange={e => setScript(e.target.value)}
        multiline
        minRows={3}
        maxRows={8}
        size="small"
        fullWidth
        disabled={disabled || generating}
      />

      <Box>
        <Button
          variant="contained"
          onClick={handleGenerate}
          disabled={disabled || generating || !script.trim() || !voiceId}
        >
          {generating ? 'Generating…' : 'Generate'}
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {savedMessage && <Alert severity="success">{savedMessage}</Alert>}
      {voiceRecordingUrl && !savedMessage && (
        <Alert severity="info">A saved recording is attached to this campaign.</Alert>
      )}

      {audioUrl && (
        <Box sx={{ display: audioUrl ? 'block' : 'none' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Generated preview
          </Typography>
          <audio ref={generatedRef} src={audioUrl} controls style={{ width: '100%' }} />
          <Box sx={{ mt: 1 }}>
            <Button
              variant="outlined"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={disabled || saving || !audioBlob || !campaignName.trim()}
            >
              {saving ? 'Saving…' : 'Save recording'}
            </Button>
          </Box>
          {!campaignName.trim() && audioUrl && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Name the campaign in step 1 before saving.
            </Typography>
          )}
        </Box>
      )}
    </Stack>
  )
}
