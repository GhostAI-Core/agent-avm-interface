'use client'
import type { Campaign } from '@/types'

const BADGE: Record<string, string> = {
  running: 'badge badge-running',
  paused:  'badge badge-paused',
}
const DOT: Record<string, string> = {
  seeker: 'dot-seeker', grace: 'dot-grace', sangoma: 'dot-sangoma',
}

export default function TopBar({ title, campaigns, onMenuClick }: {
  title: string
  campaigns: Campaign[]
  onMenuClick: () => void
}) {
  const active = campaigns.filter(c => c.status === 'running' || c.status === 'paused')

  return (
    <div style={{ flexShrink: 0 }}>
      {/* Main bar */}
      <header
        className="glass topbar-pad"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 68, padding: '0 2rem',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          position: 'sticky', top: 0, zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
          <button className="hamburger" onClick={onMenuClick} aria-label="Menu">
            <span /><span /><span />
          </button>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 600 }}>{title}</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}>
            <span className="live-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
            Live
          </span>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: '#3b82f6' }}>
            A
          </div>
        </div>
      </header>

      {/* Campaign strip */}
      {active.length > 0 && (
        <div
          className="strip-pad"
          style={{
            display: 'flex', alignItems: 'center', gap: '1.25rem',
            padding: '0.65rem 2rem',
            background: 'rgba(15,23,42,0.6)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            overflowX: 'auto',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#64748b', flexShrink: 0 }}>
            Active
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {active.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {i > 0 && <span style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />}
                <span className={DOT[c.agent]} style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.name}</span>
                <span className={BADGE[c.status] ?? 'badge badge-draft'}>{c.status}</span>
                <div className="progress-bar" style={{ width: 56 }}>
                  <div className="progress-fill" style={{ width: '18%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
