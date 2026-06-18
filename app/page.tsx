'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { withTimeout } from '@/lib/async'
import { resolveUserRole, userMetaFromSession, type AppRole } from '@/lib/roles'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import FloatingNav from '@/components/FloatingNav'
import InsightDashboard from '@/components/InsightDashboard'
import SaveTemplateDialog from '@/components/SaveTemplateDialog'
import TutorialOverlay, { TOUR_STEPS } from '@/components/TutorialOverlay'
import { useDashboardLayout } from '@/lib/useDashboardLayout'
import CampaignModal from '@/components/CampaignModal'
import AuthView from '@/components/AuthView'
import SecurityView from '@/components/SecurityView'
import SettingsView from '@/components/SettingsView'
import TelephonyView from '@/components/TelephonyView'
import { OutcomeDonut, CampaignBar, SpendChart, FunnelChart } from '@/components/Charts'
import ProfileView from '@/components/ProfileView'
import CampaignDetail from '@/components/CampaignDetail'
import CallQuality from '@/components/CallQuality'
import CampaignActionDialog from '@/components/CampaignActionDialog'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import MuiIconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import PauseIcon from '@mui/icons-material/Pause'
import StopIcon from '@mui/icons-material/Stop'
import EditIcon from '@mui/icons-material/Edit'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import ArchiveIcon from '@mui/icons-material/Archive'
import ViewModuleIcon from '@mui/icons-material/ViewModule'
import ViewListIcon from '@mui/icons-material/ViewList'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import Divider from '@mui/material/Divider'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import TextField from '@mui/material/TextField'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import AgentChip from '@/components/ui/AgentChip'
import StatusChip from '@/components/ui/StatusChip'
import GlassCard from '@/components/ui/GlassCard'
import BusinessIcon from '@mui/icons-material/Business'
import CloseIcon from '@mui/icons-material/Close'
import { colors, semantic, radius } from '@/lib/tokens'
import type { Campaign, CampaignReport, Company } from '@/types'
const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Control Room',
  companies: 'Companies',
  campaigns: 'Campaigns',
  reports:   'Campaign Report',
  quality:   'Call Quality',
  security:  'Security Audit Log',
  settings:  'System Settings',
  profile:   'Profile & Appearance',
}

const REPORT_KEYS: (keyof CampaignReport)[] = ['dialed','connected','qualified','voicemail','no_speech','hangup','ni','dnq','callback','no_answer','busy_line','failed']
const INACTIVITY_LIMIT = 15 * 60 * 1000 // 15 minutes

// Cards|Table switcher shared by the Companies and Campaigns list views.
function ViewToggle({ value, onChange }: { value: 'cards' | 'table'; onChange: (v: 'cards' | 'table') => void }) {
  return (
    <ToggleButtonGroup
      size="small" exclusive value={value}
      onChange={(_e, v) => { if (v) onChange(v) }}
      aria-label="View mode"
    >
      <ToggleButton value="cards" aria-label="Card view"><ViewModuleIcon sx={{ fontSize: 18 }} /></ToggleButton>
      <ToggleButton value="table" aria-label="Table view"><ViewListIcon sx={{ fontSize: 18 }} /></ToggleButton>
    </ToggleButtonGroup>
  )
}

