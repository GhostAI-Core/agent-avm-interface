'use client'

import Chip from '@mui/material/Chip'
import { agentChipTone } from '@/lib/tokens'

export default function AgentChip({ agent }: { agent: string }) {
  const tone = agentChipTone(agent)

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
