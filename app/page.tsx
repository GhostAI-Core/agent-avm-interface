'use client'
import { useState, useEffect, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import KpiStrip from '@/components/KpiStrip'
import CampaignModal from '@/components/CampaignModal'
import AuthView from '@/components/AuthView'
import SecurityView from '@/components/SecurityView'
import GuideView from '@/components/GuideView'
import SettingsView from '@/components/SettingsView'
import { OutcomeDonut, CampaignBar, SpendChart, FunnelChart } from '@/components/Charts'
import { maskPhone } from '@/lib/security'
import type { Campaign, CampaignReport } from '@/types'

// ── Design tokens ─────────────────────────────────────────────────────────────
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

function agentPill(agent: string) {
  const map: Record<string, { bg: string; color: string }> = {
    seeker:  { bg:'rgba(59,130,246,0.15)',  color:'#3b82f6' },
    grace:   { bg:'rgba(168,85,247,0.15)',  color:'#a855f7' },
    sangoma: { bg:'rgba(249,115,22,0.15)',  color:'#f97316' },
  }
  const s = map[agent] ?? { bg:'rgba(148,163,184,0.15)', color:'#94a3b8' }
  return (
    <span style={{ background: s.bg, color: s.color, fontSize:'0.7rem', fontWeight:700, padding:'0.15rem 0.6rem', borderRadius:9999, display:'inline-block' }}>
      {agent ? agent.charAt(0).toUpperCase() + agent.slice(1) : agent}
    </span>
  )
}

function statusBadge(status: string) {
  const map: Record<string, { bg: string; color: string }> = {
    running:   { bg:'rgba(16,185,129,0.18)',  color:'#10b981' },
    paused:    { bg:'rgba(245,158,11,0.18)',  color:'#f59e0b' },
    draft:     { bg:'rgba(148,163,184,0.15)', color:'#94a3b8' },
    completed: { bg:'rgba(59,130,246,0.15)',  color:'#3b82f6' },
  }
  const s = map[status] ?? { bg:'rgba(148,163,184,0.15)', color:'#94a3b8' }
  return (
    <span style={{ background: s.bg, color: s.color, fontSize:'0.72rem', fontWeight:700, padding:'0.2rem 0.65rem', borderRadius:9999, whiteSpace:'nowrap' }}>
      {status}
    </span>
  )
}

const glass = { background: C.glass, backdropFilter:'blur(14px)', WebkitBackdropFilter:'blur(14px)', border:`1px solid ${C.border}`, boxShadow:'0 8px 32px rgba(0,0,0,0.3)' }
const inputStyle: React.CSSProperties = { width:'100%', padding:'0.65rem 0.9rem', background:'rgba(0,0,0,0.25)', border:`1px solid ${C.border}`, borderRadius:8, color:'white', fontFamily:'inherit', fontSize:'0.875rem', outline:'none' }

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Dashboard Overview',
  campaigns: 'Campaigns',
  reports:   'Campaign Report',
  security:  'Security Audit Log',
  guide:     'Platform Training Guide',
  settings:  'System Settings',
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
    const res = await fetch(`/api/logs?campaignId=${report.campaign?.id || ''}`); const json = await res.json(); setDetailedLogs(json.logs || [])
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

  function IconBtn({ onClick, title, danger, children }: { onClick: () => void; title: string; danger?: boolean; children: React.ReactNode }) {
    const [hov, setHov] = useState(false)
    return (
      <button
        onClick={onClick} title={title}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
        style={{
          background: hov ? (danger ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.12)') : 'rgba(255,255,255,0.06)',
          color: hov && danger ? '#ef4444' : '#f8fafc',
          border: 'none', borderRadius: 6, padding:'0.45rem 0.55rem',
          cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center',
          fontSize: '1rem', transition:'all 0.15s', fontFamily:'inherit',
        }}
      >
        {children}
      </button>
    )
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', background:'#0f172a', color:C.text, fontFamily:"'Inter', sans-serif" }}>
      <Sidebar view={view} setView={setView} isOpen={sideOpen} onClose={() => setSideOpen(false)} role={role} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        <TopBar title={VIEW_TITLES[view]} onMenu={() => setSideOpen(true)} onLogout={() => setAuth(false)} />
        <main style={{ flex:1, padding:'1.5rem', overflowY:'auto' }}>
          
          {/* ── DASHBOARD ── */}
          {view === 'dashboard' && (
            <>
              <KpiStrip reports={reports} />
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
                <h2 style={{ fontSize:'1.1rem', fontWeight:600 }}>Live Active Calls</h2>
                <span style={{ fontSize:'0.75rem', color:C.success, display:'flex', alignItems:'center', gap:'0.4rem' }}>
                  <span style={{ width:8, height:8, background:C.success, borderRadius:'50%', animation:'pulse 2s infinite' }} />
                  Monitoring Live Streams
                </span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'1.25rem' }}>
                {[
                  { title:'Call Outcome Breakdown', chart:<OutcomeDonut reports={reports} /> },
                  { title:'Campaign Comparison',    chart:<CampaignBar   reports={reports} /> },
                  { title:'Spend & CPL',            chart:<SpendChart    reports={reports} /> },
                  { title:'Dialling Funnel',        chart:<FunnelChart   reports={reports} /> },
                ].map(({ title, chart }) => (
                  <div key={title} style={{ ...glass, borderRadius:12, padding:'1.25rem' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
                      <h3 style={{ fontSize:'0.88rem', fontWeight:600 }}>{title}</h3>
                      <span style={{ fontSize:'0.68rem', color:C.muted }}>expand ↗</span>
                    </div>
                    <div style={{ height:180 }}>{chart}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── CAMPAIGNS ── */}
          {view === 'campaigns' && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
                <h2 style={{ fontSize:'1.1rem', fontWeight:600 }}>Active Campaigns <span style={{ marginLeft:'0.75rem', fontSize:'0.8rem', color:C.muted }}>{activeCount} active</span></h2>
                <button onClick={() => setShowModal(true)} style={{ background:C.accent, color:'white', padding:'0.65rem 1.4rem', borderRadius:8, fontWeight:600, fontSize:'0.875rem', border:'none', cursor:'pointer' }}>+ New Campaign</button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:'1.25rem' }}>
                {campaigns.map(c => (
                  <div key={c.id} style={{ ...glass, borderRadius:12, padding:'1.4rem', display:'flex', flexDirection:'column', gap:'0.9rem' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div><h3 style={{ fontSize:'1.1rem', fontWeight:600 }}>{c.name}</h3>{agentPill(c.agent)}</div>
                      {statusBadge(c.status)}
                    </div>
                    <div style={{ color:C.muted, fontSize:'0.88rem' }}>
                      <p><strong>Speed:</strong> {c.dialing_speed} calls/sec</p>
                      <p><strong>Window:</strong> {c.time_window_start} – {c.time_window_end}</p>
                    </div>
                    <div style={{ display:'flex', gap:'0.5rem', paddingTop:'0.9rem', borderTop:`1px solid ${C.border}` }}>
                      {c.status === 'running' ? <IconBtn onClick={() => updateStatus(c.id,'paused')} title="Pause">⏸</IconBtn> : <IconBtn onClick={() => updateStatus(c.id,'running')} title="Resume">▶</IconBtn>}
                      <IconBtn onClick={() => updateStatus(c.id,'completed')} title="Stop">⏹</IconBtn>
                      <div style={{ marginLeft:'auto' }}><IconBtn onClick={() => deleteCampaign(c.id)} title="Delete" danger>🗑</IconBtn></div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── REPORTS ── */}
          {view === 'reports' && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
                <h2 style={{ fontSize:'1.1rem', fontWeight:600 }}>Campaign Report</h2>
                <div style={{ display:'flex', gap:'0.6rem' }}>
                  <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)} style={{ ...inputStyle, width:'auto' }}>
                    <option value="">All Agents</option><option value="seeker">Seeker</option><option value="grace">Grace</option><option value="sangoma">Sangoma</option>
                  </select>
                  <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ ...inputStyle, width:'auto', colorScheme:'dark' }} />
                  <button onClick={handleExportCSV} style={{ background:'transparent', color:'white', border:`1px solid ${C.border}`, padding:'0.6rem 1.2rem', borderRadius:8, cursor:'pointer' }}>Export CSV</button>
                </div>
              </div>
              <div style={{ ...glass, borderRadius:12, overflow:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', textAlign:'left', minWidth:1100 }}>
                  <thead>
                    <tr>{['Campaign Name','Dialed','Connected','Qualified','Voicemail','No Speech','Hangup','NI','DNQ','Callback','NA','Busy','Failed','Duration','CPL','Spent'].map(h => (<th key={h} style={{ padding:'0.85rem 1.1rem', borderBottom:`1px solid ${C.border}`, background:'rgba(0,0,0,0.2)', fontWeight:600, color:C.muted, fontSize:'0.7rem', textTransform:'uppercase' }}>{h}</th>))}</tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.id} onClick={() => viewDetailedLogs(r)} style={{ cursor:'pointer', borderBottom:`1px solid ${C.border}` }}>
                        <td style={{ padding:'0.85rem 1.1rem' }}>{agentPill(r.campaign?.agent ?? '')}<br/>{r.campaign?.name}</td>
                        {REPORT_KEYS.map(k => (<td key={k} style={{ padding:'0.85rem 1.1rem', fontSize:'0.82rem' }}>{Number(r[k]).toLocaleString()}</td>))}
                        <td style={{ padding:'0.85rem 1.1rem', fontSize:'0.82rem' }}>{r.duration}</td>
                        <td style={{ padding:'0.85rem 1.1rem', fontSize:'0.82rem' }}>R{r.cpl.toFixed(2)}</td>
                        <td style={{ padding:'0.85rem 1.1rem', fontSize:'0.82rem', color:C.success, fontWeight:600 }}>R{r.total_spent.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── SECURITY ── */}
          {view === 'security' && <SecurityView securityLogs={securityLogs} C={C} glass={glass} />}

          {/* ── GUIDE ── */}
          {view === 'guide' && <GuideView glass={glass} />}

          {/* ── SETTINGS ── */}
          {view === 'settings' && <SettingsView role={role} providers={providers} setProviders={setProviders} C={C} glass={glass} inputStyle={inputStyle} />}

        </main>
      </div>

      {selectedCampaign && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.8)', backdropFilter:'blur(10px)', display:'flex', justifyContent:'center', alignItems:'center', padding:'1rem' }}>
          <div style={{ ...glass, width:'100%', maxWidth:800, borderRadius:24, padding:'2rem', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <div><h2 style={{ fontSize:'1.25rem', fontWeight:800 }}>{selectedCampaign.campaign?.name}</h2><p style={{ color:C.muted, fontSize:'0.85rem' }}>Individual Call Records</p></div>
              <button onClick={() => setSelectedCampaign(null)} style={{ background:'transparent', border:'none', color:C.muted, fontSize:'1.5rem', cursor:'pointer' }}>×</button>
            </div>
            <div style={{ flex:1, overflow:'auto', borderRadius:12, border:`1px solid ${C.border}` }}>
              <table style={{ width:'100%', borderCollapse:'collapse', textAlign:'left' }}>
                <thead><tr>{['Phone Number', 'Outcome', 'Duration', 'Timestamp'].map(h => (<th key={h} style={{ padding:'0.75rem 1rem', background:'rgba(0,0,0,0.2)', color:C.muted, fontSize:'0.75rem', fontWeight:600 }}>{h}</th>))}</tr></thead>
                <tbody>
                  {detailedLogs.map(log => (
                    <tr key={log.id}><td style={{ padding:'0.75rem 1rem', borderBottom:`1px solid ${C.border}`, fontSize:'0.85rem' }}>{maskPhone(log.phone)}</td><td style={{ padding:'0.75rem 1rem', borderBottom:`1px solid ${C.border}`, fontSize:'0.85rem' }}>{statusBadge(log.outcome)}</td><td style={{ padding:'0.75rem 1rem', borderBottom:`1px solid ${C.border}`, fontSize:'0.85rem' }}>{log.duration}</td><td style={{ padding:'0.75rem 1rem', borderBottom:`1px solid ${C.border}`, fontSize:'0.85rem', color:C.muted }}>{new Date(log.called_at).toLocaleString()}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showModal && <CampaignModal onClose={() => setShowModal(false)} onCreated={fetchData} />}
    </div>
  )
}
