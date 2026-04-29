'use client'
import { Doughnut, Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler,
} from 'chart.js'
import type { CampaignReport } from '@/types'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler)

const GRID   = { color: 'rgba(255,255,255,0.05)' }
const TICK   = { color: '#64748b', font: { size: 10 } }
const LEGEND = { display: true as const, labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10 } }

function sum(rows: CampaignReport[], key: keyof CampaignReport) {
  return rows.reduce((a, r) => a + (Number(r[key]) || 0), 0)
}

export function OutcomeDonut({ reports }: { reports: CampaignReport[] }) {
  const data = {
    labels: ['Connected','Voicemail','No Speech','Hangup','NI','DNQ','Callback','NA+Busy+Failed'],
    datasets: [{
      data: [
        sum(reports,'connected'), sum(reports,'voicemail'), sum(reports,'no_speech'),
        sum(reports,'hangup'), sum(reports,'ni'), sum(reports,'dnq'), sum(reports,'callback'),
        sum(reports,'no_answer') + sum(reports,'busy_line') + sum(reports,'failed'),
      ],
      backgroundColor: ['#10b981','#f59e0b','#94a3b8','#ef4444','#a855f7','#6366f1','#3b82f6','#1e293b'],
      borderWidth: 0,
    }],
  }
  return <Doughnut data={data} options={{ plugins: { legend: { ...LEGEND, position: 'right' } } }} />
}

export function CampaignBar({ reports }: { reports: CampaignReport[] }) {
  const labels = reports.map(r => r.campaign?.name?.substring(0, 14) + '…')
  const agentColor: Record<string, string> = { seeker:'#3b82f6', grace:'#a855f7', sangoma:'#f97316' }
  return (
    <Bar
      data={{
        labels,
        datasets: [
          { label:'Connected', data: reports.map(r => r.connected), backgroundColor: reports.map(r => agentColor[r.campaign?.agent ?? ''] + 'bb'), borderRadius: 3 },
          { label:'Qualified', data: reports.map(r => r.qualified * 100), backgroundColor: '#10b981bb', borderRadius: 3 },
        ],
      }}
      options={{ plugins: { legend: LEGEND }, scales: { x: { ticks: TICK, grid: GRID }, y: { ticks: TICK, grid: GRID } } }}
    />
  )
}

export function SpendChart({ reports }: { reports: CampaignReport[] }) {
  const labels = reports.map(r => r.campaign?.name?.substring(0, 12) + '…')
  return (
    <Bar
      data={{
        labels,
        datasets: [
          { label:'Spent (R)', data: reports.map(r => r.total_spent), backgroundColor: 'rgba(239,68,68,0.55)', borderRadius: 3, yAxisID: 'y' },
          { label:'CPL (R)',   data: reports.map(r => r.cpl),         backgroundColor: 'rgba(59,130,246,0.8)', borderRadius: 3, type: 'bar' as const, yAxisID: 'y1' },
        ],
      }}
      options={{
        plugins: { legend: LEGEND },
        scales: {
          x:  { ticks: TICK, grid: GRID },
          y:  { ticks: TICK, grid: GRID, position: 'left'  as const },
          y1: { ticks: { ...TICK, color: '#3b82f6' }, grid: { display: false }, position: 'right' as const },
        },
      }}
    />
  )
}

export function FunnelChart({ reports }: { reports: CampaignReport[] }) {
  const vals = [
    sum(reports,'dialed'), sum(reports,'connected'), sum(reports,'voicemail'),
    sum(reports,'no_speech'), sum(reports,'hangup'), sum(reports,'qualified'),
  ]
  return (
    <Bar
      data={{
        labels: ['Dialed','Connected','Voicemail','No Speech','Hangup','Qualified'],
        datasets: [{ data: vals, backgroundColor: ['#3b82f6','#10b981','#f59e0b','#94a3b8','#ef4444','#6366f1'], borderRadius: 4 }],
      }}
      options={{ plugins: { legend: { display: false } }, scales: { x: { ticks: TICK, grid: GRID }, y: { ticks: TICK, grid: GRID } } }}
    />
  )
}
