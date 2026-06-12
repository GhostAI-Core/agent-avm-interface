'use client'
import { useEffect, useLayoutEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TouchAppIcon from '@mui/icons-material/TouchApp'
import { colors, semantic, radius } from '@/lib/tokens'

export interface TourStep {
  key: string
  /** Optional view to switch to before showing this step. */
  view?: string
  /** `data-tour` value of the element to spotlight. Omit to centre the bubble. */
  target?: string
  title: string
  body: string
}

// One small idea per step ("a is for apple"): first label every left-bar tab,
// then walk into the Control Room piece by piece.
export const TOUR_STEPS: TourStep[] = [
  { key: 'welcome', title: 'Welcome 👋', body: "I'll show you around — one small step at a time. Left-click anywhere to go forward, right-click to go back." },

  // The left bar, tab by tab
  { key: 'nav-dashboard', target: 'nav-dashboard', title: 'Control Room', body: 'Your live command centre — every number and chart for your campaigns in one place.' },
  { key: 'nav-sts',       target: 'nav-sts',       title: 'STS Dashboard', body: 'Speech-to-speech overview: how your voice agents are performing in real time.' },
  { key: 'nav-companies', target: 'nav-companies', title: 'Companies', body: 'The clients you run campaigns for. Each company holds its own campaigns and contact.' },
  { key: 'nav-campaigns', target: 'nav-campaigns', title: 'Campaigns', body: 'Every calling campaign you create — start, pause, edit or archive them here.' },
  { key: 'nav-reports',   target: 'nav-reports',   title: 'Campaign Report', body: 'The full results table: dialled, connected, qualified, spend — exportable to CSV.' },
  { key: 'nav-quality',   target: 'nav-quality',   title: 'Call Quality', body: 'The intent waterfall — see exactly where callers drop off in the conversation.' },
  { key: 'nav-security',  target: 'nav-security',  title: 'Security Audit', body: 'A log of who did what and when — your trail for compliance.' },
  { key: 'nav-settings',  target: 'nav-settings',  title: 'Settings', body: 'Providers, keys and system options live here.' },
  { key: 'nav-profile',   target: 'nav-profile',   title: 'Profile', body: 'Your account and appearance preferences.' },

  // Into the first tab — the Control Room, step by step
  { key: 'cr-open',     view: 'dashboard', title: "Let's open the Control Room", body: "Here it is — the screen you'll use most. We'll look at each part on its own." },
  { key: 'cr-header',   view: 'dashboard', target: 'dash-header',    title: 'The heading', body: 'This tells you whose numbers you are looking at — all companies, one company, or a single campaign.' },
  { key: 'cr-scope',    view: 'dashboard', target: 'dash-scope',     title: 'Choose what to see', body: 'Pick a company in the first box, then narrow to one campaign in the second. Everything below updates to match.' },
  { key: 'cr-template', view: 'dashboard', target: 'dash-templates', title: 'Saved layouts', body: 'Arrangements you save show up here, so the whole team can load the same view.' },
  { key: 'cr-add',      view: 'dashboard', target: 'add-insight',    title: 'Add a card', body: 'Open this and pick a metric to drop onto the board. Add them one at a time — drag to rearrange, pin or hide.' },

  { key: 'finish', view: 'dashboard', title: "You're set 🎉", body: "That's the whole tour. Need it again? Tap the ? in the top bar, or 'Replay tour' at the bottom of the left bar." },
]

interface Props {
  step: number
  steps: TourStep[]
  onNext: () => void
  onBack: () => void
  onSkip: () => void
}

type Rect = { top: number; left: number; width: number; height: number }

export default function TutorialOverlay({ step, steps, onNext, onBack, onSkip }: Props) {
  const current = steps[step]
  const [rect, setRect] = useState<Rect | null>(null)
  const [showHint, setShowHint] = useState(false)

  const measure = () => {
    if (!current?.target) { setRect(null); return }
    const el = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`)
    if (!el) { setRect(null); return }
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) { setRect(null); return } // hidden (e.g. mobile sidebar)
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }

  // Scroll the target into view on step change, then measure.
  useEffect(() => {
    const el = current?.target ? document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`) : null
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t = setTimeout(measure, 320)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, current?.target])

  // Finger hint fades in after a 2s pause on each step; a quick clicker never sees it.
  useEffect(() => {
    setShowHint(false)
    const t = setTimeout(() => setShowHint(true), 2000)
    return () => clearTimeout(t)
  }, [step])

  useLayoutEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, current?.target])

  if (!current) return null

  const pad = 8
  const cut = rect && {
    top: Math.max(rect.top - pad, 0),
    left: Math.max(rect.left - pad, 0),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }

  // Bubble placement: beside the target when there is one; centred-upper otherwise
  // (kept clear of the finger hint, which sits at lower-middle).
  const bubbleW = 360
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  let bubbleStyle: React.CSSProperties
  if (cut) {
    const below = cut.top + cut.height + 14
    const placeBelow = below + 180 < vh
    const left = Math.min(Math.max(cut.left, 16), vw - bubbleW - 16)
    bubbleStyle = placeBelow
      ? { top: below, left }
      : { top: Math.max(cut.top - 14, 16), left, transform: 'translateY(-100%)' }
  } else {
    bubbleStyle = { top: '24%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
      {/* Click-catcher: the only interactive layer. Left-click anywhere advances,
          right-click anywhere goes back (and the browser menu is suppressed). */}
      <Box
        onClick={onNext}
        onContextMenu={e => { e.preventDefault(); onBack() }}
        sx={{ position: 'fixed', inset: 0, cursor: 'pointer' }}
      />

      {/* Scrim + spotlight cutout (visual only — clicks fall through to the catcher). */}
      {cut ? (
        <Box
          sx={{
            position: 'fixed',
            top: cut.top, left: cut.left, width: cut.width, height: cut.height,
            borderRadius: `${radius.md}px`,
            boxShadow: '0 0 0 9999px rgba(0,0,0,.72)',
            border: `1px solid ${semantic.accent}`,
            pointerEvents: 'none',
            transition: 'all .2s ease',
          }}
        />
      ) : (
        <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'rgba(0,0,0,.72)', pointerEvents: 'none' }} />
      )}

      {/* Glassmorphic text bubble (pointer-events none so clicks pass to the catcher;
          only the Skip control opts back in). */}
      <Box
        sx={{
          position: 'fixed',
          width: bubbleW,
          maxWidth: 'calc(100vw - 32px)',
          backgroundColor: 'rgba(18,20,26,0.55)',
          backdropFilter: 'blur(14px) saturate(140%)',
          WebkitBackdropFilter: 'blur(14px) saturate(140%)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: `${radius.lg}px`,
          overflow: 'hidden',
          boxShadow: '0 20px 60px -20px rgba(0,0,0,.85)',
          pointerEvents: 'none',
          ...bubbleStyle,
        }}
      >
        <Box
          sx={{
            px: 2.5, pt: 2, pb: 1.5,
            background: `linear-gradient(135deg, rgba(55,166,96,0.22) 0%, rgba(55,166,96,0.05) 48%, transparent 100%)`,
            borderBottom: `1px solid ${colors.border1}`,
          }}
        >
          <Typography variant="caption" sx={{ color: semantic.accentBright, fontWeight: 700, letterSpacing: '0.08em' }}>
            {step + 1} / {steps.length}
          </Typography>
          <Typography sx={{ fontWeight: 700, fontSize: 17, lineHeight: 1.25, mt: 0.25 }}>{current.title}</Typography>
        </Box>
        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.82)' }}>{current.body}</Typography>
        </Box>
        <Box sx={{ px: 2.5, pb: 1.75, display: 'flex', justifyContent: 'flex-end' }}>
          <Typography
            component="button"
            onClick={e => { e.stopPropagation(); onSkip() }}
            onContextMenu={e => { e.stopPropagation(); e.preventDefault() }}
            sx={{
              pointerEvents: 'auto', cursor: 'pointer', background: 'none', border: 'none', p: 0,
              fontSize: '0.78rem', color: semantic.textSoft, '&:hover': { color: 'text.primary' },
            }}
          >
            Skip tour
          </Typography>
        </Box>
      </Box>

      {/* Finger-cursor hint — centred, never blocks anything (pointer-events none),
          fades in after a 2s pause. */}
      <Box
        sx={{
          position: 'fixed', top: '68%', left: '50%', transform: 'translate(-50%, -50%)',
          pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
          opacity: showHint ? 1 : 0, transition: 'opacity .6s ease',
        }}
      >
        <TouchAppIcon sx={{ fontSize: 46, color: 'rgba(255,255,255,0.9)', filter: 'drop-shadow(0 4px 10px rgba(0,0,0,.6))' }} />
        <Box
          sx={{
            px: 1.5, py: 0.75, borderRadius: `${radius.md}px`,
            backgroundColor: 'rgba(18,20,26,0.55)',
            backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.14)',
          }}
        >
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>
            Left-click → next step&nbsp;&nbsp;·&nbsp;&nbsp;Right-click → go back
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
