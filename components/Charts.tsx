'use client'
import type { ReactNode } from 'react'
import { Doughnut, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler,
} from 'chart.js'
import type { CampaignReport } from '@/types'
import {
  barGlow,
  barChartOptions,
  brighterStroke,
  chartColors,
  chartGlow,
  chartGradients,
  chartPanelLift,
  chartUi,
  doughnutChartOptions,
  funnelColors,
  funnelGlowIndices,
  gradientFill,
  outcomeDonutColors,
} from '@/lib/chartTheme'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler)

function sum(rows: CampaignReport[], key: keyof CampaignReport) {
  return rows.reduce((a, r) => a + (Number(r[key]) || 0), 0)
}

function ChartPlot({ children }: { children: ReactNode }) {
  return (
    <div style={{ ...chartPanelLift, height: '100%', padding: '4px 2px' }}>
      {children}
    </div>
  )
}

export function OutcomeDonut({ reports }: { reports: CampaignReport[] }) {
  const fills = [...outcomeDonutColors]
  const data = {
    labels: ['Connected','Voicemail','No Speech','Hangup','NI','DNQ','Callback','NA+Busy+Failed'],
    datasets: [{
      data: [
        sum(reports,'connected'), sum(reports,'voicemail'), sum(reports,'no_speech'),
        sum(reports,'hangup'), sum(reports,'ni'), sum(reports,'dnq'), sum(reports,'callback'),
        sum(reports,'no_answer') + sum(reports,'busy_line') + sum(reports,'failed'),
      ],
      backgroundColor: fills,
      borderColor: fills.map(c => brighterStroke(c)),
      borderWidth: 1,
      hoverBorderWidth: 2,
    }],
  }
  return (
    <ChartPlot>
      <Doughnut
        data={data}
        options={doughnutChartOptions({
          plugins: { legend: { position: 'right' } },
        })}
      />
    </ChartPlot>
  )
}

export function CampaignBar({ reports }: { reports: CampaignReport[] }) {
  const labels = reports.map(r => r.campaign?.name?.substring(0, 14) + '…')
  const { connected: connGrad, qualified: qualGrad } = chartGradients
  return (
    <ChartPlot>
      <Bar
        data={{
          labels,
          datasets: [
            {
              label: 'Connected',
              data: reports.map(r => r.connected),
              backgroundColor: gradientFill(connGrad.top, connGrad.bottom),
              borderRadius: 3,
              ...barGlow(chartGlow.connected),
            },
            {
              label: 'Qualified',
              data: reports.map(r => r.qualified * 100),
              backgroundColor: gradientFill(qualGrad.top, qualGrad.bottom),
              borderRadius: 3,
              ...barGlow(chartGlow.qualified),
            },
          ],
        }}
        options={barChartOptions()}
      />
    </ChartPlot>
  )
}

export function SpendChart({ reports }: { reports: CampaignReport[] }) {
  const labels = reports.map(r => r.campaign?.name?.substring(0, 12) + '…')
  const spentMuted = '#B87878'
  return (
    <ChartPlot>
      <Bar
        data={{
          labels,
          datasets: [
            {
              label: 'Spent (R)',
              data: reports.map(r => r.total_spent),
              backgroundColor: chartColors.spent + 'CC',
              borderRadius: 3,
              yAxisID: 'y',
              ...barGlow(chartGlow.spent, 8),
            },
            {
              label: 'CPL (R)',
              data: reports.map(r => r.cpl),
              backgroundColor: chartColors.cpl + 'CC',
              borderRadius: 3,
              type: 'bar' as const,
              yAxisID: 'y1',
              ...barGlow(chartGlow.cpl, 8),
            },
          ],
        }}
        options={barChartOptions({
          scales: {
            x:  { ticks: { color: chartUi.axis, font: { size: 10 } }, grid: { color: chartUi.grid } },
            y:  { ticks: { color: spentMuted, font: { size: 10 } }, grid: { color: chartUi.grid }, position: 'left' },
            y1: { ticks: { color: chartColors.cpl, font: { size: 10 } }, grid: { display: false }, position: 'right' },
          },
        })}
      />
    </ChartPlot>
  )
}

export function FunnelChart({ reports }: { reports: CampaignReport[] }) {
  const vals = [
    sum(reports,'dialed'), sum(reports,'connected'), sum(reports,'voicemail'),
    sum(reports,'no_speech'), sum(reports,'hangup'), sum(reports,'qualified'),
  ]
  const fills = [...funnelColors]
  const glowForIndex = (i: number) => {
    if (i === 0) return chartGlow.connected
    if (i === 5) return chartGlow.qualified
    return 'transparent'
  }
  return (
    <ChartPlot>
      <Bar
        data={{
          labels: ['Dialed','Connected','Voicemail','No Speech','Hangup','Qualified'],
          datasets: [{
            data: vals,
            backgroundColor: fills,
            borderRadius: 4,
            maxBarThickness: 36,
          }],
        }}
        options={barChartOptions({
          plugins: { legend: { display: false } },
          datasets: { bar: { maxBarThickness: 36 } },
          elements: {
            bar: {
              shadowBlur: (ctx: { dataIndex: number }) => (funnelGlowIndices.has(ctx.dataIndex) ? 10 : 0),
              shadowColor: (ctx: { dataIndex: number }) => glowForIndex(ctx.dataIndex),
              shadowOffsetX: 0,
              shadowOffsetY: 0,
            } as object,
          },
        })}
      />
    </ChartPlot>
  )
}
