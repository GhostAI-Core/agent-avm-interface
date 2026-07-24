'use client'
import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import AgentChip from '@/components/ui/AgentChip'
import StatusChip from '@/components/ui/StatusChip'
import { Sparkline } from '@/components/InsightCharts'
import FunnelGraphFlow from '@/components/FunnelGraphFlow'
import { maskPhone } from '@/lib/security'
import { colors } from '@/lib/tokens'
import type { InsightCtx } from '@/lib/dashboardInsights'
import type { CampaignLiveStatus, CampaignReport, Campaign } from '@/types'

// ── formatting (mirrors dashboardInsights; kept local so the panel is self-contained) ──
const za = (n: number, d = 0) => {
  const [i, dec] = Math.abs(n).toFixed(d).split('.')
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return (n < 0 ? '-' : '') + (d ? `${g},${dec}` : g)
}
const fmtN = (n: number) => za(n, 0)
const fmtR = (n: number) => `R${za(n, 2)}`
const pct = (n: number, dd: number) => (dd ? `${((n / dd) * 100).toFixed(1)}%` : '—')
const fmtTime = (s: number) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`
const sumR = (rows: CampaignReport[], k: keyof CampaignReport) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0)

function lastDays(n: number): string[] {
  const out: string[] = []
  const base = new Date()
  for (let i = n - 1; i >= 0; i--) out.push(new Date(base.getTime() - i * 86400000).toISOString().slice(0, 10))
  return out
}
type DayCall = InsightCtx['calls'][number]
function daySeries(calls: DayCall[], fn: (dayCalls: DayCall[]) => number): number[] {
  return lastDays(14).map(d => fn(calls.filter(c => (c.called_at || '').slice(0, 10) === d)))
}
/** day-over-day delta from a series, as a signed percentage string + tone */
function delta(series: number[]): { label: string; tone: 'pos' | 'neg' | 'neu' } {
  const a = series[series.length - 2] || 0, b = series[series.length - 1] || 0
  if (!a && !b) return { label: '—', tone: 'neu' }
  const d = a ? ((b - a) / a) * 100 : 100
  const s = `${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}%`
  return { label: s, tone: d >= 0 ? 'pos' : 'neg' }
}

const TONE: Record<'pos' | 'neg' | 'neu', string> = { pos: colors.glow, neg: colors.negative, neu: colors.fg3 }
const SPARK: Record<'pos' | 'neg' | 'neu', string> = { pos: colors.glow, neg: colors.negative, neu: colors.info }

// ── surface hierarchy (from the reference) ──────────────────────────────────────
// A layered depth system on a #1F1F1F canvas: the LIVE NOW hero band sits recessed,
// section shells blend with the canvas (border-defined), and content cards lift above it.
const SURF = {
  band: '#141414',      // LIVE NOW hero band (recessed)
  section: colors.bg0,  // section shell / canvas (#1F1F1F)
  campaign: colors.bg0, // campaign card inside the band (#1F1F1F, raised vs band)
  inner: '#252525',     // funnel / feed / donut cards
  group: '#232323',     // KPI group panels
} as const
const INSET = 'inset 0 1px 0 rgba(255,255,255,0.03)' // top highlight = the "sleek" catch of light

// ── shared shells ───────────────────────────────────────────────────────────────
function Panel({ children, sx }: { children: React.ReactNode; sx?: object }) {
  // Inner content card (#252525) — raised above the section shell, with the top highlight.
  return (
    <Box sx={{ bgcolor: SURF.inner, border: `1px solid ${colors.border1}`, borderRadius: '8px', boxShadow: INSET, p: 2.25, ...sx }}>
      {children}
    </Box>
  )
}
// Outlined section shell: blends with the canvas, defined by its border + a header bar.
function SectionCard({ label, note, dot, children, bodySx }: {
  label: string; note?: string; dot?: string; children: React.ReactNode; bodySx?: object
}) {
  return (
    <Box sx={{ bgcolor: SURF.section, border: `1px solid ${colors.border1}`, borderRadius: '8px', boxShadow: INSET, overflow: 'hidden' }}>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, p: '14px 16px 10px' }}>
        {dot && <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: dot }} />}
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: colors.fg3 }}>{label}</Typography>
        {note && <Typography sx={{ ml: 'auto', fontSize: '0.7rem', color: colors.fg4 }}>{note}</Typography>}
      </Stack>
      <Box sx={{ p: '0 16px 16px', ...bodySx }}>{children}</Box>
    </Box>
  )
}
function SectionLabel({ dot, text, note }: { dot?: string; text: string; note?: string }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.5 }}>
      {dot && <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: dot }} />}
      <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: colors.fg3 }}>{text}</Typography>
      {note && <Typography sx={{ ml: 'auto', fontSize: '0.7rem', color: colors.fg4 }}>{note}</Typography>}
    </Stack>
  )
}
const Num = ({ children, sx }: { children: React.ReactNode; sx?: object }) => (
  <Typography className="mono" component="span" sx={{ letterSpacing: '-0.5px', ...sx }}>{children}</Typography>
)
// Metric-group heading: accent dot + tight uppercase label (reference: 10px/700/.12em).
function GroupLabel({ accent, label }: { accent: string; label: string }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 1.25 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: accent, flex: 'none' }} />
      <Typography sx={{ fontSize: '0.63rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: colors.fg3 }}>{label}</Typography>
    </Stack>
  )
}

// ── live-now ─────────────────────────────────────────────────────────────────────
function LiveCard({ camp, ls, report }: { camp: Campaign; ls?: CampaignLiveStatus; report?: CampaignReport }) {
  const active = ls?.active_calls ?? 0
  const queued = ls?.queued ?? 0
  const conn = report?.connected ?? 0
  const qual = report?.qualified ?? 0
  const dialed = ls?.dialed ?? 0
  const remaining = (ls?.pending ?? 0) + (ls?.queued ?? 0) + (ls?.in_progress ?? 0)
  const progress = dialed + remaining ? (dialed / (dialed + remaining)) * 100 : 0
  const paused = camp.status === 'paused'
  const cells: [string, number][] = [['Active', active], ['Queued', queued], ['Conn/hr', conn], ['Qualified', qual]]
  return (
    <Box sx={{
      flex: '1 1 210px', minWidth: 200, bgcolor: SURF.campaign, border: `1px solid ${colors.border1}`,
      borderRadius: '6px', p: '14px', display: 'flex', flexDirection: 'column', gap: 1.5,
      transition: 'border-color .12s, transform .12s',
      '&:hover': { borderColor: colors.green, transform: 'translateY(-2px)' },
    }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 0.875, minWidth: 0 }}>
          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: paused ? colors.warning : colors.green, flex: '0 0 auto', animation: paused ? 'none' : 'livePulse 1.4s infinite' }} />
          <Typography sx={{ fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{camp.name}</Typography>
        </Stack>
        <StatusChip status={camp.status} autoPaused={camp.auto_paused} />
      </Stack>
      <Stack direction="row" sx={{ gap: 2.5 }}>
        {cells.map(([label, val]) => (
          <Box key={label}>
            <Num sx={{ fontSize: '1.2rem', fontWeight: 700, color: label === 'Conn/hr' || label === 'Qualified' ? colors.glow : colors.fg1 }}>{fmtN(val)}</Num>
            <Typography sx={{ fontSize: '0.62rem', color: colors.fg3 }}>{label}</Typography>
          </Box>
        ))}
      </Stack>
      <Box>
        <LinearProgress variant="determinate" value={Math.min(100, progress)} sx={{ height: 5, borderRadius: 3, bgcolor: colors.bg3, '& .MuiLinearProgress-bar': { bgcolor: paused ? colors.fg4 : colors.green, borderRadius: 3 } }} />
        <Typography sx={{ fontSize: '0.66rem', color: colors.fg4, mt: 0.75 }}>
          {paused ? `Paused at ${progress.toFixed(0)}%` : `${progress.toFixed(0)}% of contacts dialed`}
        </Typography>
      </Box>
    </Box>
  )
}

// ── metric card ──────────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, series, accent, deltaSub }: {
  label: string; value: string; sub: string; series: number[]; accent: string
  /** show the day-over-day delta (e.g. "▲ 6.2%") as the sub line instead of the passed text */
  deltaSub?: boolean
}) {
  const d = delta(series)
  // Reference card: bg #292929 (bg1), border #1A1A1A (border1), 2px accent top-rule, 6px radius.
  // Grid-sized by its container (no flex/min-width here).
  return (
    <Box sx={{ bgcolor: colors.bg1, border: `1px solid ${colors.border1}`, borderTop: `2px solid ${accent}`, borderRadius: '6px', p: '13px 15px', position: 'relative', minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: colors.fg3, mb: 0.5 }}>{label}</Typography>
      <Num sx={{ fontSize: '1.65rem', fontWeight: 700, lineHeight: 1.05, display: 'block' }}>{value}</Num>
      <Typography sx={{ fontSize: '0.72rem', color: TONE[d.tone], mt: 0.5 }}>{deltaSub ? d.label : sub}</Typography>
      <Typography sx={{ fontSize: '0.66rem', color: colors.fg4 }}>last 24h</Typography>
      <Box sx={{ position: 'absolute', right: 15, bottom: 13, width: 52, height: 20 }}>
        <Sparkline data={series} color={SPARK[d.tone]} />
      </Box>
    </Box>
  )
}

// ── funnel ───────────────────────────────────────────────────────────────────────
// Distinct solid green-schema shade per stage. Also drives legend swatches.
const FUNNEL_FILL = ['#1F6F35', '#2E8B4E', '#3FA968', '#5BE8BE', '#8CF3D6']
// Per-campaign colours for the Option 2 flow (funnel-graph-js), kept in the green schema.
const FLOW_COLORS: string[] = ['#37A660', '#5BE8BE', '#6DC2FF', '#60BC84', '#C99A2D']
const FLOW_OTHER: string = '#909090'
function darken(hex: string, f = 0.6) {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${Math.round(((n >> 16) & 255) * f)}, ${Math.round(((n >> 8) & 255) * f)}, ${Math.round((n & 255) * f)})`
}
function lighten(hex: string, amt = 0.24) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, ((n >> 16) & 255) + 255 * amt)
  const g = Math.min(255, ((n >> 8) & 255) + 255 * amt)
  const b = Math.min(255, (n & 255) + 255 * amt)
  return `rgb(${r | 0}, ${g | 0}, ${b | 0})`
}

