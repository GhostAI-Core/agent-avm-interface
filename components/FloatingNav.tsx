'use client'
import { useState, useEffect } from 'react'
import Box from '@mui/material/Box'

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈' },
  { id: 'campaigns', label: 'Campaigns', icon: '⚡' },
  { id: 'reports', label: 'Report', icon: '📊' },
  { id: 'security', label: 'Security', icon: '🛡' },
  { id: 'sts', label: 'STS', icon: '📡' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

// Arc from 180° (left) to 270° (up) — fans toward top-left
const TOTAL_ARC = 90
const START_ANGLE = 180 // 180° = left, +90° = up; items fan into top-left quadrant
const RADIUS = 88       // px from FAB centre to item centre

function degToRad(d: number) { return (d * Math.PI) / 180 }

export default function FloatingNav({
  view,
  setView,
}: {
  view: string
  setView: (v: string) => void
}) {
  const [open, setOpen] = useState(false)

  // Close on Escape
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
      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            zIndex: 998,
          }}
        />
      )}

      {/* FAB container — anchors items relative to the button */}
      <div
        style={{
          position: 'fixed',
          bottom: 28,
          right: 28,
          zIndex: 999,
        }}
      >
        {/* Nav items */}
        {NAV.map((item, i) => {
          const angle = START_ANGLE + (i / (NAV.length - 1)) * TOTAL_ARC
          const rad = degToRad(angle)
          // When closed all items sit at (0,0); when open they fan out
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
                // Centre on the FAB: offset by half item size (40px)
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
                background: isActive
                  ? 'rgba(59,130,246,0.9)'
                  : 'rgba(30,41,59,0.92)',
                border: isActive
                  ? '1.5px solid rgba(59,130,246,0.8)'
                  : '1.5px solid rgba(255,255,255,0.12)',
                boxShadow: isActive
                  ? '0 4px 20px rgba(59,130,246,0.45)'
                  : '0 4px 16px rgba(0,0,0,0.5)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                // Translate into position
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
                color: isActive ? '#fff' : '#94a3b8',
                letterSpacing: '0.03em',
                marginTop: 2,
                textTransform: 'uppercase',
              }}>
                {item.label}
              </span>
            </div>
          )
        })}

        {/* Main FAB button */}
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
            background: open
              ? 'rgba(239,68,68,0.85)'
              : 'rgba(59,130,246,0.9)',
            boxShadow: open
              ? '0 6px 28px rgba(239,68,68,0.5)'
              : '0 6px 28px rgba(59,130,246,0.5)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            transition: 'background 0.22s, box-shadow 0.22s, transform 0.22s',
            transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* ✕ when open, grid icon when closed */}
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

      <style>{`
        @keyframes fabPulse {
          0%, 100% { box-shadow: 0 6px 28px rgba(59,130,246,0.5); }
          50%       { box-shadow: 0 6px 36px rgba(59,130,246,0.8); }
        }
      `}</style>
    </Box>
  )
}
