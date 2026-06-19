'use client'

import Chip from '@mui/material/Chip'
import { statusChipTone } from '@/lib/tokens'

function toKey(status: string) {
  return (status || '').trim().toLowerCase().replace(/[_-]+/g, ' ')
}

export default function StatusChip({ status, autoPaused }: { status: string; autoPaused?: boolean }) {
  // callops auto-pauses outside the calling window (status stays 'paused', auto_paused=true).
  // Surface that distinctly from a manual pause; it resumes itself when the window reopens.
  const isAutoPaused = !!autoPaused && toKey(status) === 'paused'
  const tone = statusChipTone(isAutoPaused ? 'auto paused' : toKey(status))

  return (
    <Chip
      size="small"
      label={isAutoPaused ? 'Auto-paused' : (status || 'Unknown')}
      sx={{
        height: 22,
        fontSize: '0.7rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        backgroundColor: tone.bg,
        color: tone.text,
        border: `1px solid ${tone.border}`,
      }}
    />
  )
}
