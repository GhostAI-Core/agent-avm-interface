'use client'

import Chip from '@mui/material/Chip'
import { statusChipTone } from '@/lib/tokens'

function toKey(status: string) {
  return (status || '').trim().toLowerCase().replace(/[_-]+/g, ' ')
}

export default function StatusChip({ status }: { status: string }) {
  const tone = statusChipTone(toKey(status))

  return (
    <Chip
      size="small"
      label={status || 'Unknown'}
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
