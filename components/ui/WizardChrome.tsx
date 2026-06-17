'use client'
import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import { colors, semantic, radius } from '@/lib/tokens'

/** Gradient header band shared by creation dialogs/wizards. */
export function WizardHeader({ icon, title, subtitle, onClose }: {
  icon: ReactNode
  title: string
  subtitle?: string
  onClose: () => void
}) {
  return (
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
          left: 0,
          right: 0,
          bottom: 0,
          height: '1px',
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
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 19, lineHeight: 1.2, letterSpacing: '-0.01em' }}>{title}</Typography>
        {subtitle && <Typography variant="body2" color="text.secondary">{subtitle}</Typography>}
      </Box>
      <IconButton onClick={onClose} size="small" aria-label="Close" sx={{ color: semantic.textSoft, alignSelf: 'flex-start', mt: -0.5 }}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  )
}

/** Horizontal step indicator: ● active · ○ upcoming · ✓ done. */
export function StepRail({ steps, active }: { steps: string[]; active: number }) {
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap',
        px: 3, py: 1.5,
        borderBottom: `1px solid ${colors.border1}`,
        bgcolor: colors.bg1,
      }}
    >
      {steps.map((label, i) => {
        const done = i < active
        const current = i === active
        return (
          <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                fontSize: 11, fontWeight: 700, lineHeight: 1,
                border: `1px solid ${current || done ? semantic.accent : colors.border3}`,
                bgcolor: current ? 'rgba(55,166,96,0.18)' : done ? semantic.accent : 'transparent',
                color: done ? colors.bg0 : current ? semantic.accentBright : semantic.textMuted,
                boxShadow: current ? `0 0 10px -2px ${semantic.accentGlow}` : 'none',
                transition: 'all .18s ease',
              }}
            >
              {done ? '✓' : i + 1}
            </Box>
            <Typography
              variant="caption"
              sx={{
                color: current ? semantic.text : semantic.textMuted,
                fontWeight: current ? 700 : 500,
                letterSpacing: '0.04em',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </Typography>
            {i < steps.length - 1 && (
              <Box sx={{ width: 18, height: '1px', bgcolor: colors.border3, mx: 0.25 }} />
            )}
          </Box>
        )
      })}
    </Box>
  )
}

/** Small uppercase section heading with an accent tick. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Box sx={{ width: 3, height: 13, borderRadius: 2, bgcolor: semantic.accent, boxShadow: `0 0 8px ${semantic.accentGlow}55` }} />
      <Typography variant="caption" sx={{ color: semantic.textMuted, textTransform: 'uppercase', letterSpacing: '0.13em', fontWeight: 700 }}>
        {children}
      </Typography>
    </Box>
  )
}
