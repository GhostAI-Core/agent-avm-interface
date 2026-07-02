'use client'
import type { ReactNode } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import StopIcon from '@mui/icons-material/Stop'
import EditIcon from '@mui/icons-material/Edit'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ArchiveIcon from '@mui/icons-material/Archive'
import AgentChip from '@/components/ui/AgentChip'
import StatusChip from '@/components/ui/StatusChip'
import { OutcomeDonut, FunnelChart, CampaignBar, SpendChart } from '@/components/Charts'
import CostBreakdown from '@/components/CostBreakdown'
import { BarChart, LineChart, DonutChart, Sparkline, MiniBars } from '@/components/InsightCharts'
import { maskPhone } from '@/lib/security'
import { toneColors } from '@/lib/tokens'
import type { Campaign, CampaignReport, CallRecord, IntentStat } from '@/types'

export type DashCall = CallRecord & { campaign_id: number }
export type DashIntent = IntentStat & { campaign_id: number }
export type InsightSize = 'sm' | 'md' | 'lg'

export interface CampaignActions {
  onPlayPause: (c: Campaign) => void
  onStop: (c: Campaign) => void
  onEdit: (c: Campaign) => void
  onReuse: (c: Campaign) => void
  onArchive: (c: Campaign) => void
}

export interface InsightCtx {
  reports: CampaignReport[]
  calls: DashCall[]
  intents: DashIntent[]
  campaigns: Campaign[]
  actions?: CampaignActions
}

export interface InsightDef {
  id: string
  title: string
  size: InsightSize
  render: (ctx: InsightCtx) => ReactNode
}