export default function Page() {
  const supabase = useMemo(() => createClient(), [])
  const [mounted,         setMounted]         = useState(false)
  const [authChecked,     setAuthChecked]     = useState(false)
  const [auth,            setAuth]            = useState(false)
  const [role,            setRole]            = useState<AppRole>('engineer')
  const [view,        setView]        = useState('dashboard')
  const [sideOpen,    setSideOpen]    = useState(false)
  const [showModal,   setShowModal]   = useState(false)
  const [campaigns,   setCampaigns]   = useState<Campaign[]>([])
  const [reports,     setReports]     = useState<CampaignReport[]>([])
  const [allCalls,    setAllCalls]    = useState<any[]>([])
  const [allIntents,  setAllIntents]  = useState<any[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignReport | null>(null)
  const [detailedLogs,     setDetailedLogs]     = useState<any[]>([])
  const [activeCalls,      setActiveCalls]      = useState<any[]>([])
  const [securityLogs,    setSecurityLogs]     = useState<any[]>([])
  const [filterAgent,      setFilterAgent]      = useState('')
  const [filterDate,       setFilterDate]       = useState('')
  const [expandedChart,    setExpandedChart]    = useState<string | null>(null)
  const [expandCampaign,   setExpandCampaign]   = useState<string>('')  // '' = collective
  const [companyFilter,    setCompanyFilter]    = useState('')          // '' = all companies
  const [campaignFilter,   setCampaignFilter]   = useState('')          // '' = all campaigns in scope
  const [companiesList,    setCompaniesList]    = useState<Company[]>([])
  const [showCompanyModal, setShowCompanyModal] = useState(false)
  const [newCompanyName,   setNewCompanyName]   = useState('')
  const [newContactName,   setNewContactName]   = useState('')
  const [newContactEmail,  setNewContactEmail]  = useState('')
  const [newContactPhone,  setNewContactPhone]  = useState('')
  const [campaignAction,   setCampaignAction]   = useState<{ mode: 'edit' | 'reuse'; campaign: Campaign } | null>(null)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [tourStep,         setTourStep]         = useState<number | null>(null)
  const [companiesView,    setCompaniesView]    = useState<'cards' | 'table'>('cards')
  const [campaignsView,    setCampaignsView]    = useState<'cards' | 'table'>('cards')
  const dash = useDashboardLayout()

  useEffect(() => { setMounted(true) }, [])

  // List-view (cards|table) preferences — hydrate after mount to avoid SSR mismatch, then persist.
  useEffect(() => {
    try {
      const co = window.localStorage.getItem('avm.view.companies'); if (co === 'cards' || co === 'table') setCompaniesView(co)
      const ca = window.localStorage.getItem('avm.view.campaigns'); if (ca === 'cards' || ca === 'table') setCampaignsView(ca)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => { try { window.localStorage.setItem('avm.view.companies', companiesView) } catch { /* ignore */ } }, [companiesView])
  useEffect(() => { try { window.localStorage.setItem('avm.view.campaigns', campaignsView) } catch { /* ignore */ } }, [campaignsView])

  // The tour owns which view is shown; switch to a step's view as it advances.
  useEffect(() => {
    if (tourStep === null) return
    const v = TOUR_STEPS[tourStep]?.view
    if (v) setView(v)
  }, [tourStep])

  // First-run: auto-open the guided tour once per browser. The ? button replays it anytime.
  useEffect(() => {
    if (!auth || !mounted) return
    try {
      if (!window.localStorage.getItem('avm.tour.seen')) setTourStep(0)
    } catch { /* ignore */ }
  }, [auth, mounted])

  // Ending the tour (Skip or finishing the last step) marks it seen so it won't auto-open again.
  const endTour = () => {
    setTourStep(null)
    try { window.localStorage.setItem('avm.tour.seen', '1') } catch { /* ignore */ }
  }
  // Left-click advances; past the last step it ends the tour.
  const tourNext = () => {
    if (tourStep === null) return
    if (tourStep >= TOUR_STEPS.length - 1) { endTour(); return }
    setTourStep(tourStep + 1)
  }

  useEffect(() => {
    let active = true

    // Safety net: never leave the loading screen if auth init stalls (e.g. extension blocking storage)
    const fallback = setTimeout(() => {
      if (active) setAuthChecked(true)
    }, 4000)

    const finishAuthCheck = () => {
      clearTimeout(fallback)
      if (active) setAuthChecked(true)
    }

    const applySession = async (session: { user: { id: string; email?: string; user_metadata?: Record<string, unknown> } } | null) => {
      if (!session?.user) {
        setAuth(false)
        return
      }
      const meta = userMetaFromSession(session.user)
      const fallback: AppRole = meta.role === 'admin' ? 'admin' : 'engineer'
      let r = fallback
      try {
        r = await withTimeout(
          resolveUserRole(supabase, session.user.id, meta),
          8000,
          'Profile sync timed out',
        )
      } catch {
        // Keep fallback role so login is not blocked by profiles query
      }
      setAuth(true)
      setRole(r)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return
      try {
        await applySession(session)
      } catch (err) {
        console.error('Session init failed:', err)
        setAuth(false)
      } finally {
        finishAuthCheck()
      }
    })

    return () => {
      active = false
      clearTimeout(fallback)
      subscription.unsubscribe()
    }
  }, [supabase])

  // Sign out cleanly when the session has expired (server returns 401).
  const handleAuthFailure = useCallback(async () => {
    try { await supabase.auth.signOut() } catch { /* already gone */ }
    setAuth(false)
  }, [supabase])

  // Fetch + parse JSON with consistent error/401 handling.
  // Returns null on an expired session (and logs the user out); throws on other errors.
  const getJson = useCallback(async (url: string) => {
    const res = await fetch(url)
    if (res.status === 401) { await handleAuthFailure(); return null }
    if (!res.ok) throw new Error(`${url} → ${res.status}`)
    return res.json()
  }, [handleAuthFailure])

  const fetchData = useCallback(async () => {
    try {
      const p = new URLSearchParams()
      if (filterAgent) p.set('agent', filterAgent)
      if (filterDate) p.set('date', filterDate)
      const [jC, jR] = await Promise.all([getJson('/api/campaigns'), getJson(`/api/reports?${p}`)])
      if (jC) setCampaigns(jC.campaigns ?? [])
      if (jR) setReports(jR.reports ?? [])
    } catch (err) {
      console.error('Refresh failed:', err)
    }
  }, [filterAgent, filterDate, getJson])

  useEffect(() => {
    if (!auth) return
    let timeout: NodeJS.Timeout
    const resetTimer = () => {
      clearTimeout(timeout)
      timeout = setTimeout(async () => {
        await supabase.auth.signOut()
        setAuth(false)
      }, INACTIVITY_LIMIT)
    }
    window.addEventListener('mousemove', resetTimer); window.addEventListener('keydown', resetTimer)
    resetTimer()
    return () => { clearTimeout(timeout); window.removeEventListener('mousemove', resetTimer); window.removeEventListener('keydown', resetTimer) }
  }, [auth, supabase])

  // Filter-independent data — loaded in parallel (no waterfall), only on login.
  useEffect(() => {
    if (!auth) return
    let active = true
    ;(async () => {
      try {
        const today = new Date().toISOString().slice(0, 10)
        const results = await Promise.allSettled([
          getJson('/api/campaigns'),
          getJson('/api/security'),
          getJson('/api/companies'),
          getJson('/api/logs'),
          getJson(`/api/intents?date=${today}`),
        ])
        if (!active) return
        const [jC, jS, jCo, jL, jI] = results.map((r) => (r.status === 'fulfilled' ? r.value : null))
        if (jC) setCampaigns(jC.campaigns ?? [])
        if (jS) setSecurityLogs(jS.logs ?? [])
        if (jCo) setCompaniesList(jCo.companies ?? [])
        if (jL) setAllCalls(jL.logs ?? [])
        if (jI) setAllIntents(jI.intents ?? [])
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            console.warn('Dashboard partial load failed:', ['/api/campaigns', '/api/security', '/api/companies', '/api/logs', '/api/intents'][i], r.reason)
          }
        })
      } catch (err) {
        console.error('Dashboard load failed:', err)
      }
    })()
    return () => { active = false }
  }, [auth, getJson])

  // Reports depend on the agent/date filters — fetched separately so changing a
  // filter doesn't re-pull everything else.
  useEffect(() => {
    if (!auth) return
    let active = true
    ;(async () => {
      try {
        const p = new URLSearchParams()
        if (filterAgent) p.set('agent', filterAgent)
        if (filterDate) p.set('date', filterDate)
        const jR = await getJson(`/api/reports?${p}`)
        if (active && jR) setReports(jR.reports ?? [])
      } catch (err) {
        console.error('Reports load failed:', err)
      }
    })()
    return () => { active = false }
  }, [auth, filterAgent, filterDate, getJson])

  // Periodic refresh so LiveKit dial / webhook updates appear without manual reload.
  useEffect(() => {
    if (!auth) return
    const ms = Number(process.env.NEXT_PUBLIC_POLL_INTERVAL_MS) || 15000
    const tick = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      try {
        const today = new Date().toISOString().slice(0, 10)
        const p = new URLSearchParams()
        if (filterAgent) p.set('agent', filterAgent)
        if (filterDate) p.set('date', filterDate)
        const [jC, jR, jL, jI] = await Promise.all([
          getJson('/api/campaigns'),
          getJson(`/api/reports?${p}`),
          getJson('/api/logs'),
          getJson(`/api/intents?date=${today}`),
        ])
        if (jC) setCampaigns(jC.campaigns ?? [])
        if (jR) setReports(jR.reports ?? [])
        if (jL) setAllCalls(jL.logs ?? [])
        if (jI) setAllIntents(jI.intents ?? [])
      } catch (err) {
        console.error('Poll refresh failed:', err)
      }
    }
    const id = setInterval(tick, ms)
    return () => clearInterval(id)
  }, [auth, filterAgent, filterDate, getJson])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setAuth(false)
  }

  const handleExportCSV = () => {
    if (!reports.length) return
    const keys = ['Campaign Name', 'Agent', ...REPORT_KEYS, 'Duration', 'CPL', 'Total Spent']
    const csvRows = [keys.join(','), ...reports.map(r => [`"${r.campaign?.name || ''}"`, r.campaign?.agent || '', ...REPORT_KEYS.map(k => r[k]), r.duration, r.cpl, r.total_spent].join(','))]
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `AVM_Report_${new Date().toISOString().split('T')[0]}.csv`; a.click()
  }

  const viewDetailedLogs = async (report: CampaignReport) => {
    setSelectedCampaign(report)
    try {
      const json = await getJson(`/api/logs?campaignId=${report.campaign_id || ''}`)
      if (json) setDetailedLogs(json.logs || [])
    } catch (err) {
      console.error('Failed to load call logs:', err)
      setDetailedLogs([])
    }
  }

  async function updateStatus(id: number, status: string) {
    await fetch(`/api/campaigns/${id}`, { 
      method:'PUT', 
      headers:{'Content-Type':'application/json'}, 
      body: JSON.stringify({ status }) 
    })

    if (status === 'running') {
      try {
        // Dispatch real outbound calls via the LiveKit gateway (same path as Seeker/Grace).
        const res = await fetch(`/api/campaigns/${id}/dial`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          console.error('Dial dispatch failed:', j?.error ?? res.statusText)
        }
      } catch (err) {
        console.error('Dial dispatch failed:', err)
      }
    }

    fetchData()
  }


  const isSecure = mounted && (window.isSecureContext || window.location.hostname === 'localhost')

  if (!authChecked) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', color: 'text.secondary' }}>
        <Typography variant="body2">Loading…</Typography>
      </Box>
    )
  }

  if (!auth) {
    return <AuthView onAuth={(v, r) => { setAuth(v); setRole(r) }} isSecure={isSecure} />
  }

  const activeCount = campaigns.filter(c => c.status === 'running' || c.status === 'paused').length

  // Company selector (Dashboard) — '' shows everything; otherwise scope every widget to the company
  // Company options: the real companies table when available, else derived from campaigns
  const companies = (companiesList.length ? companiesList.map(c => c.name) : Array.from(new Set(campaigns.map(c => c.company).filter(Boolean) as string[]))).sort()
  // Campaigns available to pick (narrowed by the company selector)
  const companyCampaigns = companyFilter ? campaigns.filter(c => c.company === companyFilter) : campaigns

  // Open the Control Room with filters preset (from a campaign/company card click)
  const openInControlRoom = (company: string, campaignId?: string) => {
    setCompanyFilter(company || '')
    setCampaignFilter(campaignId ?? '')
    setView('dashboard')
  }

  // Contact details by company name (from the companies table, when available)
  const contactByName = new Map(companiesList.map(c => [c.name, c]))

  // Per-company stats for the Companies view
  const companyStats = companies.map(name => {
    const camps = campaigns.filter(c => c.company === name)
    const ids = new Set(camps.map(c => c.id))
    const reps = reports.filter(r => ids.has(r.campaign_id))
    const spent = reps.reduce((a, r) => a + Number(r.total_spent || 0), 0)
    const qualified = reps.reduce((a, r) => a + Number(r.qualified || 0), 0)
    return {
      name,
      contact: contactByName.get(name)?.contact_name ?? null,
      active: camps.filter(c => c.status === 'running' || c.status === 'paused').length,
      total: camps.length,
      cpl: qualified ? spent / qualified : 0,
    }
  })

  async function createCompany() {
    const name = newCompanyName.trim()
    if (!name) return
    await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        contact_name: newContactName.trim(),
        contact_email: newContactEmail.trim(),
        contact_phone: newContactPhone.trim(),
      }),
    })
    setNewCompanyName(''); setNewContactName(''); setNewContactEmail(''); setNewContactPhone(''); setShowCompanyModal(false)
    const res = await fetch('/api/companies'); const j = await res.json(); setCompaniesList(j.companies ?? [])
  }
  // Effective scope: a single campaign if picked, else the company set, else everything
  const dashCampaigns = campaignFilter ? companyCampaigns.filter(c => String(c.id) === campaignFilter) : companyCampaigns
  const dashCampaignIds = new Set(dashCampaigns.map(c => c.id))
  const scoped = !!(companyFilter || campaignFilter)
  const dashReports = scoped ? reports.filter(r => dashCampaignIds.has(r.campaign_id)) : reports
  const dashCalls = scoped ? allCalls.filter(c => dashCampaignIds.has(c.campaign_id)) : allCalls
  const dashIntents = scoped ? allIntents.filter(i => dashCampaignIds.has(i.campaign_id)) : allIntents


  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: 'background.default', color: 'text.primary' }}>
      <Sidebar view={view} setView={setView} isOpen={sideOpen} onClose={() => setSideOpen(false)} onReplayTour={() => setTourStep(0)} />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <TopBar title={VIEW_TITLES[view]} campaigns={dashCampaigns} onMenu={() => setSideOpen(true)} onLogout={handleLogout} onTour={() => setTourStep(0)} />
        <Box component="main" sx={{ flex: 1, p: 3, pb: '6rem', overflowY: 'auto' }}>
          
          {/* ── DASHBOARD ── */}
          {view === 'dashboard' && (
            <>
              <Stack direction="row" data-tour="dash-header" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    {campaignFilter ? (dashCampaigns[0]?.name ?? 'Campaign') : (companyFilter || 'All Companies')}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {campaignFilter
                      ? `Single campaign${companyFilter ? ` · ${companyFilter}` : ''}`
                      : companyFilter ? `Company overview · ${dashCampaigns.length} campaigns` : 'Company-wide overview'}
                  </Typography>
                </Box>
                <Stack direction="row" data-tour="dash-scope" sx={{ gap: 1, flexWrap: 'wrap' }}>
                  <Select size="small" value={companyFilter} onChange={e => { setCompanyFilter(e.target.value); setCampaignFilter('') }} displayEmpty sx={{ minWidth: 180 }}>
                    <MenuItem value="">All Companies</MenuItem>
                    {companies.map(co => <MenuItem key={co} value={co}>{co}</MenuItem>)}
                  </Select>
                  <Select size="small" value={campaignFilter} onChange={e => setCampaignFilter(e.target.value)} displayEmpty sx={{ minWidth: 200 }}>
                    <MenuItem value="">All Campaigns</MenuItem>
                    {companyCampaigns.map(c => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
                  </Select>
                </Stack>
              </Stack>

              <InsightDashboard dash={dash} onRequestSaveTemplate={() => setShowSaveTemplate(true)} ctx={{
                reports: dashReports, calls: dashCalls, intents: dashIntents, campaigns: dashCampaigns,
                actions: {
                  onPlayPause: c => updateStatus(c.id, c.status === 'running' ? 'paused' : 'running'),
                  onStop: c => updateStatus(c.id, 'completed'),
                  onEdit: c => setCampaignAction({ mode: 'edit', campaign: c }),
                  onReuse: c => setCampaignAction({ mode: 'reuse', campaign: c }),
                  onArchive: c => updateStatus(c.id, 'archived'),
                },
              }} />
            </>
          )}

          {/* ── CAMPAIGNS ── */}
          {/* ── COMPANIES ── */}
          {view === 'companies' && (
            <>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>Companies</Typography>
                  <Typography variant="caption" color="text.secondary">{companyStats.length} total</Typography>
                </Stack>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
                  <ViewToggle value={companiesView} onChange={setCompaniesView} />
                  <Button variant="contained" data-tour="new-company" onClick={() => setShowCompanyModal(true)}>+ New Company</Button>
                </Stack>
              </Stack>

              {companiesView === 'cards' ? (
                <Grid container spacing={2}>
                  {companyStats.map(co => (
                    <Grid key={co.name} size={{ xs: 12, sm: 6, lg: 4 }}>
                      <Card sx={{ height: '100%', cursor: 'pointer', '&:hover': { borderColor: 'primary.main' } }} onClick={() => openInControlRoom(co.name)}>
                        <CardContent>
                          <Typography sx={{ fontWeight: 700, mb: co.contact ? 0.25 : 1.5 }}>{co.name}</Typography>
                          {co.contact && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                              Contact: {co.contact}
                            </Typography>
                          )}
                          <Stack direction="row" sx={{ gap: 2, flexWrap: 'wrap' }}>
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: '0.05em' }}>Active</Typography>
                              <Typography className="mono" sx={{ fontWeight: 700, fontSize: '1.3rem', color: 'success.main' }}>{co.active}</Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: '0.05em' }}>Total Camps</Typography>
                              <Typography className="mono" sx={{ fontWeight: 700, fontSize: '1.3rem' }}>{co.total}</Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'uppercase', fontSize: '0.62rem', letterSpacing: '0.05em' }}>Total CPL</Typography>
                              <Typography className="mono" sx={{ fontWeight: 700, fontSize: '1.3rem' }}>R{co.cpl.toFixed(2)}</Typography>
                            </Box>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                  {!companyStats.length && (
                    <Grid size={{ xs: 12 }}><Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No companies yet — add one to get started.</Typography></Grid>
                  )}
                </Grid>
              ) : (
                <GlassCard sx={{ p: 0, overflow: 'auto' }}>
                  <TableContainer>
                    <Table size="small" sx={{ minWidth: 640 }}>
                      <TableHead>
                        <TableRow>
                          {['Company', 'Contact', 'Active', 'Total Camps', 'Total CPL'].map((h, i) => (
                            <TableCell key={h} align={i < 2 ? 'left' : 'right'} sx={{ whiteSpace: 'nowrap' }}>{h}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {companyStats.map(co => (
                          <TableRow key={co.name} hover sx={{ cursor: 'pointer' }} onClick={() => openInControlRoom(co.name)}>
                            <TableCell sx={{ fontWeight: 600 }}>{co.name}</TableCell>
                            <TableCell sx={{ color: 'text.secondary' }}>{co.contact || '—'}</TableCell>
                            <TableCell align="right" className="mono" sx={{ color: 'success.main' }}>{co.active}</TableCell>
                            <TableCell align="right" className="mono">{co.total}</TableCell>
                            <TableCell align="right" className="mono">R{co.cpl.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                        {!companyStats.length && (
                          <TableRow><TableCell colSpan={5} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>No companies yet — add one to get started.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </GlassCard>
              )}
            </>
          )}

          {/* ── CAMPAIGNS ── */}
          {view === 'campaigns' && (
            <>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>Active Campaigns</Typography>
                  <Typography variant="caption" color="text.secondary">{activeCount} active</Typography>
                </Stack>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 1.5 }}>
                  <ViewToggle value={campaignsView} onChange={setCampaignsView} />
                  <Button variant="contained" data-tour="new-campaign" onClick={() => setShowModal(true)}>+ New Campaign</Button>
                </Stack>
              </Stack>

              {campaignsView === 'table' ? (
                <GlassCard sx={{ p: 0, overflow: 'auto' }}>
                  <TableContainer>
                    <Table size="small" sx={{ minWidth: 820 }}>
                      <TableHead>
                        <TableRow>
                          {['Campaign', 'Agent', 'Company', 'Status', 'Window / Speed', 'Actions'].map((h, i) => (
                            <TableCell key={h} align={i === 5 ? 'right' : 'left'} sx={{ whiteSpace: 'nowrap' }}>{h}</TableCell>
                          ))}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {campaigns.map(c => (
                          <TableRow key={c.id} hover sx={{ cursor: 'pointer' }} onClick={() => openInControlRoom(c.company || '', String(c.id))}>
                            <TableCell sx={{ fontWeight: 600 }}>{c.name}</TableCell>
                            <TableCell><AgentChip agent={c.agent} /></TableCell>
                            <TableCell sx={{ color: 'text.secondary' }}>{c.company || '—'}</TableCell>
                            <TableCell><StatusChip status={c.status} /></TableCell>
                            <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary', fontSize: '0.8rem' }}>{c.time_window_start}–{c.time_window_end} · {c.dialing_speed}/s</TableCell>
                            <TableCell align="right" onClick={e => e.stopPropagation()}>
                              <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
                                <Tooltip title={c.status === 'running' ? 'Pause' : 'Play'}><MuiIconButton size="small" color={c.status === 'running' ? 'warning' : 'success'} aria-label={c.status === 'running' ? `Pause ${c.name}` : `Play ${c.name}`} onClick={() => updateStatus(c.id, c.status === 'running' ? 'paused' : 'running')}>{c.status === 'running' ? <PauseIcon sx={{ fontSize: 17 }} /> : <PlayArrowIcon sx={{ fontSize: 17 }} />}</MuiIconButton></Tooltip>
                                <Tooltip title="Stop"><MuiIconButton size="small" aria-label={`Stop ${c.name}`} onClick={() => updateStatus(c.id, 'completed')}><StopIcon sx={{ fontSize: 17 }} /></MuiIconButton></Tooltip>
                                <Tooltip title="Edit (change MP4)"><MuiIconButton size="small" aria-label={`Edit ${c.name}`} onClick={() => setCampaignAction({ mode: 'edit', campaign: c })}><EditIcon sx={{ fontSize: 16 }} /></MuiIconButton></Tooltip>
                                <Tooltip title="Reuse as template"><MuiIconButton size="small" aria-label={`Reuse ${c.name}`} onClick={() => setCampaignAction({ mode: 'reuse', campaign: c })}><ContentCopyIcon sx={{ fontSize: 16 }} /></MuiIconButton></Tooltip>
                                <Tooltip title="Archive"><MuiIconButton size="small" aria-label={`Archive ${c.name}`} onClick={() => updateStatus(c.id, 'archived')} sx={{ color: 'warning.main' }}><ArchiveIcon sx={{ fontSize: 16 }} /></MuiIconButton></Tooltip>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                        {!campaigns.length && (
                          <TableRow><TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>No campaigns yet.</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </GlassCard>
              ) : (
              <Grid container spacing={2}>
                {campaigns.map(c => (
                  <Grid key={c.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <CardContent
                        sx={{ flexGrow: 1, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' } }}
                        onClick={() => openInControlRoom(c.company || '', String(c.id))}
                      >
                        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                          <Box>
                            <Typography sx={{ fontWeight: 600 }}>{c.name}</Typography>
                            <AgentChip agent={c.agent} />
                          </Box>
                          <StatusChip status={c.status} />
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          <strong>Company:</strong> {c.company || '—'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          <strong>Speed:</strong> {c.dialing_speed} calls/sec
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          <strong>Window:</strong> {c.time_window_start} – {c.time_window_end}
                        </Typography>
                      </CardContent>

                      <Divider />

                      <CardActions sx={{ px: 2, py: 1 }}>
                        <Tooltip title={c.status === 'running' ? 'Pause' : 'Play'}>
                          <MuiIconButton size="small" color={c.status === 'running' ? 'warning' : 'success'} aria-label={c.status === 'running' ? `Pause ${c.name}` : `Play ${c.name}`} onClick={() => updateStatus(c.id, c.status === 'running' ? 'paused' : 'running')}>
                            {c.status === 'running' ? <PauseIcon sx={{ fontSize: 19 }} /> : <PlayArrowIcon sx={{ fontSize: 19 }} />}
                          </MuiIconButton>
                        </Tooltip>
                        <Tooltip title="Stop">
                          <MuiIconButton size="small" aria-label={`Stop ${c.name}`} onClick={() => updateStatus(c.id, 'completed')}><StopIcon sx={{ fontSize: 19 }} /></MuiIconButton>
                        </Tooltip>
                        <Tooltip title="Edit (change MP4)">
                          <MuiIconButton size="small" aria-label={`Edit ${c.name}`} onClick={() => setCampaignAction({ mode: 'edit', campaign: c })}><EditIcon sx={{ fontSize: 18 }} /></MuiIconButton>
                        </Tooltip>
                        <Tooltip title="Reuse as template">
                          <MuiIconButton size="small" aria-label={`Reuse ${c.name}`} onClick={() => setCampaignAction({ mode: 'reuse', campaign: c })}><ContentCopyIcon sx={{ fontSize: 18 }} /></MuiIconButton>
                        </Tooltip>
                        <Tooltip title="Archive">
                          <MuiIconButton size="small" aria-label={`Archive ${c.name}`} onClick={() => updateStatus(c.id, 'archived')} sx={{ ml: 'auto', color: 'warning.main' }}><ArchiveIcon sx={{ fontSize: 18 }} /></MuiIconButton>
                        </Tooltip>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
              )}
            </>
          )}

          {/* ── REPORTS ── */}
          {view === 'reports' && selectedCampaign && (
            <CampaignDetail report={selectedCampaign} calls={detailedLogs} onBack={() => setSelectedCampaign(null)} />
          )}

          {view === 'reports' && !selectedCampaign && (
            <>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1.5 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Campaign Report</Typography>
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Select size="small" value={filterAgent} onChange={e => setFilterAgent(e.target.value)} displayEmpty sx={{ minWidth: 130 }}>
                    <MenuItem value="">All Agents</MenuItem>
                    <MenuItem value="seeker">Seeker</MenuItem>
                    <MenuItem value="grace">Grace</MenuItem>
                    <MenuItem value="sangoma">Sangoma</MenuItem>
                  </Select>
                  <TextField size="small" type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                    slotProps={{ htmlInput: { style: { colorScheme: 'dark' } } }}
                  />
                  <Button variant="outlined" onClick={handleExportCSV}>Export CSV</Button>
                </Stack>
              </Stack>

              <GlassCard sx={{ p: 0, overflow: 'auto' }}>
                <TableContainer>
                  <Table size="small" sx={{ minWidth: 1100 }}>
                    <TableHead>
                      <TableRow>
                        {['Campaign','Dialed','Connected','Qualified','Voicemail','No Speech','Hangup','NI','DNQ','Callback','NA','Busy','Failed','Duration','CPL','Spent'].map(h => (
                          <TableCell key={h} sx={{ whiteSpace: 'nowrap' }}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {reports.map(r => (
                        <TableRow key={r.id} hover onClick={() => viewDetailedLogs(r)} sx={{ cursor: 'pointer' }}>
                          <TableCell>
                            <AgentChip agent={r.campaign?.agent ?? ''} />
                            <Typography variant="caption" sx={{ display: 'block' }}>{r.campaign?.name}</Typography>
                          </TableCell>
                          {REPORT_KEYS.map(k => <TableCell key={k} className="mono" sx={{ fontSize: '0.82rem' }}>{Number(r[k]).toLocaleString()}</TableCell>)}
                          <TableCell className="mono" sx={{ fontSize: '0.82rem' }}>{r.duration}</TableCell>
                          <TableCell className="mono" sx={{ fontSize: '0.82rem' }}>R{Number(r.cpl).toFixed(2)}</TableCell>
                          <TableCell className="mono" sx={{ fontSize: '0.82rem', color: 'success.main', fontWeight: 600 }}>R{Number(r.total_spent).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </GlassCard>
            </>
          )}

          {/* ── CALL QUALITY ── */}
          {view === 'quality' && <CallQuality campaigns={campaigns} />}

          {/* ── SECURITY ── */}
          {view === 'security' && <SecurityView securityLogs={securityLogs} />}

          {/* ── SETTINGS ── */}
          {view === 'telephony' && <TelephonyView />}

          {view === 'settings' && <SettingsView role={role} />}

          {/* ── PROFILE ── */}
          {view === 'profile' && <ProfileView role={role} />}

        </Box>
      </Box>

      {/* ── CHART EXPAND DIALOG ── */}
      {(() => {
        if (!expandedChart) return null
        // '' = collective (all reports); otherwise filter to the selected campaign
        const visibleReports = expandCampaign
          ? reports.filter(r => r.campaign?.name === expandCampaign)
          : reports
        const charts = [
          { id: 'outcome',  title: 'Call Outcome Breakdown', chart: <OutcomeDonut reports={visibleReports} /> },
          { id: 'campaign', title: 'Campaign Comparison',    chart: <CampaignBar  reports={visibleReports} /> },
          { id: 'spend',    title: 'Spend & CPL',            chart: <SpendChart   reports={visibleReports} /> },
          { id: 'funnel',   title: 'Dialling Funnel',        chart: <FunnelChart  reports={visibleReports} /> },
        ]
        const active = charts.find(c => c.id === expandedChart)!
        return (
          <Dialog open onClose={() => { setExpandedChart(null); setExpandCampaign('') }} maxWidth="lg" fullWidth>
            <DialogTitle sx={{ fontWeight: 800 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 800 }}>{active.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {expandCampaign ? `Showing: ${expandCampaign}` : 'Collective — all campaigns'}
                  </Typography>
                </Box>
                <Select
                  size="small"
                  displayEmpty
                  value={expandCampaign}
                  onChange={e => setExpandCampaign(e.target.value)}
                  sx={{ minWidth: 200, fontSize: '0.85rem' }}
                >
                  <MenuItem value="">All Campaigns (Collective)</MenuItem>
                  {reports.map(r => (
                    <MenuItem key={r.id} value={r.campaign?.name ?? ''}>{r.campaign?.name}</MenuItem>
                  ))}
                </Select>
              </Stack>
            </DialogTitle>
            <DialogContent>
              <Box sx={{ height: 420 }}>{active.chart}</Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => { setExpandedChart(null); setExpandCampaign('') }}>Close</Button>
            </DialogActions>
          </Dialog>
        )
      })()}

      {showModal && (
        <CampaignModal
          onClose={() => setShowModal(false)}
          onCreated={fetchData}
          companies={companiesList}
          onNeedCompany={() => { setShowModal(false); setShowCompanyModal(true) }}
        />
      )}
      <Dialog open={showCompanyModal} onClose={() => setShowCompanyModal(false)} maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: { overflow: 'hidden', borderRadius: `${radius.lg}px` } } }}
      >
        <Box sx={{
          position: 'relative', display: 'flex', alignItems: 'center', gap: 1.75, px: 3, pt: 2.75, pb: 2.25,
          background: `linear-gradient(135deg, rgba(55,166,96,0.16) 0%, rgba(55,166,96,0.03) 48%, transparent 100%)`,
          '&::after': { content: '""', position: 'absolute', left: 0, right: 0, bottom: 0, height: '1px',
            background: `linear-gradient(90deg, ${semantic.accent} 0%, rgba(55,166,96,0.15) 40%, ${colors.border1} 100%)` },
        }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: `${radius.md}px`,
            flexShrink: 0, bgcolor: 'rgba(55,166,96,0.16)', border: `1px solid rgba(55,166,96,0.4)`, color: semantic.accentBright,
            boxShadow: `0 0 18px -4px ${semantic.accentGlow}66`,
          }}>
            <BusinessIcon fontSize="small" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 19, lineHeight: 1.2, letterSpacing: '-0.01em' }}>New Company</Typography>
            <Typography variant="body2" color="text.secondary">Add a company and its primary contact.</Typography>
          </Box>
          <MuiIconButton onClick={() => setShowCompanyModal(false)} size="small" aria-label="Close" sx={{ color: semantic.textSoft, alignSelf: 'flex-start', mt: -0.5 }}>
            <CloseIcon fontSize="small" />
          </MuiIconButton>
        </Box>
        <DialogContent sx={{ pt: 3 }}>
          <Stack sx={{ gap: 2 }}>
            <TextField autoFocus fullWidth size="small" label="Company name" value={newCompanyName}
              onChange={e => setNewCompanyName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createCompany() }}
            />
            <TextField fullWidth size="small" label="Contact name" value={newContactName} onChange={e => setNewContactName(e.target.value)} />
            <TextField fullWidth size="small" type="email" label="Contact email" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} />
            <TextField fullWidth size="small" label="Contact phone" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.75, pt: 1 }}>
          <Button onClick={() => setShowCompanyModal(false)} variant="outlined">Cancel</Button>
          <Button variant="contained" onClick={createCompany} disabled={!newCompanyName.trim()}>Create</Button>
        </DialogActions>
      </Dialog>
      {campaignAction && (
        <CampaignActionDialog
          mode={campaignAction.mode}
          campaign={campaignAction.campaign}
          onClose={() => setCampaignAction(null)}
          onDone={fetchData}
        />
      )}
      {showSaveTemplate && (
        <SaveTemplateDialog
          onClose={() => setShowSaveTemplate(false)}
          onSave={async name => { await dash.saveTemplate(name) }}
        />
      )}
      {tourStep !== null && (
        <TutorialOverlay
          step={tourStep}
          steps={TOUR_STEPS}
          onNext={tourNext}
          onBack={() => setTourStep(s => (s === null ? null : Math.max(s - 1, 0)))}
          onSkip={endTour}
        />
      )}
      <FloatingNav view={view} setView={setView} />
    </Box>
  )
}
