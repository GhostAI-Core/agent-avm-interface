'use client'
import { useState, useEffect, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import TopBar from '@/components/TopBar'
import KpiStrip from '@/components/KpiStrip'
import CampaignModal from '@/components/CampaignModal'
import { OutcomeDonut, CampaignBar, SpendChart, FunnelChart } from '@/components/Charts'
import type { Campaign, CampaignReport } from '@/types'
import { Plus, Play, Pause, Square, Trash2 } from 'lucide-react'

const AGENT_COLOR: Record<string, string> = {
  seeker:  'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  grace:   'bg-purple-500/15 text-purple-400 border border-purple-500/20',
  sangoma: 'bg-orange-500/15 text-orange-400 border border-orange-500/20',
}
const STATUS_COLOR: Record<string, string> = {
  running:   'bg-emerald-500/15 text-emerald-400',
  paused:    'bg-amber-500/15 text-amber-400',
  draft:     'bg-slate-500/15 text-slate-400',
  completed: 'bg-blue-500/15 text-blue-400',
}
const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Dashboard Overview',
  campaigns: 'Campaigns',
  reports:   'Campaign Report',
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
    await fetch(`/api/campaigns/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    loadCampaigns()
  }

  async function deleteCampaign(id: number) {
    await fetch(`/api/campaigns/${id}`, { method: 'DELETE' })
    loadCampaigns()
  }

  const activeCount = campaigns.filter(c => c.status === 'running' || c.status === 'paused').length

  return (
    <div
      className="flex h-screen bg-slate-950 text-white overflow-hidden"
      style={{ backgroundImage: 'radial-gradient(circle at top right,rgba(59,130,246,0.08) 0%,transparent 50%),radial-gradient(circle at bottom left,rgba(139,92,246,0.08) 0%,transparent 50%)' }}
    >
      <Sidebar active={view} onNav={setView} open={sideOpen} onClose={() => setSideOpen(false)} />

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar title={VIEW_TITLES[view]} campaigns={campaigns} onMenuClick={() => setSideOpen(true)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-5">

          {/* ── DASHBOARD ── */}
          {view === 'dashboard' && (
            <div>
              <KpiStrip reports={reports} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {[
                  { title: 'Call Outcome Breakdown', chart: <OutcomeDonut reports={reports} /> },
                  { title: 'Campaign Comparison',    chart: <CampaignBar   reports={reports} /> },
                  { title: 'Spend & CPL',            chart: <SpendChart    reports={reports} /> },
                  { title: 'Dialling Funnel',        chart: <FunnelChart   reports={reports} /> },
                ].map(({ title, chart }) => (
                  <div key={title} className="bg-slate-900/60 border border-white/8 rounded-2xl p-4 backdrop-blur hover:border-white/15 transition-colors">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">{title}</p>
                    <div className="h-52">{chart}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── CAMPAIGNS ── */}
          {view === 'campaigns' && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-base font-semibold">Campaigns</h2>
                  <p className="text-xs text-slate-400">{activeCount} active</p>
                </div>
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  <Plus size={15} /> New Campaign
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {campaigns.map(c => (
                  <div key={c.id} className="bg-slate-900/60 border border-white/8 rounded-2xl p-4 flex flex-col gap-3 hover:border-white/15 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm leading-snug">{c.name}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 inline-block ${AGENT_COLOR[c.agent]}`}>
                          {c.agent.charAt(0).toUpperCase() + c.agent.slice(1)}
                        </span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${STATUS_COLOR[c.status] ?? 'bg-slate-500/15 text-slate-400'}`}>
                        {c.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 space-y-1">
                      <p><span className="text-slate-500">Speed:</span> {c.dialing_speed} calls/sec</p>
                      <p><span className="text-slate-500">Window:</span> {c.time_window_start} – {c.time_window_end}</p>
                    </div>
                    <div className="w-full h-1 bg-white/8 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: '18%' }} />
                    </div>
                    <div className="flex gap-2 pt-1 border-t border-white/8">
                      {c.status === 'running'
                        ? <button onClick={() => updateStatus(c.id, 'paused')}   title="Pause"   className="p-1.5 rounded-lg bg-white/5 hover:bg-amber-500/15   hover:text-amber-400   transition-colors"><Pause  size={14} /></button>
                        : <button onClick={() => updateStatus(c.id, 'running')}  title="Resume"  className="p-1.5 rounded-lg bg-white/5 hover:bg-emerald-500/15 hover:text-emerald-400 transition-colors"><Play   size={14} /></button>}
                      <button onClick={() => updateStatus(c.id, 'completed')}    title="Stop"    className="p-1.5 rounded-lg bg-white/5 hover:bg-slate-400/15   transition-colors"><Square size={14} /></button>
                      <button onClick={() => deleteCampaign(c.id)}               title="Delete"  className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/15     hover:text-red-400     transition-colors ml-auto"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── REPORTS ── */}
          {view === 'reports' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h2 className="text-base font-semibold">Campaign Report</h2>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={filterAgent} onChange={e => setFilterAgent(e.target.value)}
                    className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">All Agents</option>
                    <option value="seeker">Seeker</option>
                    <option value="grace">Grace</option>
                    <option value="sangoma">Sangoma</option>
                  </select>
                  <input
                    type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                    className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                  <button className="px-3 py-2 rounded-lg text-sm border border-white/10 text-slate-300 hover:bg-white/5">Export CSV</button>
                  <button className="px-3 py-2 rounded-lg text-sm border border-white/10 text-slate-300 hover:bg-white/5">Export PDF</button>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-white/8 rounded-2xl overflow-auto">
                <table className="w-full text-xs min-w-[1100px]">
                  <thead>
                    <tr className="border-b border-white/8 text-slate-400 uppercase tracking-wider">
                      {['Campaign','Dialed','Connected','Qualified','Voicemail','No Speech','Hangup','NI','DNQ','Callback','NA','Busy','Failed','Duration','CPL','Spent'].map(h => (
                        <th key={h} className="text-left px-3 py-3 font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r, i) => (
                      <tr
                        key={r.id}
                        className={`border-b border-white/5 hover:bg-white/[0.03] transition-colors
                          ${i === reports.length - 1 ? 'font-semibold border-t-2 border-blue-500/30 bg-blue-500/5' : ''}`}
                      >
                        <td className="px-3 py-3 whitespace-nowrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full mr-1.5 ${AGENT_COLOR[r.campaign?.agent ?? ''] ?? ''}`}>
                            {r.campaign?.agent}
                          </span>
                          {r.campaign?.name}
                        </td>
                        {(['dialed','connected','qualified','voicemail','no_speech','hangup','ni','dnq','callback','no_answer','busy_line','failed'] as (keyof CampaignReport)[]).map(k => (
                          <td key={k as string} className="px-3 py-3 tabular-nums text-slate-300">
                            {Number(r[k]).toLocaleString('en-ZA')}
                          </td>
                        ))}
                        <td className="px-3 py-3 text-slate-300 whitespace-nowrap">{r.duration}</td>
                        <td className="px-3 py-3 text-slate-300">R{Number(r.cpl).toFixed(2)}</td>
                        <td className="px-3 py-3 text-emerald-400 font-semibold">
                          R{Number(r.total_spent).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {showModal && <CampaignModal onClose={() => setShowModal(false)} onCreated={loadCampaigns} />}
    </div>
  )
}
