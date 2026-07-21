'use client'
import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { toneColors } from '@/lib/tokens'
import type { CallRecord } from '@/types'

// Detailed CPL / cost breakdown, computed from the REAL per-call `cost` CallOps persists at
// call-outcome time (app/services/cost_estimator.py) -- no more client-side estimation from
// talk_seconds (Issue #11 is fixed: call_records.cost is no longer always 0). The carrier rate
// shown here is read live from /api/settings (admin-editable on the Settings page), so this
// widget always reflects the currently configured price, not a frontend-hardcoded constant.

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
  const [ratePerMin, setRatePerMin] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/settings')
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (active && typeof j?.cost_per_minute_zar === 'number') setRatePerMin(j.cost_per_minute_zar) })
      .catch(() => { /* leave rate display blank */ })
    return () => { active = false }
  }, [])

  const talking = calls.filter(c => Number(c.talk_seconds) > 0)
  const talkMin = calls.reduce((s, c) => s + (Number(c.talk_seconds) || 0), 0) / 60
  const onAirOf = (c: CallRecord) => Math.max(Number(c.talk_seconds) || 0, Number(c.on_air_seconds) || 0)
  const airMin = calls.reduce((s, c) => s + onAirOf(c), 0) / 60
  const allIn = calls.reduce((s, c) => s + (Number(c.cost) || 0), 0)
  // A conversion is a subscribe (consent campaigns) or a lead (lead-gen campaigns).
  const subs = calls.filter(c => c.outcome === 'subscribed' || c.outcome === 'lead').length
  const n = talking.length || 1
  const pctOf = (x: number) => allIn ? `${Math.round((x / allIn) * 100)}%` : '—'
  // Carrier-only attribution estimate (the persisted `allIn` total already includes it plus any
  // per-answered-call AI fee; LiveKit is self-hosted / not metered per-call).
  const carrierEstimate = ratePerMin != null ? talkMin * ratePerMin : null

  return (
    <Stack spacing={1.2} sx={{ fontSize: '0.8rem' }}>
      <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1 }}>
        <Typography className="mono" sx={{ fontSize: '0.72rem', color: 'text.secondary', lineHeight: 1.5 }}>
          Billed cost, persisted per call by CallOps
        </Typography>
        <Typography sx={{ fontSize: '0.65rem', color: 'text.disabled', mt: 0.3 }}>
          Carrier bills the answered leg (talk); LiveKit is self-hosted (not metered per-call).
          {ratePerMin != null && ` Current rate: R${ratePerMin.toFixed(2)}/min.`}
        </Typography>
      </Box>

      <Box>
        <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.3 }}>Live inputs (telemetry)</Typography>
        <Row label="Talking / total calls" value={`${talking.length} / ${calls.length}`} />
        <Row label="Talk time" value={`${talkMin.toFixed(1)} min`} />
        <Row label="On-air time (total call time)" value={`${airMin.toFixed(1)} min`} sub={`${(airMin / (talkMin || 1)).toFixed(1)}× talk`} />
        <Row label="Conversions (subscribe/lead)" value={String(subs)} />
      </Box>

      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 0.5 }}>
        <Typography sx={{ fontSize: '0.68rem', color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.3 }}>Cost</Typography>
        {carrierEstimate != null && <Row label="Carrier (talk × rate)" value={R(carrierEstimate)} sub={pctOf(carrierEstimate)} />}
        <Row label="Total billed" value={R(allIn)} strong tone="neg" />
        <Row label="Per talking-call" value={cents(allIn / n)} />
      </Box>

      <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 0.5 }}>
        <Row label="CPL (cost per conversion)" value={subs ? R(allIn / subs) : '—'} strong tone={subs ? 'pos' : 'neu'} />
      </Box>

      <Typography sx={{ fontSize: '0.63rem', color: 'text.disabled', lineHeight: 1.4 }}>
        Rate is admin-editable on the Settings page — changes apply to calls priced after the change, not retroactively.
      </Typography>
    </Stack>
  )
}
