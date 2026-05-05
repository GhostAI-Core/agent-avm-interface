'use client'
import { useState } from 'react'
import type { Campaign } from '@/types'

const AGENT_COLOR: Record<string, string> = {
  seeker: '#3b82f6', grace: '#a855f7', sangoma: '#f97316',
}
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  running: { bg:'rgba(16,185,129,0.18)', color:'#10b981' },
  paused:  { bg:'rgba(245,158,11,0.18)', color:'#f59e0b' },
}
const glass = { background:'rgba(30,41,59,0.75)', backdropFilter:'blur(14px)', WebkitBackdropFilter:'blur(14px)', border:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 8px 32px rgba(0,0,0,0.3)' }

function Hamburger({ onClick }: { onClick: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      aria-label="Menu"
      style={{ background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', gap:5, padding:4 }}
    >
      {[0,1,2].map(i => (
        <span key={i} style={{ display:'block', width:22, height:2, background: hov ? '#f8fafc' : '#94a3b8', borderRadius:2, transition:'background 0.2s' }} />
      ))}
    </button>
  )
}

export default function TopBar({ title, campaigns = [], onMenu, onLogout }: {
  title: string
  campaigns?: Campaign[]
  onMenu: () => void
  onLogout?: () => void
}) {
  const active = campaigns.filter(c => c.status === 'running' || c.status === 'paused')

  return (
    <div style={{ flexShrink: 0 }}>
      <header style={{ ...glass, display:'flex', alignItems:'center', justifyContent:'space-between', height:68, padding:'0 2rem', borderBottom:'1px solid rgba(255,255,255,0.1)', position:'sticky', top:0, zIndex:100 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'0.9rem' }}>
          <Hamburger onClick={onMenu} />
          <h1 style={{ fontSize:'1.3rem', fontWeight:600 }}>{title}</h1>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'1.25rem' }}>
          <span style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontSize:'0.78rem', color:'#10b981', fontWeight:600 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background:'#10b981', display:'inline-block', animation:'livePulse 1.4s infinite' }} />
            Live
          </span>
          <div 
            onClick={onLogout}
            title="Logout"
            style={{ width:32, height:32, borderRadius:'50%', background:'rgba(239,68,68,0.1)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.75rem', fontWeight:700, color:'#ef4444' }}>
            V
          </div>
        </div>
      </header>

      {active.length > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:'1.25rem', padding:'0.65rem 2rem', background:'rgba(15,23,42,0.6)', borderBottom:'1px solid rgba(255,255,255,0.06)', overflowX:'auto', flexWrap:'nowrap' }}>
          <span style={{ fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#64748b', flexShrink:0 }}>Active Monitor</span>
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
            {active.map((c, i) => (
              <div key={c.id} style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                {i > 0 && <span style={{ width:1, height:22, background:'rgba(255,255,255,0.1)', flexShrink:0 }} />}
                <span style={{ width:8, height:8, borderRadius:'50%', background: AGENT_COLOR[c.agent] ?? '#94a3b8', display:'inline-block', flexShrink:0 }} />
                <span style={{ fontSize:'0.8rem', fontWeight:600, whiteSpace:'nowrap' }}>{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <style>{`
        @keyframes livePulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.1); } 100% { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  )
}
