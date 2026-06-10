'use client'
import { Doughnut, Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler,
} from 'chart.js'
import { chartUi, chartColors, barChartOptions, doughnutChartOptions } from '@/lib/chartTheme'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler)

const PALETTE = [
  chartColors.connected, chartColors.qualified, chartColors.voicemail, chartColors.cpl,
  chartColors.dnq, chartColors.ni, chartColors.hangup, chartColors.noSpeech,
]

const GRID = { color: chartUi.grid }
const TICK = { color: chartUi.axis, font: { size: 10 } }

/** Vertical or horizontal bar — used for rankings, distributions, comparisons. */
export function BarChart({ labels, data, horizontal = false, color }: {
  labels: string[]; data: number[]; horizontal?: boolean; color?: string
}) {
  return (
    <Bar
      data={{
        labels,
        datasets: [{
          data,
          backgroundColor: color ?? labels.map((_, i) => PALETTE[i % PALETTE.length]),
          borderRadius: 4,
          maxBarThickness: 34,
        }],
      }}
      options={barChartOptions({
        indexAxis: horizontal ? 'y' : 'x',
        plugins: { legend: { display: false } },
        scales: { x: { ticks: TICK, grid: GRID }, y: { ticks: TICK, grid: GRID } },
      })}
    />
  )
}

/** Time-series line — used for trends over days. */
export function LineChart({ labels, data, label, color = chartColors.qualified }: {
  labels: string[]; data: number[]; label?: string; color?: string
}) {
  return (
    <Line
      data={{
        labels,
        datasets: [{
          label,
          data,
          borderColor: color,
          backgroundColor: 'rgba(91,232,190,0.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 2,
          borderWidth: 2,
        }],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { ticks: TICK, grid: GRID }, y: { ticks: TICK, grid: GRID } },
      }}
    />
  )
}

const SPARK_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
  elements: { point: { radius: 0 } },
} as const

/** Tiny inline line — KPI movement at a glance. */
export function Sparkline({ data, color = chartColors.qualified }: { data: number[]; color?: string }) {
  return (
    <Line
      data={{ labels: data.map((_, i) => i), datasets: [{ data, borderColor: color, backgroundColor: 'rgba(91,232,190,0.14)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 0 }] }}
      options={SPARK_OPTS}
    />
  )
}

/** Tiny inline bars — KPI movement for count metrics. */
export function MiniBars({ data, color = chartColors.connected }: { data: number[]; color?: string }) {
  return (
    <Bar
      data={{ labels: data.map((_, i) => i), datasets: [{ data, backgroundColor: color, borderRadius: 1, categoryPercentage: 0.92, barPercentage: 0.9 }] }}
      options={SPARK_OPTS}
    />
  )
}

/** Donut — used for categorical share (status, agent split). */
export function DonutChart({ labels, data, colors }: {
  labels: string[]; data: number[]; colors?: string[]
}) {
  return (
    <Doughnut
      data={{
        labels,
        datasets: [{
          data,
          backgroundColor: colors ?? labels.map((_, i) => PALETTE[i % PALETTE.length]),
          borderWidth: 0,
        }],
      }}
      options={doughnutChartOptions({ cutout: '62%', plugins: { legend: { position: 'right', labels: { color: chartUi.text, font: { size: 10 }, boxWidth: 10 } } } })}
    />
  )
}
