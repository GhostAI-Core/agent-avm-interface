'use client'
import { useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import DashboardCustomizeIcon from '@mui/icons-material/DashboardCustomize'
import CloseIcon from '@mui/icons-material/Close'
import { colors, semantic, radius } from '@/lib/tokens'

interface Props {
  onClose: () => void
  onSave: (name: string) => Promise<void>
}

export default function SaveTemplateDialog({ onClose, onSave }: Props) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    const n = name.trim()
    if (!n || saving) return
    setSaving(true)
    try {
      await onSave(n)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="xs"
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
            left: 0, right: 0, bottom: 0, height: '1px',
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
          <DashboardCustomizeIcon fontSize="small" />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 19, lineHeight: 1.2, letterSpacing: '-0.01em' }}>Save Layout Template</Typography>
          <Typography variant="body2" color="text.secondary">Save the current arrangement so the team can reuse it.</Typography>
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Close" sx={{ color: semantic.textSoft, alignSelf: 'flex-start', mt: -0.5 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <DialogContent sx={{ pt: 3 }}>
        <Stack sx={{ gap: 1.5 }}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label="Template name"
            placeholder="e.g. Spend-focused overview"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            slotProps={{ htmlInput: { maxLength: 80 } }}
          />
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.75, pt: 1 }}>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!name.trim() || saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  )
}
