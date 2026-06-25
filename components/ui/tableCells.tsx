'use client'

/**
 * Inline-styled cell helpers for the bespoke `DataTable`, ported verbatim from
 * the EVRA telephony mockup (agentStyle / statusStyle / actBtn). These produce
 * the small chips and 30×30 action buttons used inside `render` callbacks so the
 * table matches the mockup pixel-for-pixel.
 */

import { type CSSProperties, type ReactNode } from 'react'

type Tone = [bg: string, border: string, color: string]

const AGENT_TONES: Record<string, Tone> = {
  seeker: ['rgba(55,166,96,0.14)', 'rgba(55,166,96,0.35)', '#60BC84'],
  grace: ['rgba(109,194,255,0.14)', 'rgba(109,194,255,0.35)', '#9DD4FF'],
  unknown: ['rgba(201,154,45,0.14)', 'rgba(201,154,45,0.35)', '#C99A2D'],
}

const STATUS_TONES: Record<string, Tone> = {
  running: ['rgba(55,166,96,0.18)', 'rgba(55,166,96,0.38)', '#60BC84'],
  paused: ['rgba(201,154,45,0.18)', 'rgba(201,154,45,0.38)', '#C99A2D'],
  stopped: ['rgba(224,82,79,0.18)', 'rgba(224,82,79,0.38)', '#F08A88'],
  draft: ['#383838', '#444', '#C8C8C8'],
}

/** Agent chip — seeker green / grace blue / unknown amber (mockup `agentStyle`). */
export function AgentChip({ agent }: { agent: string }) {
  const [bg, border, color] = AGENT_TONES[(agent || '').toLowerCase()] ?? AGENT_TONES.unknown
  return (
    <span
      style={{
        fontSize: 11,
        background: bg,
        border: `1px solid ${border}`,
        color,
        borderRadius: 4,
        padding: '2px 8px',
      }}
    >
      {agent || 'unknown'}
    </span>
  )
}

/**
 * Status chip — running green / paused amber / stopped red / draft grey
 * (mockup `statusStyle`). `auto_paused` renders as an info-blue "Auto-paused".
 */
export function StatusChip({ status, autoPaused }: { status: string; autoPaused?: boolean }) {
  const key = (status || '').toLowerCase()
  const isAutoPaused = !!autoPaused && key === 'paused'
  const tone: Tone = isAutoPaused
    ? ['rgba(109,194,255,0.18)', 'rgba(109,194,255,0.38)', '#9DD4FF']
    : STATUS_TONES[key] ?? STATUS_TONES.draft
  const [bg, border, color] = tone
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: '.05em',
        textTransform: 'uppercase',
        color,
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 4,
        padding: '3px 8px',
      }}
    >
      {isAutoPaused ? 'Auto-paused' : status || 'unknown'}
    </span>
  )
}

const BTN_TONES: Record<string, Tone> = {
  green: ['rgba(55,166,96,0.14)', 'rgba(55,166,96,0.4)', '#60BC84'],
  amber: ['rgba(201,154,45,0.12)', 'rgba(201,154,45,0.35)', '#C99A2D'],
  red: ['rgba(224,82,79,0.12)', 'rgba(224,82,79,0.35)', '#F08A88'],
  neutral: ['#1F1F1F', '#3A3A3A', '#C8C8C8'],
}

/**
 * 30×30 action button (mockup `actBtn`). onClick stops propagation so it never
 * fires the row click.
 */
export function ActionButton({
  icon,
  title,
  onClick,
  variant = 'neutral',
}: {
  icon: ReactNode
  title: string
  onClick: () => void
  variant?: 'green' | 'amber' | 'red' | 'neutral'
}) {
  const [bg, border, color] = BTN_TONES[variant]
  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 6,
    background: bg,
    border: `1px solid ${border}`,
    color,
    fontSize: 15,
    cursor: 'pointer',
    flex: 'none',
  }
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={e => {
        e.stopPropagation()
        onClick()
      }}
      style={style}
    >
      {icon}
    </button>
  )
}

/** Right-aligned action-button group for a sticky Actions cell. */
export function ActionGroup({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
      {children}
    </div>
  )
}
