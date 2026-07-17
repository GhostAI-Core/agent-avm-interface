import type { Metadata } from 'next'

// Full-bleed "10-foot UI" shell for the smart-TV display route.
// Inherits the MUI dark theme from the root Providers; this layer only removes chrome,
// hides the pointer, and reserves overscan-safe padding (TVs crop ~5% at every edge).
// Purely additive — no existing dashboard behaviour is touched.

export const metadata: Metadata = {
  title: 'AVM — TV Display',
  description: 'Read-only wall display for AVM campaigns, navigable by TV remote.',
}

export default function TvLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: '#141414',
        // Overscan margin so nothing important lands in the cropped edge zone.
        padding: '3.5vh 3.5vw',
        boxSizing: 'border-box',
        cursor: 'none',
      }}
    >
      {children}
    </div>
  )
}
