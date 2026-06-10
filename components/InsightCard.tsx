'use client'
import type { ReactNode } from 'react'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import DragIndicatorIcon from '@mui/icons-material/DragIndicator'
import PushPinIcon from '@mui/icons-material/PushPin'
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined'
import CloseIcon from '@mui/icons-material/Close'
import GlassCard from '@/components/ui/GlassCard'

export default function InsightCard({
  title, pinned, dragging, onPin, onHide, onDragStart, onDragOver, onDragEnter, onDrop, onDragEnd, children,
}: {
  title: string
  pinned: boolean
  dragging: boolean
  onPin: () => void
  onHide: () => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnter: () => void
  onDrop: () => void
  onDragEnd: () => void
  children: ReactNode
}) {
  return (
    <Box
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      sx={{
        height: '100%',
        opacity: dragging ? 0.35 : 1,
        outline: dragging ? '2px dashed rgba(91,232,190,0.8)' : 'none',
        outlineOffset: dragging ? '-2px' : 0,
        borderRadius: 1,
        transition: 'opacity 0.12s',
      }}
    >
      <GlassCard sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 1.5 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5, mb: 1 }}>
          <DragIndicatorIcon sx={{ fontSize: 16, color: 'text.disabled', cursor: 'grab' }} />
          <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', flex: 1 }}>
            {title}
          </Typography>
          <Tooltip title={pinned ? 'Unpin' : 'Pin to top'}>
            <IconButton size="small" onClick={onPin} sx={{ color: pinned ? 'primary.main' : 'text.disabled' }}>
              {pinned ? <PushPinIcon sx={{ fontSize: 15 }} /> : <PushPinOutlinedIcon sx={{ fontSize: 15 }} />}
            </IconButton>
          </Tooltip>
          <Tooltip title="Hide">
            <IconButton size="small" onClick={onHide} sx={{ color: 'text.disabled' }}>
              <CloseIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </Stack>
        <Box sx={{ flex: 1, minHeight: 0 }}>{children}</Box>
      </GlassCard>
    </Box>
  )
}
