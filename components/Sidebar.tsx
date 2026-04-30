'use client'

const NAV = [
  { id: 'dashboard', label: 'Dashboard'       },
  { id: 'campaigns', label: 'Campaigns'       },
  { id: 'reports',   label: 'Campaign Report' },
  { id: 'security',  label: 'Security Audit'  },
  { id: 'guide',     label: 'Platform Guide'  },
  { id: 'settings',  label: 'Settings'        },
]

const AGENT_DOTS: { id: string; label: string; color: string }[] = [
  { id: 'seeker',  label: 'Seeker',  color: '#3b82f6' },
  { id: 'grace',   label: 'Grace',   color: '#a855f7' },
  { id: 'sangoma', label: 'Sangoma', color: '#f97316' },
]

export default function Sidebar({ view: active, setView: onNav, isOpen: open, onClose }: {
  view: string
  setView: (v: string) => void
  isOpen: boolean
  onClose: () => void
  role?: string
}) {
  return (
    <>
      {/* Mobile overlay — only shown when open */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(2px)',
            zIndex: 199,
          }}
        />
      )}

      <aside 
        style={{
          width: 260,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.75rem',
          borderRight: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(30,41,59,0.75)',
          backdropFilter: 'blur(14px)',
          position: 'relative',
          zIndex: 200,
          transition: 'transform 0.28s cubic-bezier(.4,0,.2,1)',
          flexShrink: 0,
          transform: open ? 'translateX(0)' : 'translateX(0)' // Logic handled by parent or CSS
        }}
      >
        {/* Logo */}
        <div style={{ padding: '3rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <img 
            src="/logo.png" 
            alt="VAS Inc" 
            style={{ 
              height: 112, 
              width: 'auto',
              objectFit: 'contain', 
              filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.4))' 
            }} 
          />
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '1rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>AGENT AVM | SOUTH AFRICA</p>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0 1.5rem' }}>
          {NAV.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => { onNav(id); onClose() }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.72rem 1rem',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                fontWeight: 500,
                transition: 'background 0.18s, color 0.18s',
                background: active === id ? 'rgba(59,130,246,0.12)' : 'transparent',
                color: active === id ? '#3b82f6' : '#94a3b8',
              }}
              onMouseEnter={e => {
                if (active !== id) {
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
                  ;(e.currentTarget as HTMLElement).style.color = '#f8fafc'
                }
              }}
              onMouseLeave={e => {
                if (active !== id) {
                  (e.currentTarget as HTMLElement).style.background = 'transparent'
                  ;(e.currentTarget as HTMLElement).style.color = '#94a3b8'
                }
              }}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Agent legend */}
        <div style={{ marginTop: 'auto', padding: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {AGENT_DOTS.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.color, display: 'inline-block', flexShrink: 0 }} />
                {a.label}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  )
}
