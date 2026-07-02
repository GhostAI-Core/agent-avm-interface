'use client'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { COST_MODEL, billedMinutes, estimateCallCost } from '@/lib/callCost'
import { toneColors } from '@/lib/tokens'
import type { CallRecord } from '@/types'

// Detailed CPL / cost breakdown. The FORMULA + rates are static (lib/callCost COST_MODEL);
// the numbers recompute live from per-call telemetry (talk_seconds). Labelled an ESTIMATE
// because call_records.cost is always 0 (CallOps writes no real cost yet — Issue #11).

const R = (n: number) => `R${n.toFixed(2)}`
const cents = (n: number) => `${Math.round(n * 100)}c`

function Row({ label, value, sub, strong, tone }: { label: string; value: string; sub?: string; strong?: boolean; tone?: keyof typeof toneColors }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', py: 0.4 }}>
      <Typography sx={{ fontSize: '0.8rem', color: tone ? toneColors[tone] : 'text.secondary', fontWeight: strong ? 700 : 400 }}>{label}</Typography>
      <Box sx={{ textAlign: 'right' }}>
        <Typography className="mono" sx={{ fontSize: strong ? '0.95rem' : '0.85rem', fontWeight: strong ? 700 : 500 }}>{value}</Typography>
        {sub && <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>{sub}</Typography>}
      </Box>
    </Box>
  )
}

export default function CostBreakdown({ calls }: { calls: (CallRecord & { campaign_id: number })[] }) {
  const m = COST_MODEL
  const talking = calls.filter(c => Number(c.talk_seconds) > 0)
  const onAirOf = (c: CallRecord) => Math.max(Number(c.talk_seconds) || 0, Number(c.on_air_seconds) || 0)
  // Carrier bills the answered leg (talk); LiveKit bills the whole session (on-air, all calls).
  const talkMin = calls.reduce((s, c) => s + billedMinutes(Number(c.talk_seconds) || 0), 0)
  const airMin = calls.reduce((s, c) => s + billedMinutes(onAirOf(c)), 0)
  const carrier = talkMin * m.carrierPerMin
  const livekit = airMin * m.livekitPerMin
  const ai = talking.length * m.aiPerAnsweredCall
  const allIn = calls.reduce((s, c) => s + estimateCallCost(Number(c.talk_seconds) || 0, onAirOf(c)), 0)
  const subs = calls.filter(c => c.outcome === 'subscribed').length
  const n = talking.length || 1
  const pctOf = (x: number) => allIn ? `${Math.round((x / allIn) * 100)}%` : '—'
  const incLabel = m.billingIncrementSec === 1 ? 'per-second' : `${m.billingIncrementSec}s`

  return (
    <Stack spacing={1.2} sx={{ fontSize: '0.8rem' }}>
      <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1 }}>
        <Typography className="mono" sx={{ fontSize: '0.72rem', color: 'text.secondary', lineHeight: 1.5 }}>
          cost = talk×carrier + on-air×LiveKit + AI/answered
        </Typography>
        <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', mt: 0.3 }}>
          Carrier bills the answered leg (talk); LiveKit bills the full session (on-air ≈ 5.5× talk).
          Recomputes live from telemetry ({m.currency}, {incLabel}).
        </Typography>
      </Box>

      <Box>
        <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.3 }}>Rates (COST_MODEL)</Typography>
        <Row label="Carrier · utility_connect" value={`${R(m.carrierPerMin)}/min`} />
        <Row label="LiveKit · agent + SIP" value={`${R(m.livekitPerMin)}/min`} />
        <Row label="AMD AI / answered call" value={`${R(m.aiPerAnsweredCall)}`} />
      </Box>

      <Box>
        <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.3 }}>Live inputs (telemetry)</Typography>
        <Row label="Talking / total calls" value={`${talking.length} / ${calls.length}`} />
        <Row label="Talk time" value={`${talkMin.toFixed(1)} min`} />
        <Row label="On-air time (total call time)" value={`${airMin.toFixed(1)} min`} sub={`${(airMin / (talkMin || 1)).toFixed(1)}× talk`} />
        <Row label="Subscribes" value={String(subs)} />
      </Box>

      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 0.5 }}>
        <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.3 }}>Cost breakdown</Typography>
        <Row label="Carrier (talk)" value={R(carrier)} sub={pctOf(carrier)} />
        <Row label="LiveKit (on-air)" value={R(livekit)} sub={pctOf(livekit)} />
        <Row label="AMD AI" value={R(ai)} sub={pctOf(ai)} />
        <Row label="All-in" value={R(allIn)} strong tone="neg" />
        <Row label="Per talking-call" value={`carrier ${cents(carrier / n)} · all-in ${cents(allIn / n)}`} />
      </Box>

      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 0.5 }}>
        <Row label="CPL (cost per subscribe)" value={subs ? R(allIn / subs) : '—'} strong tone={subs ? 'pos' : 'neu'} />
      </Box>

      <Typography sx={{ fontSize: '0.63rem', color: 'text.disabled', lineHeight: 1.4 }}>
        ⚠ Estimate — <code>call_records.cost</code> is 0 (CallOps Issue #11). Carrier rate is a wholesale proxy; if Utility Connect bills 60/60, cost ≈ 3× on these &lt;30s calls.
      </Typography>
    </Stack>
  )
}
