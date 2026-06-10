/** EVRA chart visual system — centralised palette, glow, and Chart.js helpers */

import type { ChartOptions, ScriptableContext } from 'chart.js'

// ── Chart UI colours ──────────────────────────────────────────────────────────

export const chartUi = {
  bg: '#252525',
  plotBg: '#202020',
  grid: 'rgba(255,255,255,0.06)',
  axis: '#A8A8A8',
  text: '#EDEDED',
  muted: '#7E7E7E',
} as const

// ── Data series colours ───────────────────────────────────────────────────────

export const chartColors = {
  connected: '#47D16A',
  qualified: '#5BE8BE',
  voicemail: '#E0B13F',
  noSpeech: '#A3A3A3',
  hangup: '#F25F5C',
  ni: '#72D6A5',
  dnq: '#67B7FF',
  callback: '#2FAE5F',
  failed: '#4A4A4A',
  naBusyFailed: '#3F3F3F',
  spent: '#C85A5A',
  cpl: '#4FD17B',
  dialed: '#47D16A',
} as const

// ── Glow colours (low opacity) ────────────────────────────────────────────────

export const chartGlow = {
  connected: 'rgba(71, 209, 106, 0.22)',
  qualified: 'rgba(91, 232, 190, 0.20)',
  voicemail: 'rgba(224, 177, 63, 0.18)',
  hangup: 'rgba(242, 95, 92, 0.18)',
  dnq: 'rgba(103, 183, 255, 0.18)',
  spent: 'rgba(200, 90, 90, 0.18)',
  cpl: 'rgba(79, 209, 123, 0.20)',
  neutral: 'rgba(255, 255, 255, 0.08)',
} as const

// ── Gradient stops ────────────────────────────────────────────────────────────

export const chartGradients = {
  connected: { top: '#59E07B', bottom: '#2FAE5F' },
  qualified: { top: '#78F2CB', bottom: '#41C9A0' },
} as const

// ── Per-chart colour mappings ─────────────────────────────────────────────────

/** Call Outcome Breakdown donut — label order matches Charts.tsx */
export const outcomeDonutColors = [
  chartColors.connected,
  chartColors.voicemail,
  chartColors.noSpeech,
  chartColors.hangup,
  chartColors.ni,
  chartColors.dnq,
  chartColors.callback,
  chartColors.naBusyFailed,
] as const

/**
 * Dialling Funnel stages: Dialed, Connected, Voicemail, No Speech, Hangup, Qualified
 * Stage names differ from outcome semantics — colours are mapped per funnel spec.
 */
export const funnelColors = [
  chartColors.dialed,
  chartColors.voicemail,
  chartColors.noSpeech,
  chartColors.hangup,
  chartColors.ni,
  chartColors.qualified,
] as const

/** Funnel indices that receive subtle positive-stage glow */
export const funnelGlowIndices = new Set([0, 5])

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Lighten a hex colour by mixing toward white */
export function brighterStroke(hex: string, mix = 0.22): string {
  const n = hex.replace('#', '')
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  const lr = Math.round(r + (255 - r) * mix)
  const lg = Math.round(g + (255 - g) * mix)
  const lb = Math.round(b + (255 - b) * mix)
  return `rgb(${lr},${lg},${lb})`
}

/** Vertical canvas gradient for bar fills */
export function createBarGradient(
  ctx: CanvasRenderingContext2D,
  chartArea: { top: number; bottom: number },
  topColor: string,
  bottomColor: string,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
  gradient.addColorStop(0, topColor)
  gradient.addColorStop(1, bottomColor)
  return gradient
}

/** Scriptable backgroundColor callback for gradient bars */
export function gradientFill(
  topColor: string,
  bottomColor: string,
): (context: ScriptableContext<'bar'>) => string | CanvasGradient {
  return (context) => {
    const { chart } = context
    const { ctx, chartArea } = chart
    if (!chartArea) return topColor
    return createBarGradient(ctx, chartArea, topColor, bottomColor)
  }
}

/** Soft glow shadow props for bar datasets */
export function barGlow(color: string, blur = 10) {
  return {
    shadowBlur: blur,
    shadowColor: color,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  }
}

const GRID = { color: chartUi.grid }
const TICK = { color: chartUi.axis, font: { size: 10 } }
const LEGEND = {
  display: true as const,
  labels: { color: chartUi.text, font: { size: 10 }, boxWidth: 10 },
}

/** Shared Chart.js options for bar charts */
export function barChartOptions(
  overrides?: Partial<ChartOptions<'bar'>>,
): ChartOptions<'bar'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: LEGEND },
    scales: {
      x: { ticks: TICK, grid: GRID },
      y: { ticks: TICK, grid: GRID },
    },
    ...overrides,
  }
}

/** Shared Chart.js options for doughnut charts */
export function doughnutChartOptions(
  overrides?: Partial<ChartOptions<'doughnut'>>,
): ChartOptions<'doughnut'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: LEGEND },
    ...overrides,
  }
}

export const chartPanelLift = {
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 8px 20px rgba(0,0,0,0.18)',
  borderRadius: '4px',
  background: chartUi.plotBg,
} as const
