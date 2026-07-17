'use client'
/**
 * Smart-TV display route (`/tv`) — a read-only "10-foot" wall board for AVM.
 *
 * Reuses the exact same auth-gated endpoint the dashboard already uses
 * (`GET /api/reports` → CampaignReport[]) — no new data path, no change to any
 * existing workings. This is purely a display layer:
 *   - KPI tiles (dialed / connected / leads / spend)
 *   - a remote-navigable campaign grid
 *   - a full-screen per-campaign detail view
 *   - hands-free auto-cycle for an unattended display
 *
 * Remote control: TV D-pads emit ArrowUp/Down/Left/Right + Enter; Back maps to
 * Escape/Backspace on most, and to platform keycodes on Tizen (10009) / webOS (461).
 * We handle all of them. Focus is a highlighted card; OK opens detail; Back returns.
 */
import { useState, useEffect, useCallback, useMemo, useRef, forwardRef } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { semantic, radius, statusChipTone, agentChipTone } from '@/lib/tokens'
import type { CampaignReport } from '@/types'

const REFRESH_MS = 30_000       // re-poll cadence for a live wall display
const CYCLE_MS = 12_000         // auto-cycle dwell per campaign
const IDLE_TO_CYCLE_MS = 90_000 // idle time on overview before auto-cycle kicks in
const MIN_CARD_PX = 440         // min campaign-card width → drives grid column count

const money = (n: number) =>
  'R ' + (n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const int = (n: number) => (n || 0).toLocaleString('en-ZA')
const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0)

// leads bucket = subscribed(qualified) + explicit lead outcome
const leadsOf = (r: CampaignReport) => (r.qualified || 0) + (r.lead || 0)

type Screen = 'overview' | 'detail'