// Numbered 3D funnel (client reference, dimensional): each stage is a shaded cone frustum — an
// elliptical rim on top, cylindrical light-centre→dark-edge shading across the body, and a soft
// drop shadow for depth. Index on the left, label + count + conversion % on a right leader,
// tapering to a cone tip. Decorative gentle taper — the numbers carry the real magnitudes.
function Funnel({ stages, hover, onHover }: {
  stages: { label: string; count: number }[]
  hover: number | null
  onHover: (i: number | null) => void
}) {
  const W = 820, H = 560
  const N = stages.length
  const cx = 340
  const startY = 56, segH = (H - 150) / N, GAP = 18, bandH = segH - GAP
  const pointH = 54
  const leaderX = 560
  const top0 = 360
  const step = 0.82
  const wTop = (k: number) => top0 * Math.pow(step, k)
  const dialed = stages[0]?.count || 1
  const ryOf = (w: number) => Math.min(16, Math.max(6, (w / 2) * 0.16)) // perspective squash of the rim
  const lastFill = FUNNEL_FILL[N - 1] || FUNNEL_FILL[FUNNEL_FILL.length - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', maxHeight: 500, margin: '0 auto' }}>
      <defs>
        <filter id="fnl-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.45" />
        </filter>
        {FUNNEL_FILL.map((c, i) => (
          // cylindrical shading: dark edge → light centre → dark edge, across the body
          <linearGradient key={i} id={`fnl-body-${i}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={darken(c, 0.62)} />
            <stop offset="0.5" stopColor={lighten(c, 0.1)} />
            <stop offset="1" stopColor={darken(c, 0.62)} />
          </linearGradient>
        ))}
      </defs>
      {/* bottom cone tip — drawn first so it sits behind the last frustum */}
      {(() => {
        const bW = wTop(N - 1) * 0.66, rxb = bW / 2
        const yB = startY + (N - 1) * segH + bandH
        const tip = `M ${cx - rxb} ${yB} A ${rxb} ${ryOf(bW)} 0 0 0 ${cx + rxb} ${yB} L ${cx} ${yB + pointH} Z`
        return <path d={tip} fill={darken(lastFill, 0.78)} filter="url(#fnl-shadow)" opacity={hover === null ? 1 : 0.5} />
      })()}
      {/* frustum bodies painted BOTTOM→TOP so each wider upper cone overlaps the one below and its
          shadow falls downward onto it (correct near/far layering — was reversed) */}
      {stages.map((s, i) => {
        const tW = wTop(i)
        const bW = i < N - 1 ? wTop(i + 1) : tW * 0.66
        const yT = startY + i * segH, yB = yT + bandH
        const rxt = tW / 2, rxb = bW / 2, ryT = ryOf(tW), ryB = ryOf(bW)
        const fill = FUNNEL_FILL[i] || lastFill
        const dim = hover !== null && hover !== i
        const body = `M ${cx - rxt} ${yT} L ${cx - rxb} ${yB} A ${rxb} ${ryB} 0 0 0 ${cx + rxb} ${yB} L ${cx + rxt} ${yT} A ${rxt} ${ryT} 0 0 1 ${cx - rxt} ${yT} Z`
        return (
          <g key={s.label} onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)}
            style={{ cursor: 'pointer', opacity: dim ? 0.35 : 1, transition: 'opacity 120ms ease' }}>
            <path d={body} fill={`url(#fnl-body-${i})`} filter="url(#fnl-shadow)" />
            <ellipse cx={cx} cy={yT} rx={rxt} ry={ryT} fill={lighten(fill, 0.2)} />
          </g>
        )
      }).reverse()}
      {/* labels drawn last so no cone body ever covers a number, count, or leader */}
      {stages.map((s, i) => {
        const tW = wTop(i), bW = i < N - 1 ? wTop(i + 1) : tW * 0.66
        const yT = startY + i * segH, mid = yT + bandH / 2
        const fill = FUNNEL_FILL[i] || lastFill
        const dim = hover !== null && hover !== i
        const rightMid = cx + (tW / 2 + bW / 2) / 2
        const conv = i === 0 ? '100%' : `${((s.count / dialed) * 100).toFixed(1)}%`
        return (
          <g key={s.label} style={{ opacity: dim ? 0.35 : 1, transition: 'opacity 120ms ease', pointerEvents: 'none' }}>
            <text x={110} y={mid + bandH * 0.18 + 12} textAnchor="end" fontSize="34" fontWeight="800" fill={fill} style={{ fontFamily: 'var(--font-mono)' }}>{String(i + 1).padStart(2, '0')}</text>
            {/* nudged below geometric mid so the count reads centred in the cone's VISIBLE area
                (the rim + the overlap from the cone above eat the top of each band) */}
            <text x={cx} y={mid + bandH * 0.18} textAnchor="middle" fontSize="17" fontWeight="800" fill={i >= 3 ? '#0E2014' : '#F2FFFA'} style={{ fontFamily: 'var(--font-mono)' }}>{fmtN(s.count)}</text>
            <line x1={rightMid} y1={mid} x2={leaderX - 8} y2={mid} stroke={fill} strokeWidth={1.5} strokeOpacity={0.7} />
            <text x={leaderX} y={mid - 3} textAnchor="start" fontSize="15" fontWeight="700" fill={fill}>{s.label}</text>
            <text x={leaderX} y={mid + 15} textAnchor="start" fontSize="12.5" fill={colors.fg3}>{conv} of dialed</text>
          </g>
        )
      })}
    </svg>
  )
}

// Segmented control to flip between the two funnel designs (Option 1 / Option 2).
function FunnelStyleToggle({ value, onChange }: { value: 'cone' | 'flow'; onChange: (v: 'cone' | 'flow') => void }) {
  const opts: { key: 'cone' | 'flow'; label: string }[] = [
    { key: 'cone', label: '3D Funnel' }, { key: 'flow', label: 'Flow' },
  ]
  return (
    <Stack direction="row" sx={{ bgcolor: colors.bg3, borderRadius: '6px', p: '2px', gap: '2px' }}>
      {opts.map(o => {
        const on = value === o.key
        return (
          <Box key={o.key} component="button" onClick={() => onChange(o.key)}
            sx={{
              px: 1.25, py: 0.4, borderRadius: '4px', border: 'none', cursor: 'pointer',
              fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.03em',
              bgcolor: on ? colors.green : 'transparent', color: on ? colors.greenInk : colors.fg3,
              transition: 'background-color .12s, color .12s',
            }}>{o.label}</Box>
        )
      })}
    </Stack>
  )
}

// ── outcome donut ──────────────────────────────────────────────────────────────
// Pure helper (module scope) so the running arc offset isn't a reassigned render-body
// variable — keeps the react-hooks/immutability lint happy.
function donutArcs(segments: { label: string; value: number; color: string }[], total: number, C: number) {
  const arcs: { label: string; color: string; dash: number; offset: number }[] = []
  let offset = 0
  for (const s of segments) {
    const dash = (s.value / total) * C
    arcs.push({ label: s.label, color: s.color, dash, offset })
    offset += dash
  }
  return arcs
}
function Donut({ segments, centerPct }: { segments: { label: string; value: number; color: string }[]; centerPct: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1
  const R = 54, C = 2 * Math.PI * R, SW = 20, size = 140, cx = size / 2, cy = size / 2
  return (
    <Box sx={{ position: 'relative', width: size, height: size, flex: '0 0 auto' }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={cx} cy={cy} r={R} fill="none" stroke={colors.bg3} strokeWidth={SW} />
        {donutArcs(segments, total, C).map(a => (
          <circle key={a.label} cx={cx} cy={cy} r={R} fill="none" stroke={a.color} strokeWidth={SW}
            strokeDasharray={`${a.dash} ${C - a.dash}`} strokeDashoffset={-a.offset} transform={`rotate(-90 ${cx} ${cy})`} />
        ))}
      </svg>
      <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Num sx={{ fontSize: '1.4rem', fontWeight: 700, color: colors.glow }}>{centerPct}</Num>
        <Typography sx={{ fontSize: '0.6rem', color: colors.fg3, textTransform: 'lowercase' }}>connected</Typography>
      </Box>
    </Box>
  )
}

// ── outcome-feed tag ───────────────────────────────────────────────────────────
function OutcomeTag({ outcome }: { outcome: string }) {
  const o = (outcome || '').toLowerCase()
  const map: Record<string, { label: string; bg: string; fg: string; border?: string }> = {
    lead: { label: 'LEAD', bg: colors.green, fg: '#06170D' },
    subscribed: { label: 'SUBSCRIBED', bg: 'rgba(55,166,96,0.18)', fg: colors.greenBright, border: colors.green },
    qualified: { label: 'SUBSCRIBED', bg: 'rgba(55,166,96,0.18)', fg: colors.greenBright, border: colors.green },
    connected: { label: 'CONNECTED', bg: 'transparent', fg: colors.greenBright, border: colors.green },
    transferred: { label: 'TRANSFERRED', bg: 'rgba(109,194,255,0.15)', fg: colors.info, border: 'rgba(109,194,255,0.4)' },
    voicemail: { label: 'VOICEMAIL', bg: 'rgba(109,194,255,0.15)', fg: colors.info, border: 'rgba(109,194,255,0.4)' },
    no_answer: { label: 'NO ANSWER', bg: 'transparent', fg: colors.fg3, border: colors.border3 },
    hangup: { label: 'HANGUP', bg: 'rgba(224,82,79,0.15)', fg: colors.negative, border: 'rgba(224,82,79,0.4)' },
    opted_out: { label: 'OPTED OUT', bg: 'rgba(224,82,79,0.15)', fg: colors.negative, border: 'rgba(224,82,79,0.4)' },
    opt_out: { label: 'OPTED OUT', bg: 'rgba(224,82,79,0.15)', fg: colors.negative, border: 'rgba(224,82,79,0.4)' },
    failed: { label: 'FAILED', bg: 'transparent', fg: colors.fg4, border: colors.border3 },
    busy: { label: 'BUSY', bg: 'rgba(201,154,45,0.15)', fg: colors.warning, border: 'rgba(201,154,45,0.4)' },
  }
  const t = map[o] || { label: (outcome || 'UNKNOWN').toUpperCase(), bg: 'transparent', fg: colors.fg3, border: colors.border3 }
  return (
    <Box component="span" sx={{ px: 0.9, py: 0.25, borderRadius: 1, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em', bgcolor: t.bg, color: t.fg, border: `1px solid ${t.border || t.bg}` }}>{t.label}</Box>
  )
}

// ── campaign drill-down ─────────────────────────────────────────────────────────
function CampaignDrill({ camp, report, ls, onClose }: {
  camp: Campaign; report?: CampaignReport; ls?: CampaignLiveStatus; onClose: () => void
}) {
  const dialed = report?.dialed ?? ls?.dialed ?? 0
  const connected = report?.connected ?? 0
  const qualified = report?.qualified ?? 0
  const lead = report?.lead ?? 0
  const engaged = Math.max(qualified, connected - (report?.hangup ?? 0))
  const spent = report?.total_spent ?? 0
  const cpl = report?.cpl ?? (lead ? spent / lead : 0)
  const remaining = (ls?.pending ?? 0) + (ls?.queued ?? 0) + (ls?.in_progress ?? 0)
  const progress = dialed + remaining ? (dialed / (dialed + remaining)) * 100 : (dialed ? 100 : 0)
  const paused = camp.status === 'paused'
  const tiles: [string, string, string?][] = [
    ['Dialed', fmtN(dialed)], ['Connected', fmtN(connected)],
    ['Qualified', fmtN(qualified), colors.glow], ['Opt-in / Lead', fmtN(lead), colors.glow],
    ['Total Spent', fmtR(spent)], ['CPL', fmtR(cpl)],
  ]
  const stages = [
    { label: 'Dialed', count: dialed }, { label: 'Connected', count: connected },
    { label: 'Engaged', count: engaged }, { label: 'Qualified', count: qualified }, { label: 'Opt-in / Lead', count: lead },
  ]
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth
      slotProps={{ paper: { sx: { bgcolor: colors.bg2, border: `1px solid ${colors.border2}`, borderRadius: 2, backgroundImage: 'none' } } }}>
      <Box sx={{ p: 2.5 }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1.25, mb: 2 }}>
          <StatusChip status={camp.status} autoPaused={camp.auto_paused} />
          <AgentChip agent={report?.campaign?.agent ?? camp.agent ?? 'seeker'} />
          <Typography sx={{ fontWeight: 700, fontSize: '1.05rem', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{camp.name}</Typography>
          <IconButton onClick={onClose} size="small" sx={{ color: colors.fg3 }}><CloseIcon sx={{ fontSize: 20 }} /></IconButton>
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 1.25, mb: 2.25 }}>
          {tiles.map(([label, value, accent]) => (
            <Box key={label} sx={{ bgcolor: colors.bg1, border: `1px solid ${colors.border1}`, borderRadius: 1.5, p: 1.5 }}>
              <Num sx={{ fontSize: '1.3rem', fontWeight: 700, color: accent ?? colors.fg1, display: 'block' }}>{value}</Num>
              <Typography sx={{ fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.fg3, mt: 0.25 }}>{label}</Typography>
            </Box>
          ))}
        </Box>

        <SectionLabel text="Contacts Progress" />
        <LinearProgress variant="determinate" value={Math.min(100, progress)} sx={{ height: 8, borderRadius: 4, bgcolor: colors.bg3, mb: 0.75, '& .MuiLinearProgress-bar': { bgcolor: paused ? colors.fg4 : colors.green, borderRadius: 4 } }} />
        <Typography sx={{ fontSize: '0.72rem', color: colors.fg4, mb: 2.25 }}>
          {paused ? `Paused at ${progress.toFixed(0)}%` : `${progress.toFixed(0)}% of contacts dialed`}
        </Typography>

        <SectionLabel text="Funnel" note="conversion by stage" />
        <Stack direction="row" sx={{ gap: 3, alignItems: 'stretch', flexWrap: 'wrap', justifyContent: 'space-between', minHeight: 320 }}>
          <Box sx={{ flex: '1 1 260px', minWidth: 220, display: 'flex', alignItems: 'stretch', justifyContent: 'center' }}><Funnel stages={stages} hover={null} onHover={() => {}} /></Box>
          <Stack sx={{ gap: 1.25, flex: '1 1 240px', minWidth: 200, justifyContent: 'center' }}>
            {stages.map((s, i) => (
              <Stack key={s.label} direction="row" sx={{ alignItems: 'center', gap: 1 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: FUNNEL_FILL[i] }} />
                <Typography sx={{ fontSize: '0.82rem', flex: 1 }}>{s.label}</Typography>
                <Num sx={{ fontSize: '0.85rem', fontWeight: 700 }}>{fmtN(s.count)}</Num>
                <Typography sx={{ fontSize: '0.72rem', color: colors.fg4, width: 46, textAlign: 'right' }}>{pct(s.count, i === 0 ? dialed : stages[0].count)}</Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </Box>
    </Dialog>
  )
}

// ── main ──────────────────────────────────────────────────────────────────────
export default function ControlRoom({ ctx, liveStatus }: {
  ctx: InsightCtx
  liveStatus: Record<number, CampaignLiveStatus>
  /** kept for API compatibility; row clicks now open the drill-down modal */
  onSelectCampaign?: (id: number) => void
}) {
  const { reports, calls, campaigns } = ctx
  const [hoverStage, setHoverStage] = useState<number | null>(null)
  const [drillId, setDrillId] = useState<number | null>(null)
  // Two funnel designs for the client to choose between (toggle in the panel header).
  const [funnelStyle, setFunnelStyle] = useState<'cone' | 'flow'>('cone')

  const m = useMemo(() => {
    const dialed = sumR(reports, 'dialed'), connected = sumR(reports, 'connected'), qualified = sumR(reports, 'qualified')
    const lead = sumR(reports, 'lead'), voicemail = sumR(reports, 'voicemail'), hangup = sumR(reports, 'hangup')
    const optOut = sumR(reports, 'opt_out'), noAnswer = sumR(reports, 'no_answer'), failed = sumR(reports, 'failed')
    const busy = sumR(reports, 'busy_line'), totalSpent = sumR(reports, 'total_spent')
    const engaged = Math.max(qualified, connected - hangup)
    const answered = calls.filter(c => (c.talk_seconds || 0) > 0)
    const avgTalk = answered.length ? answered.reduce((a, c) => a + (c.talk_seconds || 0), 0) / answered.length : 0
    const onAirHrs = calls.reduce((a, c) => a + (c.on_air_seconds || c.talk_seconds || 0), 0) / 3600
    const cpl = lead ? totalSpent / lead : (qualified ? totalSpent / qualified : 0)
    return { dialed, connected, qualified, lead, voicemail, hangup, optOut, noAnswer, failed, busy, totalSpent, engaged, avgTalk, onAirHrs, cpl }
  }, [reports, calls])

  const reportByCamp = useMemo(() => {
    const map = new Map<number, CampaignReport>()
    for (const r of reports) map.set(r.campaign_id, r)
    return map
  }, [reports])

  const liveCamps = campaigns.filter(c => c.status === 'running' || c.status === 'paused')
  const running = liveCamps.filter(c => c.status === 'running').length
  const paused = liveCamps.filter(c => c.status === 'paused').length
  const activeOnAir = Object.values(liveStatus).reduce((a, s) => a + (s.active_calls || 0), 0)

  const cnt = (pred: (c: DayCall) => boolean) => (b: DayCall[]) => b.filter(pred).length
  const isO = (o: string) => (c: DayCall) => c.outcome === o

  // ── metric groups (10 indicators) ──
  const GROUPS: { label: string; accent: string; cards: { label: string; value: string; sub: string; series: number[]; deltaSub?: boolean }[] }[] = [
    {
      label: 'Funnel Metrics', accent: colors.info, cards: [
        { label: 'Dialed', value: fmtN(m.dialed), sub: 'total dialed', series: daySeries(calls, b => b.length), deltaSub: true },
        { label: 'Connected', value: fmtN(m.connected), sub: `${pct(m.connected, m.dialed)} rate`, series: daySeries(calls, cnt(isO('connected'))) },
        { label: 'Qualified', value: fmtN(m.qualified), sub: `${pct(m.qualified, m.connected)} of conn`, series: daySeries(calls, cnt(isO('qualified'))) },
      ],
    },
    {
      label: 'Call Outcomes', accent: '#E0B13F', cards: [
        { label: 'Voicemail', value: fmtN(m.voicemail), sub: `${pct(m.voicemail, m.dialed)} of dial`, series: daySeries(calls, cnt(isO('voicemail'))) },
        { label: 'Hangup', value: fmtN(m.hangup), sub: `${pct(m.hangup, m.connected)} of conn`, series: daySeries(calls, cnt(isO('hangup'))) },
        { label: 'Opt-outs', value: fmtN(m.optOut), sub: `${pct(m.optOut, m.connected)} of conn`, series: daySeries(calls, cnt(isO('opt_out'))) },
      ],
    },
    {
      label: 'Operations', accent: colors.glow, cards: [
        { label: 'Avg Call Duration', value: fmtTime(m.avgTalk), sub: 'per answered call', series: daySeries(calls, b => { const a = b.filter(c => (c.talk_seconds || 0) > 0); return a.length ? a.reduce((s, c) => s + (c.talk_seconds || 0), 0) / a.length : 0 }) },
        { label: 'Campaign Run Time', value: `${Math.round(m.onAirHrs)}h`, sub: 'on-air, all camps', series: daySeries(calls, b => b.reduce((s, c) => s + (c.on_air_seconds || c.talk_seconds || 0), 0) / 3600) },
      ],
    },
    {
      label: 'Financials', accent: colors.green, cards: [
        { label: 'Total Spent', value: fmtR(m.totalSpent), sub: 'this period', series: daySeries(calls, b => b.reduce((s, c) => s + Number(c.cost || 0), 0)) },
        { label: 'CPL', value: fmtR(m.cpl), sub: 'cost per lead', series: daySeries(calls, b => { const l = b.filter(isO('lead')).length; const sp = b.reduce((s, c) => s + Number(c.cost || 0), 0); return l ? sp / l : 0 }) },
      ],
    },
  ]

  const funnelStages = [
    { label: 'Dialed', count: m.dialed }, { label: 'Connected', count: m.connected },
    { label: 'Engaged', count: m.engaged }, { label: 'Qualified', count: m.qualified }, { label: 'Opt-in / Lead', count: m.lead },
  ]

  // Option 2 (flow) — data shaped for funnel-graph-js: stages become labels, campaigns become
  // subLabels (top 3 by dialed + an "Other" roll-up), values[stage] = [per campaign]. Each
  // campaign gets a 2-stop gradient in the green schema. Memoised so the lib only redraws on change.
  const flowData = useMemo(() => {
    const stageLabels = ['Dialed', 'Connected', 'Engaged', 'Qualified', 'Opt-in / Lead']
    const stageVals = (r?: CampaignReport): number[] => {
      const c = r?.connected ?? 0, h = r?.hangup ?? 0
      return [r?.dialed ?? 0, c, Math.max(r?.qualified ?? 0, c - h), r?.qualified ?? 0, r?.lead ?? 0]
    }
    const ranked = [...reports].sort((a, b) => (b.dialed || 0) - (a.dialed || 0))
    const series = ranked.slice(0, 3).map((r, i) => ({
      name: (r.campaign?.name || `Campaign ${r.campaign_id}`).slice(0, 20),
      vals: stageVals(r), color: FLOW_COLORS[i % FLOW_COLORS.length],
    }))
    const rest = ranked.slice(3)
    if (rest.length) {
      const summed = rest.reduce<number[]>((acc, r) => stageVals(r).map((v, i) => (acc[i] || 0) + v), [])
      series.push({ name: `Other (${rest.length})`, vals: summed, color: FLOW_OTHER })
    }
    return {
      labels: stageLabels,
      subLabels: series.map(s => s.name),
      colors: series.map(s => [s.color, lighten(s.color, 0.18)]),
      values: stageLabels.map((_, k) => series.map(s => s.vals[k] || 0)),
    }
  }, [reports])

  const donutSegs = [
    { label: 'Connected', value: m.connected, color: colors.green },
    { label: 'Voicemail', value: m.voicemail, color: colors.info },
    { label: 'Failed', value: m.failed, color: colors.fg4 },
    { label: 'No Answer', value: m.noAnswer, color: colors.fg3 },
    { label: 'Hangup', value: m.hangup, color: colors.negative },
    { label: 'Busy', value: m.busy, color: colors.warning },
  ]

  const feed = useMemo(() =>
    [...calls].sort((a, b) => (b.called_at || '').localeCompare(a.called_at || '')).slice(0, 9)
    , [calls])

  const tableRows = useMemo(() =>
    [...reports].sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))
    , [reports])

  return (
    <Stack sx={{ gap: 2.5 }}>
      {/* ── LIVE NOW hero band ── */}
      <Box sx={{ bgcolor: SURF.band, border: `1px solid ${colors.border1}`, borderRadius: '8px', boxShadow: INSET, p: '18px 20px', display: 'flex', gap: 2.75, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <Stack sx={{ flex: 'none', width: 190, gap: 1.25, justifyContent: 'center', borderRight: { md: `1px solid ${colors.border1}` }, pr: { md: 2.5 } }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: colors.green, animation: 'livePulse 1.4s infinite' }} />
            <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.greenBright }}>Live Now</Typography>
          </Stack>
          <Num sx={{ fontSize: '2.6rem', fontWeight: 700, lineHeight: 1 }}>{fmtN(activeOnAir)}</Num>
          <Typography sx={{ fontSize: '0.75rem', color: colors.fg3 }}>active calls on air</Typography>
          <Typography sx={{ fontSize: '0.78rem' }}>
            <Box component="span" sx={{ color: colors.green, fontWeight: 700 }}>{running} running</Box>
            <Box component="span" sx={{ color: colors.fg3 }}>{'   '}</Box>
            <Box component="span" sx={{ color: colors.warning, fontWeight: 700 }}>{paused} paused</Box>
          </Typography>
          <Box sx={{ pt: 1.25, mt: 0.25, borderTop: `1px solid ${colors.border1}` }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={{ fontSize: '0.72rem', color: colors.fg3 }}>Connected</Typography><Num sx={{ fontSize: '0.82rem', fontWeight: 700 }}>{fmtN(m.connected)}</Num></Stack>
            <Stack direction="row" sx={{ justifyContent: 'space-between', mt: 0.5 }}><Typography sx={{ fontSize: '0.72rem', color: colors.fg3 }}>Qualified</Typography><Num sx={{ fontSize: '0.82rem', fontWeight: 700, color: colors.glow }}>{fmtN(m.qualified)}</Num></Stack>
          </Box>
        </Stack>
        <Box sx={{ flex: '1 1 520px', minWidth: 260, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'stretch' }}>
          {liveCamps.length
            ? liveCamps.slice(0, 3).map(c => <LiveCard key={c.id} camp={c} ls={liveStatus[c.id]} report={reportByCamp.get(c.id)} />)
            : <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 120 }}><Typography sx={{ color: colors.fg4, fontSize: '0.85rem' }}>No live campaigns</Typography></Box>}
        </Box>
      </Box>

      {/* ── KEY METRICS ── */}
      {/* Reference layout: Funnel Metrics is a full-width pipeline; Call Outcomes / Operations /
          Financials are enclosed panels sharing one flex-wrap row, each flexing by its card count. */}
      <SectionCard label="Key Metrics" note="10 indicators">
        <Stack sx={{ gap: 2 }}>
          <Box>
            <GroupLabel accent={GROUPS[0].accent} label={GROUPS[0].label} />
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 1.5 }}>
              {GROUPS[0].cards.map(c => <MetricCard key={c.label} {...c} accent={GROUPS[0].accent} />)}
            </Box>
          </Box>
          <Stack direction="row" sx={{ gap: 1.75, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {GROUPS.slice(1).map(g => (
              <Box key={g.label} sx={{ flex: `${g.cards.length} 1 240px`, minWidth: 240, bgcolor: SURF.group, border: `1px solid ${colors.border1}`, borderRadius: '8px', p: '14px 15px' }}>
                <GroupLabel accent={g.accent} label={g.label} />
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 1.25 }}>
                  {g.cards.map(c => <MetricCard key={c.label} {...c} accent={g.accent} />)}
                </Box>
              </Box>
            ))}
          </Stack>
        </Stack>
      </SectionCard>

      {/* ── FUNNEL & OUTCOMES ── */}
      <SectionCard label="Funnel & Outcomes">
        <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap', alignItems: 'stretch' }}>
          <Panel sx={{ flex: '2 1 520px', minWidth: 320 }}>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <SectionLabel text="Dialling Funnel" note={funnelStyle === 'cone' ? 'hover a stage' : 'by campaign'} />
              <FunnelStyleToggle value={funnelStyle} onChange={setFunnelStyle} />
            </Stack>
            {funnelStyle === 'cone' ? (
              <Box sx={{ minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Funnel stages={funnelStages} hover={hoverStage} onHover={setHoverStage} />
              </Box>
            ) : (
              <Box sx={{ minHeight: 360, display: 'flex', alignItems: 'center' }}>
                <FunnelGraphFlow data={flowData} />
              </Box>
            )}
          </Panel>
          <Stack sx={{ flex: '1 1 320px', minWidth: 280, gap: 2 }}>
            <Panel>
              <SectionLabel dot={colors.green} text="Live Outcome Feed" />
              <Stack sx={{ gap: 0.85 }}>
                {feed.length ? feed.map((c, i) => (
                  <Stack key={i} direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Num sx={{ fontSize: '0.8rem', color: colors.fg2 }}>{maskPhone(c.phone || '')}</Num>
                    <OutcomeTag outcome={c.outcome} />
                  </Stack>
                )) : <Typography sx={{ color: colors.fg4, fontSize: '0.8rem' }}>No calls yet</Typography>}
              </Stack>
            </Panel>
            <Panel>
              <SectionLabel text="Call Outcome Breakdown" />
              <Stack direction="row" sx={{ gap: 2, alignItems: 'center' }}>
                <Donut segments={donutSegs} centerPct={pct(m.connected, m.dialed)} />
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 1.5, rowGap: 0.85, flex: 1 }}>
                  {donutSegs.map(s => (
                    <Stack key={s.label} direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: s.color, flex: '0 0 auto' }} />
                      <Typography sx={{ fontSize: '0.72rem', color: colors.fg3, flex: 1, whiteSpace: 'nowrap' }}>{s.label}</Typography>
                      <Num sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{fmtN(s.value)}</Num>
                    </Stack>
                  ))}
                </Box>
              </Stack>
            </Panel>
          </Stack>
        </Stack>
      </SectionCard>

      {/* ── CAMPAIGN PERFORMANCE ── */}
      <SectionCard label="Campaign Performance" bodySx={{ p: 0 }}>
        <Box sx={{ overflowX: 'auto' }}>
            <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <Box component="thead">
                <Box component="tr" sx={{ '& th': { textAlign: 'right', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: colors.fg3, py: 1.5, px: 2, borderBottom: `1px solid ${colors.border2}`, whiteSpace: 'nowrap' }, '& th:first-of-type': { textAlign: 'left' } }}>
                  <Box component="th">Campaign</Box><Box component="th" sx={{ textAlign: 'left !important' }}>Agent</Box><Box component="th" sx={{ textAlign: 'left !important' }}>Status</Box>
                  <Box component="th">Dialed</Box><Box component="th">Conn</Box><Box component="th">Qual</Box><Box component="th">CPL</Box><Box component="th">Spent ↓</Box>
                </Box>
              </Box>
              <Box component="tbody">
                {tableRows.map(r => {
                  const camp = campaigns.find(c => c.id === r.campaign_id)
                  const agent = r.campaign?.agent ?? camp?.agent ?? 'seeker'
                  const status = camp?.status ?? r.status ?? 'completed'
                  return (
                    <Box component="tr" key={r.campaign_id} onClick={() => setDrillId(r.campaign_id)}
                      sx={{ cursor: 'pointer', '& td': { py: 1.4, px: 2, borderBottom: `1px solid ${colors.border1}`, textAlign: 'right', whiteSpace: 'nowrap' }, '&:hover td': { bgcolor: colors.bg1 } }}>
                      <Box component="td" sx={{ textAlign: 'left !important', fontWeight: 600, fontSize: '0.86rem' }}>{r.campaign?.name ?? camp?.name ?? `Campaign ${r.campaign_id}`}</Box>
                      <Box component="td" sx={{ textAlign: 'left !important' }}><AgentChip agent={agent} /></Box>
                      <Box component="td" sx={{ textAlign: 'left !important' }}><StatusChip status={status} autoPaused={camp?.auto_paused} /></Box>
                      <Box component="td"><Num sx={{ fontSize: '0.84rem' }}>{fmtN(r.dialed)}</Num></Box>
                      <Box component="td"><Num sx={{ fontSize: '0.84rem' }}>{fmtN(r.connected)}</Num></Box>
                      <Box component="td"><Num sx={{ fontSize: '0.84rem' }}>{fmtN(r.qualified)}</Num></Box>
                      <Box component="td"><Num sx={{ fontSize: '0.84rem', color: colors.fg2 }}>{fmtR(r.cpl)}</Num></Box>
                      <Box component="td"><Num sx={{ fontSize: '0.84rem', fontWeight: 700, color: colors.glow }}>{fmtR(r.total_spent)}</Num></Box>
                    </Box>
                  )
                })}
                {!tableRows.length && <Box component="tr"><Box component="td" colSpan={8} sx={{ textAlign: 'center', py: 4, color: colors.fg4 }}>No campaign data</Box></Box>}
              </Box>
            </Box>
        </Box>
      </SectionCard>

      {drillId !== null && (() => {
        const report = reportByCamp.get(drillId)
        const camp = campaigns.find(c => c.id === drillId)
          ?? (report?.campaign
            ? { id: drillId, name: report.campaign.name, status: report.status ?? 'completed', agent: report.campaign.agent } as Campaign
            : null)
        if (!camp) return null
        return <CampaignDrill camp={camp} report={report} ls={liveStatus[drillId]} onClose={() => setDrillId(null)} />
      })()}
    </Stack>
  )
}
