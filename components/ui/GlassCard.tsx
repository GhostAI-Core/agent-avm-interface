'use client'

import Card from '@mui/material/Card'
import type { SxProps, Theme } from '@mui/material/styles'
import type { ReactNode } from 'react'
import { colors } from '@/lib/tokens'

type GlassCardProps = {
  children: ReactNode
  sx?: SxProps<Theme>
}

export default function GlassCard({ children, sx }: GlassCardProps) {
  return (
    <Card
      sx={{
        p: 2,
        borderRadius: 1,
        backgroundColor: colors.bg1,
        border: `1px solid ${colors.border1}`,
        boxShadow: 'none',
        ...sx,
      }}
    >
      {children}
    </Card>
  )
}