// ── formatting ────────────────────────────────────────────────────────────────
const za = (n: number, d = 0) => {
  const [i, dec] = Math.abs(n).toFixed(d).split('.')
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (n < 0 ? '-' : '') + (d ? `${g},${dec}` : g)
}
const fmtN = (n: number) => za(n, 0)
const fmtR = (n: number) => `R${za(n, 2)}`
const pct = (n: number, dd: number) => (dd ? `${((n / dd) * 100).toFixed(1)}%` : '—')
const fmtTime = (s: number) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`
const sumR = (rows: CampaignReport[], k: keyof CampaignReport) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0)

// ── small render helpers ────────────────────────────────────────────────────────
function Stat({ value, sub, tone = 'neu' }: { value: string; sub: string; tone?: keyof typeof toneColors }) {
  return (
    <Box>
      <Typography className="mono" sx={{ fontSize: '1.7rem', fontWeight: 700, letterSpacing: '-1px', lineHeight: 1.1 }}>{value}</Typography>
      <Box sx={{ color: toneColors[tone], fontSize: '0.72rem', mt: 0.5 }}>{sub}</Box>
    </Box>
  )
}
function ChartBox({ children, h = 190 }: { children: ReactNode; h?: number }) {
  return <Box sx={{ height: h }}>{children}</Box>
}
const SPARK_COLOR: Record<keyof typeof toneColors, string> = { pos: '#5BE8BE', neg: '#E0524F', neu: '#67B7FF' }
function StatTrend({ value, sub, tone = 'neu', series, kind = 'line' }: {
  value: string; sub: string; tone?: keyof typeof toneColors; series: number[]; kind?: 'line' | 'bar'
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Typography className="mono" sx={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-1px', lineHeight: 1.1 }}>{value}</Typography>
      <Box sx={{ color: toneColors[tone], fontSize: '0.7rem', mb: 0.5 }}>{sub}</Box>
      <Box sx={{ height: 42, mt: 'auto' }}>
        {kind === 'bar'
          ? <MiniBars data={series} color={SPARK_COLOR[tone]} />
          : <Sparkline data={series} color={SPARK_COLOR[tone]} />}
      </Box>
    </Box>
  )
}
function MiniTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>{head.map((h, i) => <TableCell key={h} align={i === 0 ? 'left' : 'right'} sx={{ fontSize: '0.68rem', whiteSpace: 'nowrap' }}>{h}</TableCell>)}</TableRow>
      </TableHead>
      <TableBody>
        {rows.map((r, ri) => (
          <TableRow key={ri} hover>
            {r.map((cell, ci) => <TableCell key={ci} align={ci === 0 ? 'left' : 'right'} sx={{ fontSize: '0.8rem' }}>{cell}</TableCell>)}
          </TableRow>
        ))}
        {!rows.length && <TableRow><TableCell colSpan={head.length} sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>No data</TableCell></TableRow>}
      </TableBody>
    </Table>
  )
}

// ── derived shared across insights ──────────────────────────────────────────────
function answered(calls: DashCall[]) { return calls.filter(c => (c.talk_seconds || 0) > 0) }
function lastDays(n: number): string[] {
  const out: string[] = []
  const base = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86400000)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}
/** Per-day series over the last 14 days — fn reduces each day's calls to a number. */
function daySeries(calls: DashCall[], fn: (dayCalls: DashCall[]) => number): number[] {
  const days = lastDays(14)
  return days.map(d => fn(calls.filter(c => (c.called_at || '').slice(0, 10) === d)))
}
const cnt = (pred: (c: DashCall) => boolean) => (b: DashCall[]) => b.filter(pred).length
const isOutcome = (o: string) => (c: DashCall) => c.outcome === o

// Default arrangement (the original dashboard look). Everything else is an
// opt-in add-on selectable from the "Add insight" dropdown.
export const DEFAULT_INSIGHTS = [
  'campaigns-table',
  'campaign-report',
  'dialed', 'connected', 'qualified', 'avg-talk', 'hangup', 'callback', 'avg-cpl', 'total-spent',
  'outcome-donut', 'campaign-compare', 'spend-cpl', 'cost-breakdown', 'funnel',
]

// Columns for the embedded Campaign Report (mirrors the reports view)
const REPORT_COLS: { head: string; key: keyof CampaignReport }[] = [
  { head: 'Dialed', key: 'dialed' }, { head: 'Connected', key: 'connected' }, { head: 'Qualified', key: 'qualified' },
  { head: 'Voicemail', key: 'voicemail' }, { head: 'No Speech', key: 'no_speech' }, { head: 'Hangup', key: 'hangup' },
  { head: 'NI', key: 'ni' }, { head: 'DNQ', key: 'dnq' }, { head: 'Callback', key: 'callback' },
  { head: 'NA', key: 'no_answer' }, { head: 'Busy', key: 'busy_line' }, { head: 'Failed', key: 'failed' },
]

// ── registry ────────────────────────────────────────────────────────────────────
export const INSIGHTS: InsightDef[] = [
  // KPI cards — value + daily-movement sparkline (bars for counts, lines for rates/averages)
  { id: 'dialed', title: 'Dialed', size: 'sm', render: c => <StatTrend value={fmtN(sumR(c.reports, 'dialed'))} sub="Total dialed" kind="bar" series={daySeries(c.calls, b => b.length)} /> },
  { id: 'connected', title: 'Connected', size: 'sm', render: c => <StatTrend tone="pos" value={fmtN(sumR(c.reports, 'connected'))} sub={`${pct(sumR(c.reports, 'connected'), sumR(c.reports, 'dialed'))} connect`} kind="bar" series={daySeries(c.calls, cnt(isOutcome('connected')))} /> },
  { id: 'qualified', title: 'Qualified', size: 'sm', render: c => <StatTrend tone="pos" value={fmtN(sumR(c.reports, 'qualified'))} sub={`${pct(sumR(c.reports, 'qualified'), sumR(c.reports, 'connected'))} of connected`} kind="bar" series={daySeries(c.calls, cnt(isOutcome('qualified')))} /> },
  {
    id: 'avg-talk', title: 'Avg Talk Time', size: 'sm', render: c => {
      const a = answered(c.calls)
      const avg = a.length ? a.reduce((s, x) => s + (x.talk_seconds || 0), 0) / a.length : 0
      const series = daySeries(c.calls, b => { const an = b.filter(x => (x.talk_seconds || 0) > 0); return an.length ? an.reduce((s, x) => s + x.talk_seconds, 0) / an.length : 0 })
      return <StatTrend tone="pos" value={fmtTime(avg)} sub="Avg over answered calls" kind="line" series={series} />
    },
  },
  {
    id: 'transfer-rate', title: 'Transfer Rate', size: 'sm', render: c => {
      const a = answered(c.calls)
      const t = c.calls.filter(x => x.transferred).length
      const series = daySeries(c.calls, b => { const an = b.filter(x => (x.talk_seconds || 0) > 0).length; return an ? (b.filter(x => x.transferred).length / an) * 100 : 0 })
      return <StatTrend tone="pos" value={pct(t, a.length)} sub={`${fmtN(t)} transferred to human`} kind="line" series={series} />
    },
  },
  { id: 'hangup', title: 'Hangup', size: 'sm', render: c => <StatTrend tone="neg" value={fmtN(sumR(c.reports, 'hangup'))} sub={`${pct(sumR(c.reports, 'hangup'), sumR(c.reports, 'connected'))} of connected`} kind="bar" series={daySeries(c.calls, cnt(isOutcome('hangup')))} /> },
  { id: 'callback', title: 'Callback', size: 'sm', render: c => <StatTrend value={fmtN(sumR(c.reports, 'callback'))} sub={`${pct(sumR(c.reports, 'callback'), sumR(c.reports, 'connected'))} of connected`} kind="bar" series={daySeries(c.calls, cnt(isOutcome('callback')))} /> },
  { id: 'voicemail', title: 'Voicemail', size: 'sm', render: c => <StatTrend value={fmtN(sumR(c.reports, 'voicemail'))} sub={`${pct(sumR(c.reports, 'voicemail'), sumR(c.reports, 'dialed'))} of dialed`} kind="bar" series={daySeries(c.calls, cnt(isOutcome('voicemail')))} /> },
  { id: 'no-answer', title: 'No Answer', size: 'sm', render: c => <StatTrend value={fmtN(sumR(c.reports, 'no_answer'))} sub={`${pct(sumR(c.reports, 'no_answer'), sumR(c.reports, 'dialed'))} of dialed`} kind="bar" series={daySeries(c.calls, cnt(isOutcome('no_answer')))} /> },
  {
    id: 'avg-cpl', title: 'Avg CPL', size: 'sm', render: c => {
      const cpls = c.reports.filter(r => r.qualified > 0).map(r => Number(r.cpl))
      const series = daySeries(c.calls, b => { const q = b.filter(isOutcome('qualified')).length; const spend = b.reduce((s, x) => s + Number(x.cost || 0), 0); return q ? spend / q : 0 })
      return <StatTrend value={fmtR(cpls.length ? cpls.reduce((a, b) => a + b, 0) / cpls.length : 0)} sub="Cost per lead" kind="line" series={series} />
    },
  },
  { id: 'total-spent', title: 'Total Spent', size: 'sm', render: c => <StatTrend tone="neg" value={fmtR(sumR(c.reports, 'total_spent'))} sub="Across campaigns" kind="bar" series={daySeries(c.calls, b => b.reduce((s, x) => s + Number(x.cost || 0), 0))} /> },
  {
    id: 'spend-efficiency', title: 'Spend Efficiency', size: 'sm', render: c => {
      const spent = sumR(c.reports, 'total_spent'); const q = sumR(c.reports, 'qualified')
      const series = daySeries(c.calls, b => { const sp = b.reduce((s, x) => s + Number(x.cost || 0), 0); const qq = b.filter(isOutcome('qualified')).length; return sp ? (qq / sp) * 1000 : 0 })
      return <StatTrend tone="pos" value={spent ? za((q / spent) * 1000, 2) : '—'} sub="Qualified / R1,000" kind="line" series={series} />
    },
  },
  {
    id: 'active-campaigns', title: 'Active Campaigns', size: 'sm', render: c => {
      const active = c.campaigns.filter(x => x.status === 'running' || x.status === 'paused').length
      return <Stat value={fmtN(active)} sub={`${c.campaigns.length} total`} />
    },
  },

  // Charts — categorical / series / comparison
  { id: 'outcome-donut', title: 'Call Outcome Breakdown', size: 'md', render: c => <ChartBox><OutcomeDonut reports={c.reports} /></ChartBox> },
  { id: 'funnel', title: 'Dialling Funnel', size: 'md', render: c => <ChartBox><FunnelChart reports={c.reports} /></ChartBox> },
  { id: 'campaign-compare', title: 'Campaign Comparison', size: 'md', render: c => <ChartBox><CampaignBar reports={c.reports} /></ChartBox> },
  { id: 'spend-cpl', title: 'Spend & CPL', size: 'md', render: c => <ChartBox><SpendChart reports={c.reports} /></ChartBox> },
  { id: 'cost-breakdown', title: 'CPL / Cost Breakdown', size: 'md', render: c => <CostBreakdown calls={c.calls} /> },
  {
    id: 'company-compare', title: 'Company Comparison (Qualified)', size: 'md', render: c => {
      const byId = new Map(c.campaigns.map(x => [x.id, x.company || '—']))
      const m = new Map<string, number>()
      c.reports.forEach(r => { const co = byId.get(r.campaign_id) || '—'; m.set(co, (m.get(co) || 0) + (Number(r.qualified) || 0)) })
      const labels = [...m.keys()]
      return <ChartBox><BarChart labels={labels} data={labels.map(l => m.get(l)!)} /></ChartBox>
    },
  },
  {
    id: 'calls-trend', title: 'Calls Over Time (14d)', size: 'md', render: c => {
      const days = lastDays(14)
      const m = new Map(days.map(d => [d, 0]))
      c.calls.forEach(x => { const d = (x.called_at || '').slice(0, 10); if (m.has(d)) m.set(d, m.get(d)! + 1) })
      return <ChartBox><LineChart labels={days.map(d => d.slice(5))} data={days.map(d => m.get(d)!)} /></ChartBox>
    },
  },
  {
    id: 'busiest-hours', title: 'Busiest Hours', size: 'md', render: c => {
      const buckets = new Array(24).fill(0)
      c.calls.forEach(x => { const h = new Date(x.called_at).getHours(); if (h >= 0 && h < 24) buckets[h]++ })
      return <ChartBox><BarChart labels={buckets.map((_, h) => `${h}`)} data={buckets} color="#5BE8BE" /></ChartBox>
    },
  },
  {
    id: 'talk-distribution', title: 'Talk-Time Distribution', size: 'md', render: c => {
      const edges = [0, 30, 60, 120, 300, Infinity]
      const labels = ['0s', '<30s', '30-60s', '1-2m', '2-5m', '5m+']
      const b = new Array(labels.length).fill(0)
      c.calls.forEach(x => {
        const t = x.talk_seconds || 0
        if (t === 0) { b[0]++; return }
        for (let i = 1; i < edges.length; i++) { if (t < edges[i]) { b[i]++; break } }
      })
      return <ChartBox><BarChart labels={labels} data={b} color="#67B7FF" /></ChartBox>
    },
  },
  {
    id: 'dropoff', title: 'Where Calls Land (Intents)', size: 'md', render: c => {
      const m = new Map<string, number>()
      c.intents.forEach(i => m.set(i.intent_name, (m.get(i.intent_name) || 0) + (Number(i.reached) || 0)))
      const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      return <ChartBox><BarChart horizontal labels={top.map(t => t[0])} data={top.map(t => t[1])} /></ChartBox>
    },
  },
  {
    id: 'status-breakdown', title: 'Campaigns by Status', size: 'md', render: c => {
      const m = new Map<string, number>()
      c.campaigns.forEach(x => m.set(x.status, (m.get(x.status) || 0) + 1))
      const labels = [...m.keys()]
      return <ChartBox><DonutChart labels={labels} data={labels.map(l => m.get(l)!)} /></ChartBox>
    },
  },
  {
    id: 'agent-split', title: 'Campaigns by Agent', size: 'md', render: c => {
      const m = new Map<string, number>()
      c.campaigns.forEach(x => m.set(x.agent, (m.get(x.agent) || 0) + 1))
      const labels = [...m.keys()]
      return <ChartBox><DonutChart labels={labels} data={labels.map(l => m.get(l)!)} /></ChartBox>
    },
  },

  // Tables
  {
    id: 'recent-calls', title: 'Recent Calls', size: 'lg', render: c => {
      const rows = [...c.calls]
        .sort((a, b) => +new Date(b.called_at) - +new Date(a.called_at))
        .slice(0, 8)
        .map(x => [maskPhone(x.phone), <StatusChip key="s" status={x.outcome} />, fmtTime(x.talk_seconds), new Date(x.called_at).toLocaleString()])
      return <MiniTable head={['Phone', 'Outcome', 'Talk', 'Time']} rows={rows} />
    },
  },
  {
    id: 'leaderboard', title: 'Top Campaigns (Qualify Rate)', size: 'lg', render: c => {
      const rows = [...c.reports]
        .map(r => ({ name: r.campaign?.name ?? '—', q: Number(r.qualified) || 0, conn: Number(r.connected) || 0, cpl: Number(r.cpl) || 0 }))
        .sort((a, b) => (b.q / (b.conn || 1)) - (a.q / (a.conn || 1)))
        .slice(0, 6)
        .map(r => [r.name, pct(r.q, r.conn), fmtR(r.cpl)])
      return <MiniTable head={['Campaign', 'Qualify %', 'CPL']} rows={rows} />
    },
  },
  {
    id: 'campaigns-table', title: 'Campaigns', size: 'lg', render: c => {
      const a = c.actions
      const rows = c.campaigns.map(x => {
        const cells: ReactNode[] = [x.name, <AgentChip key="a" agent={x.agent} />, x.company || '—', <StatusChip key="s" status={x.status} />]
        if (a) {
          const running = x.status === 'running'
          cells.push(
            <Stack key="act" direction="row" sx={{ justifyContent: 'flex-end' }}>
              <Tooltip title={running ? 'Pause' : 'Play'}><IconButton size="small" color={running ? 'warning' : 'success'} onClick={() => a.onPlayPause(x)}>{running ? <PauseIcon sx={{ fontSize: 17 }} /> : <PlayArrowIcon sx={{ fontSize: 17 }} />}</IconButton></Tooltip>
              <Tooltip title="Stop"><IconButton size="small" onClick={() => a.onStop(x)}><StopIcon sx={{ fontSize: 17 }} /></IconButton></Tooltip>
              <Tooltip title="Edit (change MP4)"><IconButton size="small" onClick={() => a.onEdit(x)}><EditIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
              <Tooltip title="Reuse as template"><IconButton size="small" onClick={() => a.onReuse(x)}><ContentCopyIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
              <Tooltip title="Archive"><IconButton size="small" onClick={() => a.onArchive(x)} sx={{ color: 'warning.main' }}><ArchiveIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
            </Stack>,
          )
        }
        return cells
      })
      const head = a ? ['Campaign', 'Agent', 'Company', 'Status', 'Actions'] : ['Campaign', 'Agent', 'Company', 'Status']
      return <MiniTable head={head} rows={rows} />
    },
  },
  {
    id: 'call-quality', title: 'Call Quality (Intent Waterfall)', size: 'lg', render: c => {
      // Aggregate reached per intent across the scoped campaigns, then mirror the
      // standalone Call Quality view: intents alphabetical, "% of connected", and
      // "% dropped from previous" = change vs the row above.
      const connectedTotal = sumR(c.reports, 'connected')
      const byIntent = new Map<string, number>()
      c.intents.forEach(i => byIntent.set(i.intent_name, (byIntent.get(i.intent_name) || 0) + (Number(i.reached) || 0)))
      const sorted = [...byIntent.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      const rows = sorted.map(([name, reached], i) => {
        const prev = sorted[i - 1]
        const dropped = i === 0 || !prev?.[1] ? null : ((prev[1] - reached) / prev[1]) * 100
        return [
          name,
          fmtN(reached),
          pct(reached, connectedTotal),
          dropped === null
            ? '–'
            : <Box key="d" component="span" sx={{ color: dropped >= 0 ? 'error.main' : 'success.main', fontWeight: 600 }}>{`${dropped.toFixed(1)}%`}</Box>,
        ] as ReactNode[]
      })
      return <MiniTable head={['Intent', 'Count', '% of Connected', '% dropped from previous']} rows={rows} />
    },
  },
  {
    id: 'campaign-report', title: 'Campaign Report', size: 'lg', render: c => {
      const head = ['Campaign', ...REPORT_COLS.map(col => col.head), 'Duration', 'CPL', 'Spent']
      const rows = c.reports.map(r => [
        r.campaign?.name ?? '—',
        ...REPORT_COLS.map(col => fmtN(Number(r[col.key]) || 0)),
        r.duration,
        fmtR(Number(r.cpl) || 0),
        fmtR(Number(r.total_spent) || 0),
      ])
      return <Box sx={{ overflowX: 'auto' }}><MiniTable head={head} rows={rows} /></Box>
    },
  },
]
