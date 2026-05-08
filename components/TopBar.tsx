'use client'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import MenuIcon from '@mui/icons-material/Menu'
import LogoutIcon from '@mui/icons-material/Logout'
import type { Campaign } from '@/types'

const AGENT_COLOR: Record<string, string> = {
  seeker: '#3b82f6', grace: '#a855f7', sangoma: '#f97316',
}

export default function TopBar({ title, campaigns = [], onMenu, onLogout }: {
  title: string
  campaigns?: Campaign[]
  onMenu: () => void
  onLogout?: () => void
}) {
  const active = campaigns.filter(c => c.status === 'running' || c.status === 'paused')

  return (
    <Box sx={{ flexShrink: 0 }}>
      <AppBar position="sticky" elevation={0} sx={{
        bgcolor: 'rgba(30,41,59,0.75)',
        backdropFilter: 'blur(14px)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        <Toolbar sx={{ gap: 1 }}>

          {/* Hamburger — only shown on mobile (desktop has the persistent sidebar) */}
          <IconButton onClick={onMenu} aria-label="Open navigation menu" sx={{ display: { lg: 'none' }, color: 'text.secondary', mr: 0.5 }}>
            <MenuIcon />
          </IconButton>

          <Typography variant="h6" sx={{ fontWeight: 600, flexGrow: 1 }}>{title}</Typography>

          {/* Live indicator */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main', animation: 'livePulse 1.4s infinite' }} />
            <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>Live</Typography>
          </Box>

          <Tooltip title="Logout">
            <IconButton onClick={onLogout} size="small" aria-label="Logout" sx={{ color: 'error.main', bgcolor: 'rgba(239,68,68,0.1)', ml: 1 }}>
              <LogoutIcon fontSize="small" />
            </IconButton>
          </Tooltip>

        </Toolbar>

        {/* Active campaign monitor strip */}
        {active.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, px: 2, py: 0.75, bgcolor: 'rgba(15,23,42,0.6)', borderTop: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>
              Active Monitor
            </Typography>
            {active.map((c, i) => (
              <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                {i > 0 && <Box sx={{ width: '1px', height: 20, bgcolor: 'rgba(255,255,255,0.1)' }} />}
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: AGENT_COLOR[c.agent] ?? 'text.secondary' }} />
                <Typography variant="caption" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{c.name}</Typography>
              </Box>
            ))}
          </Box>
        )}

      </AppBar>

      <style>{`@keyframes livePulse { 0%,100%{ opacity:1; } 50%{ opacity:0.3; } }`}</style>
    </Box>
  )
}
