/** EVRA design tokens — mirror values in app/globals.css */

export const colors = {
  green: '#37A660',
  greenBright: '#60BC84',
  greenDeep: '#1F6F35',
  greenInk: '#0E2014',
  glow: '#5BE8BE',

  bg0: '#1F1F1F',
  bg1: '#292929',
  bg2: '#141414',
  bg3: '#383838',
  bg4: '#5C5C5C',

  fg1: '#FFFFFF',
  fg2: '#C8C8C8',
  fg3: '#909090',
  fg4: '#606060',

  border1: '#1A1A1A',
  border2: '#3A3A3A',
  border3: '#4A4A4A',

  positive: '#37A660',
  negative: '#E0524F',
  warning: '#C99A2D',
  info: '#6DC2FF',
} as const

export const semantic = {
  bg: colors.bg0,
  surface: colors.bg1,
  surfaceDeep: colors.bg2,
  surfaceHover: colors.bg3,
  borderSubtle: colors.border1,
  border: colors.border2,
  text: colors.fg1,
  textMuted: colors.fg2,
  textSoft: colors.fg3,
  textDisabled: colors.fg4,
  accent: colors.green,
  accentBright: colors.greenBright,
  accentDeep: colors.greenDeep,
  accentGlow: colors.glow,
  danger: colors.negative,
  warning: colors.warning,
  info: colors.info,
  positive: colors.positive,
} as const

export const radius = {
  xs: 2,
  sm: 4,
  md: 6,
  lg: 10,
  pill: 999,
} as const

export const fontFamily = {
  display: "'Michroma', 'Eurostile', 'Bahnschrift', system-ui, sans-serif",
  body: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'DM Sans', 'Segoe UI', system-ui, sans-serif",
  mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace",
} as const

export const agentColors = {
  seeker: colors.green,
  grace: colors.greenBright,
  sangoma: colors.warning,
} as const

import { chartUi, outcomeDonutColors } from '@/lib/chartTheme'

/** @deprecated Use `outcomeDonutColors` from `@/lib/chartTheme` */
export const CHART_COLORS = outcomeDonutColors

/** @deprecated Use `chartUi` from `@/lib/chartTheme` */
export const CHART_GRID = chartUi.grid
export const CHART_TICK = chartUi.axis
export const CHART_LEGEND = chartUi.text

export const toneColors = {
  pos: colors.positive,
  neg: colors.negative,
  neu: colors.fg3,
} as const

/** Status chip tones derived from EVRA semantic palette */
export function statusChipTone(status: string): { bg: string; text: string; border: string } {
  const key = (status || '').trim().toLowerCase().replace(/[_-]+/g, ' ')
  const map: Record<string, { bg: string; text: string; border: string }> = {
    running:   { bg: 'rgba(55,166,96,0.18)', text: '#60BC84', border: 'rgba(55,166,96,0.38)' },
    paused:    { bg: 'rgba(201,154,45,0.18)', text: '#E0C078', border: 'rgba(201,154,45,0.38)' },
    'auto paused': { bg: 'rgba(109,194,255,0.18)', text: '#9DD4FF', border: 'rgba(109,194,255,0.38)' },
    stopped:   { bg: 'rgba(144,144,144,0.18)', text: '#C8C8C8', border: 'rgba(144,144,144,0.38)' },
    completed: { bg: 'rgba(144,144,144,0.18)', text: '#C8C8C8', border: 'rgba(144,144,144,0.38)' },
    connected: { bg: 'rgba(55,166,96,0.18)', text: '#60BC84', border: 'rgba(55,166,96,0.38)' },
    qualified: { bg: 'rgba(55,166,96,0.22)', text: '#5BE8BE', border: 'rgba(91,232,190,0.38)' },
    voicemail: { bg: 'rgba(109,194,255,0.18)', text: '#9DD4FF', border: 'rgba(109,194,255,0.38)' },
    'no speech': { bg: 'rgba(144,144,144,0.18)', text: '#C8C8C8', border: 'rgba(144,144,144,0.38)' },
    hangup:    { bg: 'rgba(224,82,79,0.18)', text: '#F08A88', border: 'rgba(224,82,79,0.38)' },
    ni:        { bg: 'rgba(96,188,132,0.14)', text: '#60BC84', border: 'rgba(96,188,132,0.35)' },
    dnq:       { bg: 'rgba(201,154,45,0.18)', text: '#E0C078', border: 'rgba(201,154,45,0.38)' },
    callback:  { bg: 'rgba(109,194,255,0.18)', text: '#9DD4FF', border: 'rgba(109,194,255,0.38)' },
    'no answer': { bg: 'rgba(56,56,56,0.5)', text: '#C8C8C8', border: 'rgba(74,74,74,0.6)' },
    'busy line': { bg: 'rgba(201,154,45,0.14)', text: '#C99A2D', border: 'rgba(201,154,45,0.35)' },
    failed:    { bg: 'rgba(224,82,79,0.18)', text: '#F08A88', border: 'rgba(224,82,79,0.38)' },
  }
  return map[key] ?? { bg: 'rgba(144,144,144,0.18)', text: '#C8C8C8', border: 'rgba(144,144,144,0.38)' }
}

export function agentChipTone(agent: string): { bg: string; text: string; border: string } {
  const key = (agent || '').toLowerCase() as keyof typeof agentColors
  const color = agentColors[key] ?? colors.fg3
  const r = parseInt(color.slice(1, 3), 16)
  const g = parseInt(color.slice(3, 5), 16)
  const b = parseInt(color.slice(5, 7), 16)
  return {
    bg: `rgba(${r},${g},${b},0.16)`,
    text: key === 'seeker' ? '#60BC84' : key === 'grace' ? '#5BE8BE' : '#E0C078',
    border: `rgba(${r},${g},${b},0.35)`,
  }
}
