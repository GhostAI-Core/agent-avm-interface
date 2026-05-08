'use client'

import Chip from '@mui/material/Chip'

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  running: { bg: 'rgba(16, 185, 129, 0.18)', text: '#6ee7b7', border: 'rgba(16, 185, 129, 0.38)' },
  paused: { bg: 'rgba(245, 158, 11, 0.18)', text: '#fcd34d', border: 'rgba(245, 158, 11, 0.38)' },
  completed: { bg: 'rgba(148, 163, 184, 0.18)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.38)' },
  connected: { bg: 'rgba(16, 185, 129, 0.18)', text: '#6ee7b7', border: 'rgba(16, 185, 129, 0.38)' },
  qualified: { bg: 'rgba(34, 197, 94, 0.18)', text: '#86efac', border: 'rgba(34, 197, 94, 0.38)' },
  voicemail: { bg: 'rgba(59, 130, 246, 0.18)', text: '#93c5fd', border: 'rgba(59, 130, 246, 0.38)' },
  'no speech': { bg: 'rgba(148, 163, 184, 0.18)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.38)' },
  hangup: { bg: 'rgba(239, 68, 68, 0.18)', text: '#fca5a5', border: 'rgba(239, 68, 68, 0.38)' },
  ni: { bg: 'rgba(99, 102, 241, 0.18)', text: '#a5b4fc', border: 'rgba(99, 102, 241, 0.38)' },
  dnq: { bg: 'rgba(249, 115, 22, 0.18)', text: '#fdba74', border: 'rgba(249, 115, 22, 0.38)' },
  callback: { bg: 'rgba(14, 165, 233, 0.18)', text: '#7dd3fc', border: 'rgba(14, 165, 233, 0.38)' },
  'no answer': { bg: 'rgba(168, 85, 247, 0.18)', text: '#d8b4fe', border: 'rgba(168, 85, 247, 0.38)' },
  'busy line': { bg: 'rgba(217, 70, 239, 0.18)', text: '#f0abfc', border: 'rgba(217, 70, 239, 0.38)' },
  failed: { bg: 'rgba(239, 68, 68, 0.18)', text: '#fca5a5', border: 'rgba(239, 68, 68, 0.38)' },
}

function toKey(status: string) {
  return (status || '').trim().toLowerCase().replace(/[_-]+/g, ' ')
}

export default function StatusChip({ status }: { status: string }) {
  const key = toKey(status)
  const tone = STATUS_STYLE[key] ?? { bg: 'rgba(148, 163, 184, 0.18)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.38)' }

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
'use client'

import Chip from '@mui/material/Chip'

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  running: { bg: 'rgba(16, 185, 129, 0.18)', text: '#6ee7b7', border: 'rgba(16, 185, 129, 0.38)' },
  paused: { bg: 'rgba(245, 158, 11, 0.18)', text: '#fcd34d', border: 'rgba(245, 158, 11, 0.38)' },
  completed: { bg: 'rgba(148, 163, 184, 0.18)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.38)' },
  connected: { bg: 'rgba(16, 185, 129, 0.18)', text: '#6ee7b7', border: 'rgba(16, 185, 129, 0.38)' },
  qualified: { bg: 'rgba(34, 197, 94, 0.18)', text: '#86efac', border: 'rgba(34, 197, 94, 0.38)' },
  voicemail: { bg: 'rgba(59, 130, 246, 0.18)', text: '#93c5fd', border: 'rgba(59, 130, 246, 0.38)' },
  'no speech': { bg: 'rgba(148, 163, 184, 0.18)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.38)' },
  hangup: { bg: 'rgba(239, 68, 68, 0.18)', text: '#fca5a5', border: 'rgba(239, 68, 68, 0.38)' },
  ni: { bg: 'rgba(99, 102, 241, 0.18)', text: '#a5b4fc', border: 'rgba(99, 102, 241, 0.38)' },
  dnq: { bg: 'rgba(249, 115, 22, 0.18)', text: '#fdba74', border: 'rgba(249, 115, 22, 0.38)' },
  callback: { bg: 'rgba(14, 165, 233, 0.18)', text: '#7dd3fc', border: 'rgba(14, 165, 233, 0.38)' },
  'no answer': { bg: 'rgba(168, 85, 247, 0.18)', text: '#d8b4fe', border: 'rgba(168, 85, 247, 0.38)' },
  'busy line': { bg: 'rgba(217, 70, 239, 0.18)', text: '#f0abfc', border: 'rgba(217, 70, 239, 0.38)' },
  failed: { bg: 'rgba(239, 68, 68, 0.18)', text: '#fca5a5', border: 'rgba(239, 68, 68, 0.38)' },
}

function toKey(status: string) {
  return (status || '').trim().toLowerCase().replace(/[_-]+/g, ' ')
}

export default function StatusChip({ status }: { status: string }) {
  const key = toKey(status)
  const tone = STATUS_STYLE[key] ?? { bg: 'rgba(148, 163, 184, 0.18)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.38)' }

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
