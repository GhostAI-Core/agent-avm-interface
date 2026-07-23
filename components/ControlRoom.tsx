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
const FUNNEL_FILL = ['#1F6F35', '#2E8B4E', '#3FA968', '#5BE8BE', '#8CF3D6']
function Funnel({ stages, hover, onHover }: {
  stages: { label: string; count: number }[]
  hover: number | null
  onHover: (i: number | null) => void
}) {
  const W = 280, segH = 52, H = stages.length * segH
  const max = stages[0]?.count || 1
  // sqrt scale: a linear width floors every small stage to the same sliver when the top
  // stage dwarfs the rest (e.g. 214k dialed vs 11 leads). sqrt keeps each stage visibly
  // distinct while still narrowing the funnel to a thin neck.
  const wAt = (v: number) => Math.max(0.12, Math.sqrt(v / max)) * W
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 320, display: 'block' }}>
      {stages.map((s, i) => {
        const topW = wAt(s.count)
        const botW = wAt(stages[i + 1]?.count ?? s.count * 0.55)
        const y = i * segH
        const x1 = (W - topW) / 2, x2 = (W + topW) / 2, x3 = (W + botW) / 2, x4 = (W - botW) / 2
        const dim = hover !== null && hover !== i
        // Segments are flush (no gap) so the outline reads as one continuous, tapering funnel.
        return (
          <g key={s.label} onMouseEnter={() => onHover(i)} onMouseLeave={() => onHover(null)}
            style={{ cursor: 'pointer', opacity: dim ? 0.32 : 1, transition: 'opacity 120ms ease' }}>
            <polygon points={`${x1},${y} ${x2},${y} ${x3},${y + segH} ${x4},${y + segH}`} fill={FUNNEL_FILL[i] || FUNNEL_FILL[FUNNEL_FILL.length - 1]} />
            <text x={W / 2} y={y + segH / 2 + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={i >= 3 ? '#0E2014' : '#EAFBF3'} style={{ fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}>{fmtN(s.count)}</text>
          </g>
        )
      })}
    </svg>
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
        <Stack direction="row" sx={{ gap: 3, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <Box sx={{ flex: '1 1 260px', minWidth: 220, display: 'flex', justifyContent: 'center' }}><Funnel stages={stages} hover={null} onHover={() => {}} /></Box>
          <Stack sx={{ gap: 1.25, flex: '1 1 240px', minWidth: 200 }}>
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
  const funnelLegend = [
    { label: 'Dialed', count: m.dialed, of: m.dialed }, { label: 'Connected', count: m.connected, of: m.dialed },
    { label: 'Engaged', count: m.engaged, of: m.connected }, { label: 'Qualified', count: m.qualified, of: m.connected },
    { label: 'Opt-in / Lead', count: m.lead, of: m.qualified },
  ]

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
            <SectionLabel text="Dialling Funnel" note="hover a stage" />
            <Stack direction="row" sx={{ gap: 3, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
              <Box sx={{ flex: '1 1 300px', minWidth: 240, display: 'flex', justifyContent: 'center' }}><Funnel stages={funnelStages} hover={hoverStage} onHover={setHoverStage} /></Box>
              <Stack sx={{ gap: 1.25, flex: '1 1 260px', minWidth: 220 }}>
                {funnelLegend.map((f, i) => {
                  const on = hoverStage === i
                  const dim = hoverStage !== null && !on
                  return (
                    <Stack key={f.label} direction="row" onMouseEnter={() => setHoverStage(i)} onMouseLeave={() => setHoverStage(null)}
                      sx={{ alignItems: 'center', gap: 1, cursor: 'pointer', borderRadius: 1, px: 0.5, mx: -0.5, py: 0.25, bgcolor: on ? colors.bg1 : 'transparent', opacity: dim ? 0.4 : 1, transition: 'opacity 120ms ease, background-color 120ms ease' }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: FUNNEL_FILL[i] }} />
                      <Typography sx={{ fontSize: '0.82rem', flex: 1, fontWeight: on ? 700 : 400 }}>{f.label}</Typography>
                      <Num sx={{ fontSize: '0.85rem', fontWeight: 700 }}>{fmtN(f.count)}</Num>
                      <Typography sx={{ fontSize: '0.72rem', color: colors.fg4, width: 46, textAlign: 'right' }}>{pct(f.count, f.of)}</Typography>
                    </Stack>
                  )
                })}
              </Stack>
            </Stack>
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
