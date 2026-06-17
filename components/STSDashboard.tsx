'use client'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

export default function STSDashboard() {
  return (
    <Box sx={{ py: 6, textAlign: 'center' }}>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>STS Subscription Dashboard</Typography>
      <Typography variant="body2" color="text.secondary">
        No subscription data available yet.
      </Typography>
    </Box>
  )
}
