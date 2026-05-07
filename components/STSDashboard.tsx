'use client'
import { useState } from 'react'
import Grid from '@mui/material/Grid'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import RefreshIcon from '@mui/icons-material/Refresh'
import GlassCard from '@/components/ui/GlassCard'
import { stsProductData, type STSProductKey } from '@/data/sts-dashboard.mock'

function fmt(n: number) { return n.toLocaleString() }

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#10b981', CANCELLED: '#ef4444', EXPIRED: '#f59e0b',
  BILLING_FAILED: '#ef4444', INSUFFICIENT_FUNDS: '#f97316',
  PENDING_ACTIVATION: '#3b82f6', BLOCKED: '#a855f7', LOCKED: '#94a3b8',
}

function MetricCard({ title, value, sub, color }: { title: string; value: string; sub: string; color?: string }) {
  return (
    <GlassCard>
      <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.secondary', display: 'block', mb: 0.5 }}>{title}</Typography>
      <Typography sx={{ fontSize: '1.7rem', fontWeight: 800, color: color ?? 'text.primary', lineHeight: 1.1 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{sub}</Typography>
    </GlassCard>
  )
}

export default function STSDashboard() {
  const [product, setProduct] = useState<STSProductKey>('all')
  const d = stsProductData[product]
  const [lastRefreshed, setLastRefreshed] = useState(d.lastRefreshed)

  const { totals, revenue, statusBreakdown, dailyMovement, sevenDayTrend } = stsProductData[product]
  const changeColor  = totals.subscriberChange >= 0 ? '#10b981' : '#ef4444'
  const changePrefix = totals.subscriberChange >= 0 ? '+' : ''

  return (
    <Stack sx={{ gap: 3 }}>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>STS Subscription Dashboard</Typography>
          <Typography variant="body2" color="text.secondary">Daily overview of subscriber activity, revenue, and churn.</Typography>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">Last refreshed: {lastRefreshed}</Typography>
            <IconButton size="small" onClick={() => setLastRefreshed(new Date().toLocaleTimeString())} aria-label="Refresh data">
              <RefreshIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Stack>
        </Box>
        <ToggleButtonGroup exclusive size="small" value={product} onChange={(_, v) => v && setProduct(v)}>
          {(['all','seeker','grace','doctor','voxi'] as STSProductKey[]).map(p => (
            <ToggleButton key={p} value={p} sx={{ textTransform: 'capitalize', fontSize: '0.75rem' }}>{p}</ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* User metrics */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}><MetricCard title="Total Users"       value={fmt(totals.totalUsers)}       sub="All known STS subscribers."                    /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><MetricCard title="Active Users"      value={fmt(totals.activeUsers)}      sub="Currently active on the service."  color="#10b981" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><MetricCard title="Inactive Users"    value={fmt(totals.inactiveUsers)}    sub="Cancelled, expired, or billing-failed."          /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><MetricCard title="Subscriber Change" value={`${changePrefix}${fmt(totals.subscriberChange)}`} sub="vs. yesterday." color={changeColor} /></Grid>
      </Grid>

      {/* Revenue metrics */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 6, md: 3 }}><MetricCard title="Daily Revenue"    value={`R${fmt(revenue.dailyRevenue)}`}    sub="From today's active users."    color="#10b981" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><MetricCard title="Monthly Run Rate" value={`R${fmt(revenue.monthlyRunRate)}`}  sub="Estimated 30-day revenue."     color="#10b981" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><MetricCard title="Lost Daily Rev."  value={`R${fmt(revenue.lostDailyRevenue)}`} sub="From cancellations today."   color="#ef4444" /></Grid>
        <Grid size={{ xs: 6, md: 3 }}><MetricCard title="Billing Risk"     value={`${fmt(revenue.billingRiskUsers)} users`} sub="Failed billing / insufficient funds." color="#f59e0b" /></Grid>
      </Grid>

      {/* Status breakdown + Daily movement */}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', display: 'block', mb: 1.5 }}>Status Breakdown</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Status', 'Users', '%'].map(h => <TableCell key={h} align={h === 'Status' ? 'left' : 'right'} sx={{ fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', color: 'text.secondary' }}>{h}</TableCell>)}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {statusBreakdown.map(row => (
                    <TableRow key={row.status}>
                      <TableCell>
                        <Typography variant="caption" sx={{ color: STATUS_COLOR[row.status] ?? 'text.primary', fontWeight: 600 }}>{row.status}</Typography>
                        <Box sx={{ height: 4, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.07)', overflow: 'hidden', mt: 0.5 }}>
                          <Box sx={{ height: '100%', width: `${row.percentage}%`, bgcolor: STATUS_COLOR[row.status] ?? '#3b82f6', borderRadius: 1 }} />
                        </Box>
                      </TableCell>
                      <TableCell align="right"><Typography variant="caption">{fmt(row.users)}</Typography></TableCell>
                      <TableCell align="right"><Typography variant="caption" color="text.secondary">{row.percentage}%</Typography></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', display: 'block', mb: 1.5 }}>Daily Movement</Typography>
            <Stack sx={{ gap: 1 }}>
              {dailyMovement.map(row => {
                const isNet = row.label === 'Net Active Change'
                const netColor = row.value >= 0 ? '#10b981' : '#ef4444'
                return (
                  <Stack key={row.label} direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', p: 1, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.03)' }}>
                    <Typography variant="body2" sx={{ color: isNet ? 'text.primary' : 'text.secondary' }}>{row.label}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: isNet ? netColor : 'text.primary' }}>
                      {isNet && row.value > 0 ? '+' : ''}{fmt(row.value)}
                    </Typography>
                  </Stack>
                )
              })}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* 7-day trend */}
      <Paper sx={{ p: 2, overflow: 'auto' }}>
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', display: 'block', mb: 1.5 }}>7-Day Trend</Typography>
        <TableContainer>
          <Table size="small" sx={{ minWidth: 420 }}>
            <TableHead>
              <TableRow>
                {['Date', 'Active Users', 'Daily Revenue'].map(h => <TableCell key={h} align={h === 'Date' ? 'left' : 'right'} sx={{ fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase', color: 'text.secondary' }}>{h}</TableCell>)}
              </TableRow>
            </TableHead>
            <TableBody>
              {sevenDayTrend.map((row, i) => {
                const isToday = i === sevenDayTrend.length - 1
                return (
                  <TableRow key={row.date} sx={{ bgcolor: isToday ? 'rgba(59,130,246,0.06)' : 'transparent' }}>
                    <TableCell sx={{ fontWeight: isToday ? 700 : 400, color: isToday ? 'text.primary' : 'text.secondary' }}>{row.date}{isToday ? ' (today)' : ''}</TableCell>
                    <TableCell align="right" sx={{ color: '#10b981' }}>{fmt(row.activeUsers)}</TableCell>
                    <TableCell align="right">R{fmt(row.dailyRevenue)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Stack>
  )
}
