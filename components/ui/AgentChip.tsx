'use client'

import Chip from '@mui/material/Chip'

const AGENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  seeker: { bg: 'rgba(59, 130, 246, 0.16)', text: '#93c5fd', border: 'rgba(59, 130, 246, 0.35)' },
  grace: { bg: 'rgba(16, 185, 129, 0.16)', text: '#6ee7b7', border: 'rgba(16, 185, 129, 0.35)' },
  sangoma: { bg: 'rgba(245, 158, 11, 0.16)', text: '#fcd34d', border: 'rgba(245, 158, 11, 0.35)' },
}

export default function AgentChip({ agent }: { agent: string }) {
  const key = (agent || '').toLowerCase()
  const tone = AGENT_COLORS[key] ?? { bg: 'rgba(148, 163, 184, 0.16)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.35)' }

  return (
    <Chip
      size="small"
      label={agent || 'Unknown'}
      sx={{
        mt: 0.5,
        height: 22,
        fontSize: '0.72rem',
        fontWeight: 600,
        backgroundColor: tone.bg,
        color: tone.text,
        border: `1px solid ${tone.border}`,
      }}
    />
  )
}
