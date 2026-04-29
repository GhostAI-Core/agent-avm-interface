'use client'
import { useState, useEffect, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import KpiStrip from '@/components/KpiStrip'
import CampaignModal from '@/components/CampaignModal'
import { OutcomeDonut, CampaignBar, SpendChart, FunnelChart } from '@/components/Charts'
import type { Campaign, CampaignReport } from '@/types'

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Dashboard Overview',
  campaigns: 'Campaigns',
  reports:   'Campaign Report',
}

const BADGE_CLASS: Record<string, string> = {
  running:   'badge badge-running',
  paused:    'badge badge-paused',
  draft:     'badge badge-draft',
  completed: 'badge badge-completed',
}

const AGENT_DOT: Record<string, string> = {
  seeker: 'dot-seeker', grace: 'dot-grace', sangoma: 'dot-sangoma',
}

const AGENT_PILL: Record<string, string> = {
  seeker: 'agent-pill agent-seeker', grace: 'agent-pill agent-grace', sangoma: 'agent-pill agent-sangoma',
}

export default function Page() {
  const [view,        setView]        = useState('dashboard')
  const [sideOpen,    setSideOpen]    = useState(false)
  const [showModal,   setShowModal]   = useState(false)
  const [campaigns,   setCampaigns]   = useState<Campaign[]>([])
  const [reports,     setReports]     = useState<CampaignReport[]>([])
  const [filterAgent, setFilterAgent] = useState('')
  const [filterDate,  setFilterDate]  = useState('')

  const loadCampaigns = useCallback(async () => {
    const res = await fetch('/api/campaigns')
    const j   = await res.json()
    setCampaigns(j.campaigns ?? [])
  }, [])

  const loadReports = useCallback(async () => {
    const params = new URLSearchParams()
    if (filterAgent) params.set('agent', filterAgent)
    if (filterDate)  params.set('date',  filterDate)
    const res = await fetch(`/api/reports?${params}`)
    const j   = await res.json()
    setReports(j.reports ?? [])
  }, [filterAgent, filterDate])

  useEffect(() => { loadCampaigns(); loadReports() }, [loadCampaigns, loadReports])

  async function updateStatus(id: number, status: string) {
    await fetch(`/api/campaigns/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status }) })
    loadCampaigns()
  }
  async function deleteCampaign(id: number) {
    await fetch(`/api/campaigns/${id}`, { method:'DELETE' })
    loadCampaigns()
  }

  const activeCount = campaigns.filter(c => c.status === 'running' || c.status === 'paused').length

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>

      <Sidebar active={view} onNav={setView} open={sideOpen} onClose={() => setSideOpen(false)} />

      {/* Content — offset by sidebar on desktop */}
      <div
        className="main-content"
        style={{ marginLeft: 260, flex: 1, display:'flex', flexDirection:'column', minWidth:0, overflow:'hidden' }}
      >
        <TopBar title={VIEW_TITLES[view]} campaigns={campaigns} onMenuClick={() => setSideOpen(true)} />

        <main className="views-pad" style={{ flex:1, overflowY:'auto', padding:'1.75rem 2rem' }}>

          {/* ── DASHBOARD ── */}
          {view === 'dashboard' && (
            <>
              <KpiStrip reports={reports} />
              <div
                className="chart-grid"
                style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'1.25rem' }}
              >
                {[
                  { title:'Call Outcome Breakdown', chart:<OutcomeDonut reports={reports} /> },
                  { title:'Campaign Comparison',    chart:<CampaignBar   reports={reports} /> },
                  { title:'Spend & CPL',            chart:<SpendChart    reports={reports} /> },
                  { title:'Dialling Funnel',        chart:<FunnelChart   reports={reports} /> },
                ].map(({ title, chart }) => (
                  <div key={title} className="glass card-lift" style={{ borderRadius:12, padding:'1.25rem', cursor:'default' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
                      <h3 style={{ fontSize:'0.88rem', fontWeight:600 }}>{title}</h3>
                      <span style={{ fontSize:'0.68rem', color:'#94a3b8' }}>expand ↗</span>
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
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem', flexWrap:'wrap', gap:'0.75rem' }}>
                <h2 style={{ fontSize:'1.1rem', fontWeight:600 }}>
                  Active Campaigns
                  <span style={{ marginLeft:'0.75rem', fontSize:'0.8rem', color:'#94a3b8', fontWeight:400 }}>{activeCount} active</span>
                </h2>
                <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Campaign</button>
              </div>
              <div
                className="grid-cards"
                style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px, 1fr))', gap:'1.25rem' }}
              >
                {campaigns.map(c => (
                  <div key={c.id} className="glass card-lift" style={{ borderRadius:12, padding:'1.4rem', display:'flex', flexDirection:'column', gap:'0.9rem' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
                        <h3 style={{ fontSize:'1.1rem', fontWeight:600 }}>{c.name}</h3>
                        <span className={AGENT_PILL[c.agent]}>
                          {c.agent.charAt(0).toUpperCase() + c.agent.slice(1)}
                        </span>
                      </div>
                      <span className={BADGE_CLASS[c.status] ?? 'badge badge-draft'}>{c.status}</span>
                    </div>
                    <div style={{ color:'#94a3b8', fontSize:'0.88rem', display:'flex', flexDirection:'column', gap:'0.3rem' }}>
                      <p><strong style={{ color:'#cbd5e1' }}>Speed:</strong> {c.dialing_speed} calls/sec</p>
                      <p><strong style={{ color:'#cbd5e1' }}>Window:</strong> {c.time_window_start} – {c.time_window_end}</p>
                    </div>
                    <div className="progress-bar"><div className="progress-fill" style={{ width:'18%' }} /></div>
                    <div style={{ display:'flex', gap:'0.5rem', paddingTop:'0.9rem', borderTop:'1px solid rgba(255,255,255,0.1)' }}>
                      {c.status === 'running'
                        ? <button className="btn-icon" onClick={() => updateStatus(c.id,'paused')}  title="Pause">⏸</button>
                        : <button className="btn-icon" onClick={() => updateStatus(c.id,'running')} title="Resume">▶</button>}
                      <button className="btn-icon"          onClick={() => updateStatus(c.id,'completed')} title="Stop">⏹</button>
                      <button className="btn-icon danger"   onClick={() => deleteCampaign(c.id)}           title="Delete" style={{ marginLeft:'auto' }}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── REPORTS ── */}
          {view === 'reports' && (
            <>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem', flexWrap:'wrap', gap:'0.75rem' }}>
                <h2 style={{ fontSize:'1.1rem', fontWeight:600 }}>Campaign Report</h2>
                <div style={{ display:'flex', gap:'0.6rem', flexWrap:'wrap', alignItems:'center' }}>
                  <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)} style={{ width:'auto' }}>
                    <option value="">All Agents</option>
                    <option value="seeker">Seeker</option>
                    <option value="grace">Grace</option>
                    <option value="sangoma">Sangoma</option>
                  </select>
                  <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} style={{ width:'auto' }} />
                  <button className="btn-secondary">Export CSV</button>
                  <button className="btn-secondary">Export PDF</button>
                </div>
              </div>
              <div className="glass" style={{ borderRadius:12, overflow:'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {['Campaign Name','Dialed','Connected','Qualified','Voicemail','No Speech','Hangup','NI','DNQ','Callback','NA','Busy Line','Failed','Duration','CPL','Total Spent'].map(h => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r, i) => (
                      <tr key={r.id} className={i === reports.length - 1 ? 'row-total' : ''}>
                        <td>
                          <span className={AGENT_PILL[r.campaign?.agent ?? '']}>{r.campaign?.agent}</span>
                          <br />{r.campaign?.name}
                        </td>
                        {(['dialed','connected','qualified','voicemail','no_speech','hangup','ni','dnq','callback','no_answer','busy_line','failed'] as (keyof CampaignReport)[]).map(k => (
                          <td key={k as string}>{Number(r[k]).toLocaleString('en-ZA')}</td>
                        ))}
                        <td>{r.duration}</td>
                        <td>R{Number(r.cpl).toFixed(2)}</td>
                        <td className="spent">R{Number(r.total_spent).toLocaleString('en-ZA',{minimumFractionDigits:2})}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

        </main>
      </div>

      {showModal && <CampaignModal onClose={() => setShowModal(false)} onCreated={loadCampaigns} />}
    </div>
  )
}