export default function TvPage() {
  const [reports, setReports] = useState<CampaignReport[]>([])
  const [loading, setLoading] = useState(true)
  const [needsAuth, setNeedsAuth] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [clock, setClock] = useState('')

  const [screen, setScreen] = useState<Screen>('overview')
  const [focus, setFocus] = useState(0)     // index into reports for overview grid
  const [detailIdx, setDetailIdx] = useState(0)
  const [cycling, setCycling] = useState(false)
  const [cols, setCols] = useState(3)

  const gridRef = useRef<HTMLDivElement | null>(null)
  const lastKeyRef = useRef<number>(0)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  // ---- data ---------------------------------------------------------------
  // Same auth-gated endpoint the dashboard uses; poll for a live wall display.
  // Inline async IIFE + `active` guard mirrors the app's existing load pattern
  // (keeps setState off the effect's synchronous path).
  useEffect(() => {
    let active = true
    const run = async () => {
      try {
        const res = await fetch('/api/reports', { cache: 'no-store' })
        if (!active) return
        if (res.status === 401) { setNeedsAuth(true); setLoading(false); return }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!active) return
        const list: CampaignReport[] = Array.isArray(data) ? data : (data.reports ?? [])
        // Busiest first so the most active campaigns lead the board.
        list.sort((a, b) => (b.dialed || 0) - (a.dialed || 0))
        setReports(list)
        setNeedsAuth(false)
        setError(null)
        setUpdatedAt(new Date())
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'load failed')
      } finally {
        if (active) setLoading(false)
      }
    }
    run()
    const t = setInterval(run, REFRESH_MS)
    return () => { active = false; clearInterval(t) }
  }, [])

  // wall clock
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }))
    tick()
    const t = setInterval(tick, 15_000)
    return () => clearInterval(t)
  }, [])

  // Clamp at point-of-use so a shrinking dataset never dangles the focus index
  // (avoids a setState-in-effect just to keep it valid).
  const safeFocus = reports.length ? Math.min(focus, reports.length - 1) : 0

  // ---- responsive column count for D-pad grid math ------------------------
  useEffect(() => {
    const el = gridRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      setCols(Math.max(1, Math.min(reports.length || 1, Math.floor(w / MIN_CARD_PX) || 1)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [reports.length])

  // keep the focused card in view
  useEffect(() => {
    if (screen !== 'overview') return
    cardRefs.current[safeFocus]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [safeFocus, screen])

  // ---- auto-cycle ---------------------------------------------------------
  // Idle on overview → start cycling. Any key press stops it (see key handler).
  useEffect(() => {
    if (cycling || screen !== 'overview' || reports.length === 0) return
    const t = setInterval(() => {
      if (Date.now() - lastKeyRef.current >= IDLE_TO_CYCLE_MS) {
        setDetailIdx(0)
        setCycling(true)
        setScreen('detail')
      }
    }, 5_000)
    return () => clearInterval(t)
  }, [cycling, screen, reports.length])

  // while cycling, advance through campaigns
  useEffect(() => {
    if (!cycling) return
    const t = setInterval(() => {
      setDetailIdx((i) => (reports.length ? (i + 1) % reports.length : 0))
    }, CYCLE_MS)
    return () => clearInterval(t)
  }, [cycling, reports.length])

  // ---- remote / keyboard --------------------------------------------------
  const goOverview = useCallback(() => { setCycling(false); setScreen('overview') }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const code = e.keyCode || 0
      const isBack = e.key === 'Escape' || e.key === 'Backspace' || code === 10009 || code === 461
      const isOk = e.key === 'Enter' || e.key === ' ' || code === 13
      const isCycleToggle = e.key === 'p' || e.key === 'c' || code === 415 /* MediaPlay */ || code === 19 /* Pause */

      // Any interaction cancels an active auto-cycle first.
      lastKeyRef.current = Date.now()
      if (cycling && !isCycleToggle) { e.preventDefault(); goOverview(); return }

      if (isCycleToggle) {
        e.preventDefault()
        if (reports.length === 0) return
        if (cycling) { goOverview() }
        else { setDetailIdx(screen === 'detail' ? detailIdx : safeFocus); setCycling(true); setScreen('detail') }
        return
      }

      if (isBack) {
        e.preventDefault()
        if (screen === 'detail') goOverview()
        return
      }

      if (screen === 'detail') {
        if (e.key === 'ArrowRight') { e.preventDefault(); setDetailIdx((i) => (i + 1) % Math.max(1, reports.length)) }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); setDetailIdx((i) => (i - 1 + reports.length) % Math.max(1, reports.length)) }
        else if (isBack) { e.preventDefault(); goOverview() }
        return
      }

      // overview grid navigation
      if (reports.length === 0) return
      if (e.key === 'ArrowRight') { e.preventDefault(); setFocus((i) => Math.min(reports.length - 1, i + 1)) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setFocus((i) => Math.max(0, i - 1)) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setFocus((i) => Math.min(reports.length - 1, i + cols)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setFocus((i) => Math.max(0, i - cols)) }
      else if (isOk) { e.preventDefault(); setDetailIdx(safeFocus); setScreen('detail') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, safeFocus, cols, cycling, detailIdx, reports.length, goOverview])

  // ---- KPIs ---------------------------------------------------------------
  const kpis = useMemo(() => {
    const dialed = reports.reduce((s, r) => s + (r.dialed || 0), 0)
    const connected = reports.reduce((s, r) => s + (r.connected || 0), 0)
    const leads = reports.reduce((s, r) => s + leadsOf(r), 0)
    const spend = reports.reduce((s, r) => s + (r.total_spent || 0), 0)
    const running = reports.filter((r) => (r.status || '').toLowerCase() === 'running').length
    return { dialed, connected, leads, spend, running }
  }, [reports])

  // ---- states -------------------------------------------------------------
  if (needsAuth) return <FullMessage title="Sign in required" body="Open avm.evra-ai.com on this TV and sign in, then return to /tv." />
  if (loading && reports.length === 0) return <FullMessage title="Loading AVM board…" body="" />
  if (error && reports.length === 0) return <FullMessage title="Can’t reach the dashboard" body={error} />

  const detail = reports[detailIdx]

  return (
    <Stack sx={{ height: '100%', color: semantic.text }}>
      {/* header */}
      <Stack direction="row" sx={{ mb: 3, alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Typography sx={{ fontFamily: "'Michroma', system-ui, sans-serif", fontSize: 'clamp(1.4rem,2.2vw,2.4rem)', letterSpacing: '0.12em', color: semantic.accentBright }}>
            AVM CONTROL ROOM
          </Typography>
          <Dot ok={!error} />
          <Typography sx={{ fontSize: 'clamp(0.8rem,1vw,1.1rem)', color: semantic.textSoft }}>
            {kpis.running} running · {reports.length} campaigns
          </Typography>
        </Stack>
        <Typography sx={{ fontFamily: 'ui-monospace, monospace', fontSize: 'clamp(1.4rem,2.4vw,2.6rem)', color: semantic.textMuted }}>
          {clock}
        </Typography>
      </Stack>

      {/* KPI row */}
      <Stack direction="row" spacing={2.5} sx={{ mb: 3 }}>
        <Kpi label="Dialed" value={int(kpis.dialed)} />
        <Kpi label="Connected" value={int(kpis.connected)} sub={`${pct(kpis.connected, kpis.dialed)}% of dialed`} tone={semantic.info} />
        <Kpi label="Leads" value={int(kpis.leads)} sub={`${pct(kpis.leads, kpis.connected)}% of connected`} tone={semantic.accentBright} />
        <Kpi label="Spend" value={money(kpis.spend)} tone={semantic.warning} />
      </Stack>

      {/* body: grid or detail */}
      {screen === 'overview' ? (
        <Box
          ref={gridRef}
          sx={{
            flex: 1, minHeight: 0, overflowY: 'auto', pr: 1,
            display: 'grid', gap: 2.5, alignContent: 'start',
            gridTemplateColumns: `repeat(auto-fill, minmax(${MIN_CARD_PX}px, 1fr))`,
          }}
        >
          {reports.length === 0 && <FullMessage title="No campaigns yet" body="" inline />}
          {reports.map((r, i) => (
            <CampaignCard
              key={r.campaign_id ?? r.id ?? i}
              r={r}
              focused={i === safeFocus}
              ref={(el: HTMLDivElement | null) => { cardRefs.current[i] = el }}
            />
          ))}
        </Box>
      ) : (
        detail && <CampaignDetail r={detail} cycling={cycling} index={detailIdx} total={reports.length} />
      )}

      {/* footer hint */}
      <Stack direction="row" spacing={3} sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${semantic.border}`, color: semantic.textSoft, fontSize: 'clamp(0.75rem,0.95vw,1rem)' }}>
        {cycling
          ? <Hint><b>Auto-cycling</b> · press any key to stop</Hint>
          : screen === 'detail'
            ? <><Hint>{'◀ ▶'} switch campaign</Hint><Hint>Back: grid</Hint><Hint>Play/C: auto-cycle</Hint></>
            : <><Hint>{'◀ ▶ ▲ ▼'} move</Hint><Hint>OK: open</Hint><Hint>Play/C: auto-cycle</Hint></>}
        <Box sx={{ flex: 1 }} />
        {updatedAt && <Hint>updated {updatedAt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</Hint>}
      </Stack>
    </Stack>
  )
}

/* ---------- presentational pieces ---------- */

function Hint({ children }: { children: React.ReactNode }) {
  return <Typography component="span" sx={{ fontSize: 'inherit', color: 'inherit' }}>{children}</Typography>
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <Box sx={{
      width: 12, height: 12, borderRadius: '50%',
      bgcolor: ok ? semantic.positive : semantic.danger,
      boxShadow: ok ? `0 0 10px ${semantic.positive}` : 'none',
      animation: ok ? 'tvpulse 2s ease-in-out infinite' : 'none',
      '@keyframes tvpulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } },
    }} />
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <Box sx={{
      flex: 1, bgcolor: semantic.surface, border: `1px solid ${semantic.border}`,
      borderRadius: `${radius.lg}px`, px: 3, py: 2.5,
    }}>
      <Typography sx={{ fontSize: 'clamp(0.8rem,1vw,1.1rem)', letterSpacing: '0.08em', textTransform: 'uppercase', color: semantic.textSoft }}>
        {label}
      </Typography>
      <Typography sx={{ fontFamily: "'Michroma', system-ui, sans-serif", fontSize: 'clamp(2.2rem,4.5vw,4.5rem)', lineHeight: 1.05, color: tone ?? semantic.text }}>
        {value}
      </Typography>
      {sub && <Typography sx={{ fontSize: 'clamp(0.75rem,0.95vw,1rem)', color: semantic.textSoft }}>{sub}</Typography>}
    </Box>
  )
}

const CampaignCard = forwardRef<HTMLDivElement, { r: CampaignReport; focused: boolean }>(
  function CampaignCard({ r, focused }, ref) {
    const name = r.campaign?.name ?? '—'
    const agent = r.campaign?.agent ?? ''
    const st = statusChipTone(r.status || '')
    const ag = agentChipTone(String(agent))
    return (
      <Box
        ref={ref}
        sx={{
          bgcolor: semantic.surface,
          border: `2px solid ${focused ? semantic.accentBright : semantic.border}`,
          borderRadius: `${radius.lg}px`, p: 2.5,
          transition: 'transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease',
          transform: focused ? 'scale(1.015)' : 'none',
          boxShadow: focused ? `0 0 0 4px rgba(96,188,132,0.25), 0 0 34px rgba(91,232,190,0.35)` : 'none',
        }}
      >
        <Stack direction="row" sx={{ mb: 1.5, alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography noWrap sx={{ fontSize: 'clamp(1.3rem,1.8vw,2rem)', fontWeight: 600, maxWidth: '70%' }}>
            {name}
          </Typography>
          <Chip bg={st.bg} text={st.text} border={st.border}>{r.status || '—'}</Chip>
        </Stack>
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          {agent && <Chip bg={ag.bg} text={ag.text} border={ag.border}>{String(agent)}</Chip>}
        </Stack>
        <Stack direction="row" spacing={3}>
          <Stat label="Dialed" value={int(r.dialed)} />
          <Stat label="Conn" value={int(r.connected)} tone={semantic.info} />
          <Stat label="Leads" value={int(leadsOf(r))} tone={semantic.accentBright} />
          <Stat label="Spend" value={money(r.total_spent)} tone={semantic.warning} small />
        </Stack>
      </Box>
    )
  },
)

function CampaignDetail({ r, cycling, index, total }: { r: CampaignReport; cycling: boolean; index: number; total: number }) {
  const st = statusChipTone(r.status || '')
  const rows: [string, string, string?][] = [
    ['Dialed', int(r.dialed)],
    ['Connected', `${int(r.connected)}  (${pct(r.connected, r.dialed)}%)`, semantic.info],
    ['Leads', `${int(leadsOf(r))}  (${pct(leadsOf(r), r.connected)}%)`, semantic.accentBright],
    ['Voicemail', int(r.voicemail)],
    ['No answer', int(r.no_answer)],
    ['Opt-out', int(r.opt_out), semantic.danger],
    ['Failed', int(r.failed), semantic.danger],
    ['Cost / lead', money(r.cpl), semantic.warning],
    ['Total spend', money(r.total_spent), semantic.warning],
  ]
  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Stack direction="row" sx={{ mb: 3, alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Typography sx={{ fontFamily: "'Michroma', system-ui, sans-serif", fontSize: 'clamp(2rem,3.6vw,4rem)', color: semantic.accentBright }}>
            {r.campaign?.name ?? '—'}
          </Typography>
          <Chip bg={st.bg} text={st.text} border={st.border}>{r.status || '—'}</Chip>
        </Stack>
        <Typography sx={{ fontSize: 'clamp(0.9rem,1.2vw,1.3rem)', color: semantic.textSoft }}>
          {cycling ? `auto-cycle · ` : ''}{index + 1} / {total}
        </Typography>
      </Stack>
      <Box sx={{
        flex: 1, minHeight: 0, display: 'grid', gap: 2.5, alignContent: 'start',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      }}>
        {rows.map(([label, value, tone]) => (
          <Box key={label} sx={{ bgcolor: semantic.surface, border: `1px solid ${semantic.border}`, borderRadius: `${radius.lg}px`, px: 3, py: 2.5 }}>
            <Typography sx={{ fontSize: 'clamp(0.85rem,1.1vw,1.2rem)', letterSpacing: '0.06em', textTransform: 'uppercase', color: semantic.textSoft }}>
              {label}
            </Typography>
            <Typography sx={{ fontFamily: "'Michroma', system-ui, sans-serif", fontSize: 'clamp(2rem,3.8vw,3.6rem)', lineHeight: 1.1, color: tone ?? semantic.text }}>
              {value}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function Stat({ label, value, tone, small }: { label: string; value: string; tone?: string; small?: boolean }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 'clamp(0.7rem,0.85vw,0.95rem)', letterSpacing: '0.05em', textTransform: 'uppercase', color: semantic.textSoft }}>
        {label}
      </Typography>
      <Typography sx={{
        fontFamily: "'Michroma', system-ui, sans-serif",
        fontSize: small ? 'clamp(1.1rem,1.5vw,1.7rem)' : 'clamp(1.5rem,2.2vw,2.6rem)',
        lineHeight: 1.1, color: tone ?? semantic.text,
      }}>
        {value}
      </Typography>
    </Box>
  )
}

function Chip({ children, bg, text, border }: { children: React.ReactNode; bg: string; text: string; border: string }) {
  return (
    <Box component="span" sx={{
      display: 'inline-flex', alignItems: 'center', px: 1.5, py: 0.4,
      borderRadius: `${radius.pill}px`, bgcolor: bg, color: text, border: `1px solid ${border}`,
      fontSize: 'clamp(0.7rem,0.9vw,1rem)', fontWeight: 600, letterSpacing: '0.04em',
      textTransform: 'capitalize', whiteSpace: 'nowrap',
    }}>
      {children}
    </Box>
  )
}

function FullMessage({ title, body, inline }: { title: string; body: string; inline?: boolean }) {
  return (
    <Box sx={{
      ...(inline ? { gridColumn: '1 / -1' } : { position: 'absolute', inset: 0 }),
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', color: semantic.text, gap: 2,
    }}>
      <Typography sx={{ fontFamily: "'Michroma', system-ui, sans-serif", fontSize: 'clamp(1.8rem,3vw,3rem)', color: semantic.accentBright }}>
        {title}
      </Typography>
      {body && <Typography sx={{ fontSize: 'clamp(1rem,1.4vw,1.5rem)', color: semantic.textSoft, maxWidth: '60ch' }}>{body}</Typography>}
    </Box>
  )
}
