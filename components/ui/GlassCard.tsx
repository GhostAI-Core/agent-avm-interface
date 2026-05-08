'use client'

import Card from '@mui/material/Card'
import type { SxProps, Theme } from '@mui/material/styles'
import type { ReactNode } from 'react'

type GlassCardProps = {
  children: ReactNode
  sx?: SxProps<Theme>
}

export default function GlassCard({ children, sx }: GlassCardProps) {
  return (
    <Card
      sx={{
        p: 2,
        borderRadius: 2,
        background: 'rgba(30, 41, 59, 0.75)',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        ...sx,
      }}
    >
      {children}
    </Card>
  )
}
