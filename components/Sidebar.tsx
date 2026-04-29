'use client'
import { X } from 'lucide-react'

const NAV = [
  { id: 'dashboard', label: 'Dashboard'      },
  { id: 'campaigns', label: 'Campaigns'       },
  { id: 'reports',   label: 'Campaign Report' },
]

export default function Sidebar({ active, onNav, open, onClose }: {
  active: string
  onNav: (v: string) => void
  open: boolean
  onClose: () => void
}) {
  return (
    <>
      {/* Mobile overlay */}
      <div
        className="sidebar-overlay"
        style={{
          display: open ? 'block' : 'none',
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(2px)',
          zIndex: 199,
        }}
        onClick={onClose}
      />

      <aside
        className={`sidebar glass${open ? ' open' : ''}`}
        style={{
          width: 260,
          minHeight: '100vh',
          padding: '2rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.75rem',
          borderRight: '1px solid rgba(255,255,255,0.1)',
          position: 'fixed',
          top: 0, left: 0,
          zIndex: 200,
          transition: 'transform 0.28s cubic-bezier(.4,0,.2,1)',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.5px', lineHeight: 1 }}>
              Agent<span style={{ color: '#3b82f6' }}>AVM</span>
            </h2>
            <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.15rem' }}>South Africa</p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', color: '#94a3b8', fontSize: '1.4rem', lineHeight: 1, padding: '0.2rem' }}
            className="hamburger-close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {NAV.map(({ id, label }) => (
            <a
              key={id}
              href="#"
              className={`nav-link${active === id ? ' active' : ''}`}
              onClick={e => { e.preventDefault(); onNav(id); onClose() }}
            >
              {label}
            </a>
          ))}
        </nav>

        {/* Agent legend */}
        <div style={{ marginTop: 'auto', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[
              { id: 'seeker',  label: 'Seeker'  },
              { id: 'grace',   label: 'Grace'   },
              { id: 'sangoma', label: 'Sangoma' },
            ].map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>
                <span className={`dot-${a.id}`} style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block' }} />
                {a.label}
              </div>
            ))}
          </div>
        </div>
      </aside>
    </>
  )
}
