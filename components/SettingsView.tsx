'use client'

import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'

interface SettingsViewProps {
  role: 'admin' | 'engineer'
}

export default function SettingsView({ role }: SettingsViewProps) {
  const isAdmin = role === 'admin'
  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      {!isAdmin && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Only administrators can modify platform settings.
        </Alert>
      )}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>Settings</Typography>
        <Typography variant="body2" color="text.secondary">
          Outbound calling uses the LiveKit SIP trunk configured via
          {' '}<code>LIVEKIT_SIP_OUTBOUND_TRUNK_ID</code> (or a per-campaign
          {' '}<code>sip_trunk_id</code>). There are no carrier settings to manage here.
        </Typography>
      </Paper>
    </Box>
  )
}
