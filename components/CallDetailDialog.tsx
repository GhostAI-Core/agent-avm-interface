'use client'
import { useEffect, useState } from 'react'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Stack from '@mui/material/Stack'
import CircularProgress from '@mui/material/CircularProgress'
import type { CallRecord } from '@/types'
import { maskPhone } from '@/lib/security'

// Renders callops' split per-call detail:
//   GET /api/calls/{id}/call-report -> { call_id, call_report: { amd_category, amd_duration_ms,
//        dtmf_digits, matched_key, disconnect_reason, sip_attributes, transfer_target, talk_seconds, ... } }
//   GET /api/calls/{id}/telemetry   -> { call_id, sdk_report, metrics: [...] }
// (This is the group-6 wiring: the data lives in call_session_reports / call_model_usage, NOT the
// legacy call_sessions columns.)

const cleanAmd = (c: unknown) => (typeof c === 'string' ? c.replace(/^AMDCategory\./, '') : (c as string))

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === null || value === undefined || value === ''
  return (
    <Box sx={{ minWidth: 130 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: 0.4 }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>{empty ? <Box component="span" sx={{ color: 'text.disabled' }}>—</Box> : value}</Typography>
    </Box>
  )
}

export default function CallDetailDialog({ call, onClose }: { call: CallRecord | null; onClose: () => void }) {
  const [report, setReport] = useState<Record<string, unknown> | null>(null)
  const [metrics, setMetrics] = useState<unknown[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!call) return
    let cancelled = false
    setLoading(true); setReport(null); setMetrics([])
    Promise.all([
      fetch(`/api/calls/${call.id}/call-report`).then(r => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/calls/${call.id}/telemetry`).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([cr, tel]) => {
      if (cancelled) return
      setReport((cr?.call_report ?? cr) || null)
      setMetrics(tel?.metrics ?? tel?.telemetry ?? [])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [call])

  const r = (report ?? {}) as Record<string, any>
  const sip = (r.sip_attributes ?? r.sip ?? {}) as Record<string, any>
  const hasReport = report && Object.keys(r).length > 0

  return (
    <Dialog open={!!call} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Call detail{call ? ` — ${maskPhone(call.phone)}` : ''}</DialogTitle>
      <DialogContent dividers>
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>}
        {!loading && !hasReport && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No call report available for this call yet.</Typography>
        )}
        {!loading && hasReport && (
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Telephony</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5 }}>
                <Field label="AMD" value={cleanAmd(r.amd_category)} />
                <Field label="AMD time" value={r.amd_duration_ms != null ? `${(Number(r.amd_duration_ms) / 1000).toFixed(1)}s` : null} />
                <Field label="Talk" value={r.talk_seconds != null ? `${r.talk_seconds}s` : null} />
                <Field label="DTMF" value={r.dtmf_digits || null} />
                <Field label="Matched key" value={r.matched_key || null} />
                <Field label="Disconnect" value={r.disconnect_reason} />
                <Field label="Transfer" value={r.transfer_target} />
                <Field label="SIP status" value={sip['sip.callStatus']} />
                <Field label="Trunk #" value={sip['sip.trunkPhoneNumber']} />
                <Field label="Attempt" value={r.attempt} />
              </Box>
            </Box>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Model usage</Typography>
              {metrics.length ? (
                <Box component="pre" sx={{ fontSize: '0.68rem', bgcolor: 'rgba(0,0,0,0.25)', p: 1.5, borderRadius: 1, overflow: 'auto', maxHeight: 240, m: 0 }}>
                  {JSON.stringify(metrics, null, 2)}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">No model usage recorded (script-only call).</Typography>
              )}
            </Box>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  )
}
