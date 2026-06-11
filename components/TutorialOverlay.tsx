'use client'
import { useEffect, useLayoutEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
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

export const TOUR_STEPS: TourStep[] = [
  { key: 'companies', view: 'companies', target: 'new-company', title: 'Start with a company', body: 'Companies own your campaigns. Add one here — you can now capture a contact name, email, and phone too.' },
  { key: 'new-campaign', view: 'campaigns', target: 'new-campaign', title: 'Create a campaign', body: 'Spin up a campaign: upload an MP4 voice recording, attach a dial list (CSV), and set the dialing speed.' },
  { key: 'control-room', view: 'dashboard', target: 'dash-header', title: 'The Control Room', body: 'Your live overview. Everything below reacts to the scope you pick and the cards you choose.' },
  { key: 'scope', view: 'dashboard', target: 'dash-scope', title: 'Scope the view', body: 'Filter the whole dashboard to a company or a single campaign with these selectors.' },
  { key: 'add-insight', view: 'dashboard', target: 'add-insight', title: 'Customise your cards', body: 'Add insight cards, drag to rearrange, pin or hide them. “Reset layout” restores the default.' },
  { key: 'templates', view: 'dashboard', target: 'dash-templates', title: 'Save & reuse layouts', body: 'Rearrange a card and a “Save layout template” button appears. Saved templates show up here for the whole team.' },
  { key: 'report', view: 'dashboard', target: 'add-insight', title: 'Campaign Report, embedded', body: 'The full Campaign Report now lives right in the Control Room as a card — no need to leave the dashboard.' },
  { key: 'run', view: 'dashboard', target: 'dash-scope', title: 'Run a campaign', body: 'Use the play button on a campaign (in the Campaigns view or the Campaigns card) to put your agents to work.' },
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

  const measure = () => {
    if (!current?.target) { setRect(null); return }
    const el = document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`)
    if (!el) { setRect(null); return }
    const r = el.getBoundingClientRect()
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

  // Bubble placement: below the target if there's room, else above; centred when no target.
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
    bubbleStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  const isFirst = step === 0
  const isLast = step === steps.length - 1

  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 2000 }}>
      {/* Scrim with a transparent cutout over the target (or a full scrim when none). */}
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
        <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'rgba(0,0,0,.72)' }} onClick={onSkip} />
      )}

      {/* Text bubble */}
      <Box
        sx={{
          position: 'fixed',
          width: bubbleW,
          maxWidth: 'calc(100vw - 32px)',
          bgcolor: colors.bg1,
          border: `1px solid ${colors.border2}`,
          borderRadius: `${radius.lg}px`,
          overflow: 'hidden',
          boxShadow: '0 20px 60px -20px rgba(0,0,0,.8)',
          ...bubbleStyle,
        }}
      >
        <Box
          sx={{
            px: 2.5, pt: 2, pb: 1.5,
            background: `linear-gradient(135deg, rgba(55,166,96,0.16) 0%, rgba(55,166,96,0.03) 48%, transparent 100%)`,
            borderBottom: `1px solid ${colors.border1}`,
          }}
        >
          <Typography variant="caption" sx={{ color: semantic.accentBright, fontWeight: 700, letterSpacing: '0.08em' }}>
            {step + 1} / {steps.length}
          </Typography>
          <Typography sx={{ fontWeight: 700, fontSize: 17, lineHeight: 1.25, mt: 0.25 }}>{current.title}</Typography>
        </Box>
        <Box sx={{ px: 2.5, py: 2 }}>
          <Typography variant="body2" color="text.secondary">{current.body}</Typography>
        </Box>
        <Stack direction="row" sx={{ px: 2.5, pb: 2, alignItems: 'center', justifyContent: 'space-between' }}>
          <Button size="small" variant="text" onClick={onSkip} sx={{ color: semantic.textSoft }}>Skip</Button>
          <Stack direction="row" sx={{ gap: 1 }}>
            <Button size="small" variant="outlined" onClick={onBack} disabled={isFirst}>Back</Button>
            <Button size="small" variant="contained" onClick={isLast ? onSkip : onNext}>{isLast ? 'Done' : 'Next'}</Button>
          </Stack>
        </Stack>
      </Box>
    </Box>
  )
}
