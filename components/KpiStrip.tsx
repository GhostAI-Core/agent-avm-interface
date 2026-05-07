import Grid from '@mui/material/Grid'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import GlassCard from '@/components/ui/GlassCard'
import type { CampaignReport } from '@/types'

function sum(rows: CampaignReport[], key: keyof CampaignReport) {
  return rows.reduce((a, r) => a + (Number(r[key]) || 0), 0)
}
function pct(n: number, d: number) { return d ? `${((n / d) * 100).toFixed(1)}%` : '—' }
function fmtN(n: number) { return n.toLocaleString('en-ZA') }
function fmtR(n: number) { return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }

const TONE_COLOR = { pos: '#10b981', neg: '#ef4444', neu: '#94a3b8' }

export default function KpiStrip({ reports }: { reports: CampaignReport[] }) {
  const dialed    = sum(reports, 'dialed')
  const connected = sum(reports, 'connected')
  const qualified = sum(reports, 'qualified')
  const hangup    = sum(reports, 'hangup')
  const callback  = sum(reports, 'callback')
  const spent     = sum(reports, 'total_spent')
  const avgCpl    = (() => {
    const cpls = reports.filter(r => r.qualified > 0).map(r => r.cpl)
    return cpls.length ? cpls.reduce((a, b) => a + b, 0) / cpls.length : 0
  })()

  const kpis: { label: string; value: string; delta: string; tone: keyof typeof TONE_COLOR }[] = [
    { label: 'Dialed',       value: fmtN(dialed),    delta: 'Total across campaigns',             tone: 'neu' },
    { label: 'Connected',    value: fmtN(connected), delta: pct(connected, dialed) + ' connect',  tone: 'pos' },
    { label: 'Qualified',    value: fmtN(qualified), delta: pct(qualified, connected) + ' of conn', tone: 'pos' },
    { label: 'Avg Duration', value: '1:12',           delta: 'Benchmark: 1:00',                   tone: 'pos' },
    { label: 'Hangup',       value: fmtN(hangup),    delta: pct(hangup, connected),               tone: 'neg' },
    { label: 'Callback',     value: fmtN(callback),  delta: pct(callback, connected),             tone: 'pos' },
    { label: 'Avg CPL',      value: fmtR(avgCpl),    delta: 'Cost per lead',                      tone: 'neu' },
    { label: 'Total Spent',  value: fmtR(spent),     delta: 'All campaigns',                      tone: 'neg' },
  ]

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {kpis.map(k => (
        <Grid key={k.label} size={{ xs: 6, sm: 4, md: 3, xl: 2 }}>
          <GlassCard sx={{ p: '1.1rem 1.25rem' }}>
            <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', display: 'block', mb: 0.5 }}>
              {k.label}
            </Typography>
            <Typography sx={{ fontSize: '1.85rem', fontWeight: 700, letterSpacing: '-1px', lineHeight: 1.1 }}>
              {k.value}
            </Typography>
            <Box sx={{ color: TONE_COLOR[k.tone], fontSize: '0.72rem', mt: 0.5 }}>{k.delta}</Box>
          </GlassCard>
        </Grid>
      ))}
    </Grid>
  )
}
