'use client'
import Drawer from '@mui/material/Drawer'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined'
import BusinessOutlined from '@mui/icons-material/BusinessOutlined'
import WorkOutlineOutlined from '@mui/icons-material/WorkOutlineOutlined'
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined'
import ContactsOutlined from '@mui/icons-material/ContactsOutlined'
import PersonAddAltOutlined from '@mui/icons-material/PersonAddAltOutlined'
import AssessmentOutlined from '@mui/icons-material/AssessmentOutlined'
import GraphicEqOutlined from '@mui/icons-material/GraphicEqOutlined'
import PhoneOutlined from '@mui/icons-material/PhoneOutlined'
import ShieldOutlined from '@mui/icons-material/ShieldOutlined'
import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import PersonOutlineOutlined from '@mui/icons-material/PersonOutlineOutlined'
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined'
import type { SvgIconComponent } from '@mui/icons-material'
import { colors } from '@/lib/tokens'

const WIDTH = 250

// The real routes this app has — unchanged from before; only the visual style now mirrors
// the reference mockup (icons, active green pill, tight section heads).
const NAV_GROUPS: { label: string; items: { id: string; label: string; icon: SvgIconComponent }[] }[] = [
  {
    label: 'Campaigns',
    items: [
      { id: 'dashboard', label: 'Control Room',    icon: SpaceDashboardOutlined },
      { id: 'companies', label: 'Companies',       icon: BusinessOutlined },
      { id: 'campaigns', label: 'Campaigns',       icon: WorkOutlineOutlined },
      { id: 'products',  label: 'Products',        icon: Inventory2Outlined },
      { id: 'contacts',  label: 'Contacts',        icon: ContactsOutlined },
      { id: 'leads',     label: 'Leads',           icon: PersonAddAltOutlined },
      { id: 'reports',   label: 'Campaign Report', icon: AssessmentOutlined },
      { id: 'quality',   label: 'Call Quality',    icon: GraphicEqOutlined },
    ],
  },
  {
    label: 'Telephony',
    items: [
      { id: 'telephony', label: 'Telephony', icon: PhoneOutlined },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'security', label: 'Security Audit', icon: ShieldOutlined },
    ],
  },
  {
    label: 'Platform',
    items: [
      { id: 'settings', label: 'Settings', icon: SettingsOutlined },
      { id: 'profile',  label: 'Profile',  icon: PersonOutlineOutlined },
    ],
  },
]

function NavRow({ label, Icon, active, onClick, tour }: {
  label: string; Icon: SvgIconComponent; active: boolean; onClick: () => void; tour?: string
}) {
  return (
    <Box
      data-tour={tour}
      onClick={onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: '11px',
        p: '8px 12px', borderRadius: '4px', fontSize: '0.875rem',
        cursor: 'pointer', transition: 'background .12s, color .12s',
        fontWeight: active ? 600 : 500,
        color: active ? colors.greenBright : colors.fg2,
        bgcolor: active ? 'rgba(55,166,96,0.12)' : 'transparent',
        '&:hover': { bgcolor: active ? 'rgba(55,166,96,0.12)' : colors.bg3 },
      }}
    >
      <Icon sx={{ fontSize: 17, flex: 'none', color: active ? colors.green : colors.fg3 }} />
      {label}
    </Box>
  )
}

function SidebarContent({ view, setView, onClose, onReplayTour }: {
  view: string
  setView: (v: string) => void
  onClose: () => void
  onReplayTour: () => void
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Logo header */}
      <Box sx={{ p: '26px 22px 20px', borderBottom: `1px solid ${colors.border1}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.125, flex: 'none' }}>
        <Box component="img" src="/evra_trans.png" alt="EVRA"
          sx={{ height: 88, width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 0 12px rgba(91, 232, 190, 0.45))' }}
        />
        <Typography sx={{ fontSize: '0.5rem', fontWeight: 600, letterSpacing: '0.16em', color: colors.fg3, textAlign: 'center' }}>
          AGENT AVM | SOUTH AFRICA
        </Typography>
      </Box>

      {/* Nav */}
      <Box component="nav" sx={{ p: '12px 10px', display: 'flex', flexDirection: 'column', gap: '1px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {NAV_GROUPS.map(group => (
          <Box key={group.label}>
            <Typography sx={{ fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.11em', color: colors.fg4, p: '16px 12px 6px', userSelect: 'none' }}>
              {group.label.toUpperCase()}
            </Typography>
            {group.items.map(({ id, label, icon }) => (
              <NavRow
                key={id}
                label={label}
                Icon={icon}
                active={view === id}
                onClick={() => { setView(id); onClose() }}
                tour={`nav-${id}`}
              />
            ))}
          </Box>
        ))}
      </Box>

      {/* Replay tour */}
      <Box sx={{ p: '10px', borderTop: `1px solid ${colors.border1}`, flex: 'none' }}>
        <NavRow label="Replay tour" Icon={HelpOutlineOutlined} active={false} onClick={() => { onReplayTour(); onClose() }} />
      </Box>

    </Box>
  )
}

export default function Sidebar({ view, setView, isOpen, onClose, onReplayTour }: {
  view: string
  setView: (v: string) => void
  isOpen: boolean
  onClose: () => void
  onReplayTour: () => void
}) {
  const drawerSx = {
    width: WIDTH,
    flexShrink: 0,
    '& .MuiDrawer-paper': {
      width: WIDTH,
      boxSizing: 'border-box',
      bgcolor: colors.bg1,
      borderRight: `1px solid ${colors.border1}`,
    },
  }

  return (
    <>
      <Drawer variant="permanent" sx={{ ...drawerSx, display: { xs: 'none', lg: 'block' } }}>
        <SidebarContent view={view} setView={setView} onClose={() => {}} onReplayTour={onReplayTour} />
      </Drawer>

      <Drawer variant="temporary" open={isOpen} onClose={onClose}
        sx={{ ...drawerSx, display: { xs: 'block', lg: 'none' } }}
        ModalProps={{ keepMounted: true }}
      >
        <SidebarContent view={view} setView={setView} onClose={onClose} onReplayTour={onReplayTour} />
      </Drawer>
    </>
  )
}
