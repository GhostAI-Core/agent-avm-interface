'use client'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

const WIDTH = 260

// Grouped nav — view string keys must not change
const NAV_GROUPS = [
  {
    label: 'Campaigns',
    items: [
      { id: 'dashboard', label: 'Dashboard'       },
      { id: 'campaigns', label: 'Campaigns'       },
      { id: 'reports',   label: 'Campaign Report' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'security', label: 'Security Audit' },
      { id: 'sts',      label: 'STS Dashboard'  },
    ],
  },
  {
    label: 'Platform',
    items: [
      { id: 'settings', label: 'Settings' },
      { id: 'profile',  label: 'Profile'  },
    ],
  },
]

const AGENTS = [
  { label: 'Seeker',  color: '#3b82f6' },
  { label: 'Grace',   color: '#a855f7' },
  { label: 'Sangoma', color: '#f97316' },
]

// Shared interior — rendered inside both desktop and mobile drawers
function SidebarContent({ view, setView, onClose }: {
  view: string
  setView: (v: string) => void
  onClose: () => void
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Logo */}
      <Box sx={{ p: 3, borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Box component="img" src="/logo.png" alt="VAS Inc"
          sx={{ height: 96, objectFit: 'contain', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.4))' }}
        />
        <Typography variant="caption" sx={{ display: 'block', mt: 1.5, fontWeight: 700, letterSpacing: '0.1em', color: 'text.secondary' }}>
          AGENT AVM | SOUTH AFRICA
        </Typography>
      </Box>

      {/* Grouped nav */}
      <List sx={{ px: 1.5, pt: 1 }} dense>
        {NAV_GROUPS.map(group => (
          <Box key={group.label}>
            <ListSubheader sx={{ bgcolor: 'transparent', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: 'text.disabled', lineHeight: '2rem', mt: 1 }}>
              {group.label.toUpperCase()}
            </ListSubheader>
            {group.items.map(({ id, label }) => (
              <ListItemButton
                key={id}
                selected={view === id}
                onClick={() => { setView(id); onClose() }}
                sx={{
                  borderRadius: 2,
                  mb: 0.25,
                  '&.Mui-selected': { bgcolor: 'rgba(59,130,246,0.12)', color: 'primary.main' },
                  '&.Mui-selected:hover': { bgcolor: 'rgba(59,130,246,0.18)' },
                }}
              >
                <ListItemText primary={label} slotProps={{ primary: { sx: { fontSize: '0.9rem', fontWeight: 500 } } }} />
              </ListItemButton>
            ))}
          </Box>
        ))}
      </List>

      {/* Agent legend */}
      <Box sx={{ mt: 'auto', p: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        {AGENTS.map(a => (
          <Box key={a.label} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.75 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: a.color, flexShrink: 0 }} />
            <Typography variant="caption" color="text.secondary">{a.label}</Typography>
          </Box>
        ))}
      </Box>

    </Box>
  )
}

export default function Sidebar({ view, setView, isOpen, onClose }: {
  view: string
  setView: (v: string) => void
  isOpen: boolean
  onClose: () => void
}) {
  const drawerSx = {
    width: WIDTH,
    flexShrink: 0,
    '& .MuiDrawer-paper': {
      width: WIDTH,
      boxSizing: 'border-box',
      bgcolor: 'rgba(30,41,59,0.75)',
      borderRight: '1px solid rgba(255,255,255,0.1)',
    },
  }

  return (
    <>
      {/* Desktop — always visible, part of the page flow */}
      <Drawer variant="permanent" sx={{ ...drawerSx, display: { xs: 'none', lg: 'block' } }}>
        <SidebarContent view={view} setView={setView} onClose={() => {}} />
      </Drawer>

      {/* Mobile — slides in over the content */}
      <Drawer variant="temporary" open={isOpen} onClose={onClose}
        sx={{ ...drawerSx, display: { xs: 'block', lg: 'none' } }}
        ModalProps={{ keepMounted: true }}
      >
        <SidebarContent view={view} setView={setView} onClose={onClose} />
      </Drawer>
    </>
  )
}
