'use client'
import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'
import { colors, semantic } from '@/lib/tokens'

const NAV = [
  { id: 'dashboard', label: 'Control Room', icon: '◈' },
  { id: 'sts', label: 'STS', icon: '📡' },
  { id: 'companies', label: 'Companies', icon: '🏢' },
  { id: 'campaigns', label: 'Campaigns', icon: '⚡' },
  { id: 'reports', label: 'Report', icon: '📊' },
  { id: 'quality', label: 'Quality', icon: '🎯' },
  { id: 'security', label: 'Security', icon: '🛡' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

const TOTAL_ARC = 90
const START_ANGLE = 180
const RADIUS = 88

function degToRad(d: number) { return (d * Math.PI) / 180 }

export default function FloatingNav({
  view,
  setView,
}: {
  view: string
  setView: (v: string) => void
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  const toggle = () => setOpen(o => !o)
  const navigate = (id: string) => { setView(id); setOpen(false) }

  return (
    <Box sx={{ display: { xs: 'block', lg: 'none' }, position: 'relative', zIndex: 999 }}>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 998,
          }}
        />
      )}

      <div style={{ position: 'fixed', bottom: 28, right: 28, zIndex: 999 }}>
        {NAV.map((item, i) => {
          const angle = START_ANGLE + (i / (NAV.length - 1)) * TOTAL_ARC
          const rad = degToRad(angle)
          const tx = open ? -Math.cos(rad) * RADIUS : 0
          const ty = open ? -Math.sin(rad) * RADIUS : 0
          const isActive = view === item.id

          return (
            <div
              key={item.id}
              onClick={() => navigate(item.id)}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && navigate(item.id)}
              role="button"
              tabIndex={open ? 0 : -1}
              aria-label={`Navigate to ${item.label}`}
              style={{
                position: 'absolute',
                bottom: 4,
                right: 4,
                width: 48,
                height: 48,
                borderRadius: '50%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                background: isActive ? semantic.accent : colors.bg1,
                border: isActive
                  ? `1.5px solid ${semantic.accentDeep}`
                  : `1.5px solid ${colors.border2}`,
                transform: open
                  ? `translate(${tx - 4}px, ${ty - 4}px) scale(1)`
                  : 'translate(0,0) scale(0.4)',
                opacity: open ? 1 : 0,
                pointerEvents: open ? 'auto' : 'none',
                transition: `transform 0.32s cubic-bezier(.34,1.56,.64,1) ${i * 30}ms, opacity 0.22s ease ${i * 30}ms`,
              }}
            >
              <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{item.icon}</span>
              <span style={{
                fontSize: '0.55rem',
                fontWeight: 700,
                color: isActive ? colors.greenInk : colors.fg2,
                letterSpacing: '0.03em',
                marginTop: 2,
                textTransform: 'uppercase',
              }}>
                {item.label}
              </span>
            </div>
          )
        })}

        <button
          onClick={toggle}
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: open ? semantic.danger : semantic.accent,
            transition: 'background 0.22s, transform 0.22s',
            transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {open ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <line x1="4" y1="4" x2="16" y2="16" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
              <line x1="16" y1="4" x2="4" y2="16" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="5" cy="5" r="2.2" fill="white" />
              <circle cx="11" cy="5" r="2.2" fill="white" />
              <circle cx="17" cy="5" r="2.2" fill="white" />
              <circle cx="5" cy="11" r="2.2" fill="white" />
              <circle cx="11" cy="11" r="2.2" fill="white" />
              <circle cx="17" cy="11" r="2.2" fill="white" />
              <circle cx="5" cy="17" r="2.2" fill="white" />
              <circle cx="11" cy="17" r="2.2" fill="white" />
              <circle cx="17" cy="17" r="2.2" fill="white" />
            </svg>
          )}
        </button>
      </div>
    </Box>
  )
}
