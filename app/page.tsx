'use client'
import { useState, useEffect, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import FloatingNav from '@/components/FloatingNav'
import KpiStrip from '@/components/KpiStrip'
import CampaignModal from '@/components/CampaignModal'
import AuthView from '@/components/AuthView'
import SecurityView from '@/components/SecurityView'
import SettingsView from '@/components/SettingsView'
import { OutcomeDonut, CampaignBar, SpendChart, FunnelChart } from '@/components/Charts'
import { maskPhone } from '@/lib/security'
import STSDashboard from '@/components/STSDashboard'
import ProfileView from '@/components/ProfileView'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import MuiIconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import Divider from '@mui/material/Divider'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
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
import type { Campaign, CampaignReport } from '@/types'

// Tokens still used by child components that haven't been migrated yet
const C = {
  glass:   'rgba(30,41,59,0.75)',
  border:  'rgba(255,255,255,0.10)',
  accent:  '#3b82f6',
  success: '#10b981',
  warn:    '#f59e0b',
  danger:  '#ef4444',
  muted:   '#94a3b8',
  text:    '#f8fafc',
}

const glass = { background: C.glass, backdropFilter:'blur(14px)', WebkitBackdropFilter:'blur(14px)', border:`1px solid ${C.border}`, boxShadow:'0 8px 32px rgba(0,0,0,0.3)' }
const inputStyle: React.CSSProperties = { width:'100%', padding:'0.65rem 0.9rem', background:'rgba(0,0,0,0.25)', border:`1px solid ${C.border}`, borderRadius:8, color:'white', fontFamily:'inherit', fontSize:'0.875rem', outline:'none' }

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Dashboard Overview',
  campaigns: 'Campaigns',
  reports:   'Campaign Report',
  security:  'Security Audit Log',
  sts:       'STS Dashboard',
  settings:  'System Settings',
  profile:   'Profile & Appearance',
}

const REPORT_KEYS: (keyof CampaignReport)[] = ['dialed','connected','qualified','voicemail','no_speech','hangup','ni','dnq','callback','no_answer','busy_line','failed']
const INACTIVITY_LIMIT = 15 * 60 * 1000 // 15 minutes

