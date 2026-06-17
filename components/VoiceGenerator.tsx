'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
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
  disabled?: boolean
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

  const sampleRef = useRef<HTMLAudioElement>(null)
  const generatedRef = useRef<HTMLAudioElement>(null)

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
  }, [onVoiceRecordingUrlChange])

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
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'Could not save recording')
        return
      }
      onVoiceRecordingUrlChange(json.publicUrl)
      setSavedMessage(`Recording saved as ${json.storageKey ?? 'script'} for "${campaignName.trim()}".`)
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
