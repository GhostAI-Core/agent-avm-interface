'use client'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import MenuIcon from '@mui/icons-material/Menu'
import LogoutIcon from '@mui/icons-material/Logout'
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined'
import type { Campaign } from '@/types'
import { agentColors, colors } from '@/lib/tokens'

const AGENT_COLOR: Record<string, string> = {
  seeker: agentColors.seeker,
  grace: agentColors.grace,
  sangoma: agentColors.sangoma,
}

export default function TopBar({ title, campaigns = [], onMenu, onLogout, onTour }: {
  title: string
  campaigns?: Campaign[]
  onMenu: () => void
  onLogout?: () => void
  onTour?: () => void
}) {
  const active = campaigns.filter(c => c.status === 'running' || c.status === 'paused')
  const agentsPresent = Array.from(new Set(active.map(c => c.agent).filter(Boolean))) as string[]
  const cap = (s: string | null | undefined) => {
    if (!s) return 'Auto'
    return s.charAt(0).toUpperCase() + s.slice(1)
  }

  return (
    <Box sx={{ flexShrink: 0 }}>
      <AppBar position="sticky" elevation={0} sx={{
        bgcolor: colors.bg1,
        borderBottom: `1px solid ${colors.border1}`,
      }}>
        <Toolbar sx={{ gap: 1 }}>

          <IconButton onClick={onMenu} aria-label="Open navigation menu" sx={{ display: { lg: 'none' }, color: 'text.secondary', mr: 0.5 }}>
            <MenuIcon />
          </IconButton>

          <Typography variant="h6" sx={{ fontWeight: 600, flexGrow: 1 }}>{title}</Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main', animation: 'livePulse 1.4s infinite' }} />
            <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>Live</Typography>
          </Box>

          {onTour && (
            <Tooltip title="Guided tour">
              <IconButton onClick={onTour} size="small" aria-label="Start guided tour" sx={{ color: 'text.secondary', ml: 1 }}>
                <HelpOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          <Tooltip title="Logout">
            <IconButton onClick={onLogout} size="small" aria-label="Logout" sx={{ color: 'error.main', bgcolor: 'rgba(224,82,79,0.12)', ml: 1 }}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>

        </Toolbar>

        {active.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 0.75, bgcolor: colors.bg2, borderTop: `1px solid ${colors.border1}`, overflowX: 'auto' }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>
              Active Monitor
            </Typography>

            {/* Agent legend — only agents currently in play */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexShrink: 0 }}>
              {agentsPresent.map(ag => (
                <Box key={ag} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: AGENT_COLOR[ag] ?? 'text.secondary' }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>{cap(ag)}</Typography>
                </Box>
              ))}
            </Box>
            <Box sx={{ width: '1px', height: 20, bgcolor: colors.border2, flexShrink: 0 }} />

            {active.map((c, i) => (
              <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                {i > 0 && <Box sx={{ width: '1px', height: 20, bgcolor: colors.border2 }} />}
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: AGENT_COLOR[c.agent] ?? 'text.secondary' }} />
                <Typography variant="caption" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{c.name}</Typography>
              </Box>
            ))}
          </Box>
        )}

      </AppBar>
    </Box>
  )
}