export default function Page() {
  const [mounted,         setMounted]         = useState(false)
  const [auth,            setAuth]            = useState(false)
  const [role,            setRole]            = useState<'admin' | 'engineer'>('admin')
  const [view,        setView]        = useState('dashboard')
  const [sideOpen,    setSideOpen]    = useState(false)
  const [showModal,   setShowModal]   = useState(false)
  const [campaigns,   setCampaigns]   = useState<Campaign[]>([])
  const [reports,     setReports]     = useState<CampaignReport[]>([])
  const [providers,         setProviders]         = useState<any[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignReport | null>(null)
  const [detailedLogs,     setDetailedLogs]     = useState<any[]>([])
  const [activeCalls,      setActiveCalls]      = useState<any[]>([])
  const [securityLogs,    setSecurityLogs]     = useState<any[]>([])
  const [filterAgent,      setFilterAgent]      = useState('')
  const [filterDate,       setFilterDate]       = useState('')
  const [expandedChart,    setExpandedChart]    = useState<string | null>(null)
  const [expandCampaign,   setExpandCampaign]   = useState<string>('')  // '' = collective

  useEffect(() => { setMounted(true) }, [])

  const fetchData = useCallback(async () => {
    const resC = await fetch('/api/campaigns'); const jC = await resC.json(); setCampaigns(jC.campaigns ?? [])
    const p = new URLSearchParams(); if (filterAgent) p.set('agent', filterAgent); if (filterDate) p.set('date', filterDate)
    const resR = await fetch(`/api/reports?${p}`); const jR = await resR.json(); setReports(jR.reports ?? [])
  }, [filterAgent, filterDate])

  useEffect(() => {
    if (!auth) return
    let timeout: NodeJS.Timeout
    const resetTimer = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => { setAuth(false) }, INACTIVITY_LIMIT)
    }
    window.addEventListener('mousemove', resetTimer); window.addEventListener('keydown', resetTimer)
    resetTimer()
    return () => { clearTimeout(timeout); window.removeEventListener('mousemove', resetTimer); window.removeEventListener('keydown', resetTimer) }
  }, [auth])

  useEffect(() => {
    let active = true
    const init = async () => {
      const resC = await fetch('/api/campaigns'); const jC = await resC.json(); if (active) setCampaigns(jC.campaigns ?? [])
      const p = new URLSearchParams(); if (filterAgent) p.set('agent', filterAgent); if (filterDate) p.set('date', filterDate)
      const resR = await fetch(`/api/reports?${p}`); const jR = await resR.json(); if (active) setReports(jR.reports ?? [])
      const resP = await fetch('/api/providers'); const jP = await resP.json(); if (active) setProviders(jP.providers ?? [])
      const resS = await fetch('/api/security'); const jS = await resS.json(); if (active) setSecurityLogs(jS.logs ?? [])
    }
    init()
    return () => { active = false }
  }, [filterAgent, filterDate])

  const handleExportCSV = () => {
    if (!reports.length) return
    const keys = ['Campaign Name', 'Agent', ...REPORT_KEYS, 'Duration', 'CPL', 'Total Spent']
    const csvRows = [keys.join(','), ...reports.map(r => [`"${r.campaign?.name || ''}"`, r.campaign?.agent || '', ...REPORT_KEYS.map(k => r[k]), r.duration, r.cpl, r.total_spent].join(','))]
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `AVM_Report_${new Date().toISOString().split('T')[0]}.csv`; a.click()
  }

  const viewDetailedLogs = async (report: CampaignReport) => {
    setSelectedCampaign(report)
    const res = await fetch(`/api/logs?campaignId=${report.campaign_id || ''}`); const json = await res.json(); setDetailedLogs(json.logs || [])
  }

  async function updateStatus(id: number, status: string) {
    await fetch(`/api/campaigns/${id}`, { 
      method:'PUT', 
      headers:{'Content-Type':'application/json'}, 
      body: JSON.stringify({ status }) 
    })

    if (status === 'running') {
      // Trigger a simulation burst to show live data
      fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: id })
      }).then(() => fetchData())
    }

    fetchData()
  }

  async function deleteCampaign(id: number) {
    await fetch(`/api/campaigns/${id}`, { method:'DELETE' }); fetchData()
  }

  const isSecure = mounted && (window.isSecureContext || window.location.hostname === 'localhost')

  if (!auth) {
    return <AuthView onAuth={(v, r) => { setAuth(v); setRole(r) }} C={C} glass={glass} inputStyle={inputStyle} mounted={mounted} isSecure={isSecure} />
  }

  const activeCount = campaigns.filter(c => c.status === 'running' || c.status === 'paused').length


  return (
    <div style={{ minHeight:'100vh', display:'flex', background:'#0f172a', color:C.text, fontFamily:"'Inter', sans-serif" }}>
      <Sidebar view={view} setView={setView} isOpen={sideOpen} onClose={() => setSideOpen(false)} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        <TopBar title={VIEW_TITLES[view]} onMenu={() => setSideOpen(true)} onLogout={() => setAuth(false)} />
        <main style={{ flex:1, padding:'1.5rem', paddingBottom:'6rem', overflowY:'auto' }}>
          
          {/* ── DASHBOARD ── */}
          {view === 'dashboard' && (
            <>
              <KpiStrip reports={reports} />

              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>Live Active Calls</Typography>
                <Stack direction="row" sx={{ alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'success.main', animation: 'livePulse 1.4s infinite' }} />
                  <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>Monitoring Live Streams</Typography>
                </Stack>
              </Stack>

              <Grid container spacing={2}>
                {[
                  { id: 'outcome',  title: 'Call Outcome Breakdown', chart: <OutcomeDonut reports={reports} />,   metrics: ['Connected','Voicemail','No Speech','Hangup','NI','DNQ','Callback','NA+Busy+Failed'] },
                  { id: 'campaign', title: 'Campaign Comparison',    chart: <CampaignBar reports={reports} />,    metrics: ['Connected','Qualified'] },
                  { id: 'spend',    title: 'Spend & CPL',            chart: <SpendChart reports={reports} />,     metrics: ['Spent','CPL'] },
                  { id: 'funnel',   title: 'Dialling Funnel',        chart: <FunnelChart reports={reports} />,    metrics: ['Dialed','Connected','Voicemail','No Speech','Hangup','Qualified'] },
                ].map(({ id, title, chart, metrics }) => (
                  <Grid key={id} size={{ xs: 12, md: 6 }}>
                    <GlassCard>
                      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{title}</Typography>
                        <Tooltip title="Expand">
                          <MuiIconButton size="small" aria-label={`Expand ${title}`} onClick={() => setExpandedChart(id)}>
                            <OpenInFullIcon sx={{ fontSize: 16 }} />
                          </MuiIconButton>
                        </Tooltip>
                      </Stack>
                      <Box sx={{ height: 180 }}>{chart}</Box>
                    </GlassCard>
                  </Grid>
                ))}
              </Grid>
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
                <Button variant="contained" onClick={() => setShowModal(true)}>+ New Campaign</Button>
              </Stack>

              <Grid container spacing={2}>
                {campaigns.map(c => (
                  <Grid key={c.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <CardContent sx={{ flexGrow: 1 }}>
                        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                          <Box>
                            <Typography sx={{ fontWeight: 600 }}>{c.name}</Typography>
                            <AgentChip agent={c.agent} />
                          </Box>
                          <StatusChip status={c.status} />
                        </Stack>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          <strong>Speed:</strong> {c.dialing_speed} calls/sec
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          <strong>Window:</strong> {c.time_window_start} – {c.time_window_end}
                        </Typography>
                      </CardContent>

                      <Divider />

                      <CardActions sx={{ px: 2, py: 1 }}>
                        <Tooltip title={c.status === 'running' ? 'Pause' : 'Resume'}>
                          <MuiIconButton size="small" aria-label={c.status === 'running' ? `Pause ${c.name}` : `Resume ${c.name}`} onClick={() => updateStatus(c.id, c.status === 'running' ? 'paused' : 'running')}>
                            {c.status === 'running' ? '⏸' : '▶'}
                          </MuiIconButton>
                        </Tooltip>
                        <Tooltip title="Stop">
                          <MuiIconButton size="small" aria-label={`Stop ${c.name}`} onClick={() => updateStatus(c.id, 'completed')}>⏹</MuiIconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <MuiIconButton size="small" aria-label={`Delete ${c.name}`} onClick={() => deleteCampaign(c.id)} sx={{ ml: 'auto', color: 'error.main' }}>🗑</MuiIconButton>
                        </Tooltip>
                      </CardActions>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </>
          )}

          {/* ── REPORTS ── */}
          {view === 'reports' && (
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
                          <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', color: 'text.secondary', bgcolor: 'rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>{h}</TableCell>
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
                          {REPORT_KEYS.map(k => <TableCell key={k} sx={{ fontSize: '0.82rem' }}>{Number(r[k]).toLocaleString()}</TableCell>)}
                          <TableCell sx={{ fontSize: '0.82rem' }}>{r.duration}</TableCell>
                          <TableCell sx={{ fontSize: '0.82rem' }}>R{r.cpl.toFixed(2)}</TableCell>
                          <TableCell sx={{ fontSize: '0.82rem', color: 'success.main', fontWeight: 600 }}>R{r.total_spent.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </GlassCard>
            </>
          )}

          {/* ── SECURITY ── */}
          {view === 'security' && <SecurityView securityLogs={securityLogs} />}

          {/* ── STS DASHBOARD ── */}
          {view === 'sts' && <STSDashboard />}

          {/* ── SETTINGS ── */}
          {view === 'settings' && <SettingsView role={role} providers={providers} setProviders={setProviders} />}

          {/* ── PROFILE ── */}
          {view === 'profile' && <ProfileView role={role} />}

        </main>
      </div>

      <Dialog open={!!selectedCampaign} onClose={() => setSelectedCampaign(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>
          {selectedCampaign?.campaign?.name}
          <Typography variant="body2" color="text.secondary">Individual Call Records</Typography>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Phone Number', 'Outcome', 'Duration', 'Timestamp'].map(h => (
                    <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.75rem', bgcolor: 'rgba(0,0,0,0.2)', color: 'text.secondary' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {detailedLogs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell sx={{ fontSize: '0.85rem' }}>{maskPhone(log.phone)}</TableCell>
                    <TableCell><StatusChip status={log.outcome} /></TableCell>
                    <TableCell sx={{ fontSize: '0.85rem' }}>{log.duration}</TableCell>
                    <TableCell sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>{new Date(log.called_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedCampaign(null)}>Close</Button>
        </DialogActions>
      </Dialog>

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

      {showModal && <CampaignModal onClose={() => setShowModal(false)} onCreated={fetchData} />}
      <FloatingNav view={view} setView={setView} />
    </div>
  )
}
