import type { CampaignReport } from '@/types'

function sum(rows: CampaignReport[], key: keyof CampaignReport) {
  return rows.reduce((a, r) => a + (Number(r[key]) || 0), 0)
}
function pct(n: number, d: number) { return d ? `${((n / d) * 100).toFixed(1)}%` : '—' }
function fmt(n: number) { return n.toLocaleString('en-ZA') }
function rand(n: number) { return `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }

export default function KpiStrip({ reports }: { reports: CampaignReport[] }) {
  const dialed    = sum(reports, 'dialed')
  const connected = sum(reports, 'connected')
  const qualified = sum(reports, 'qualified')
  const voicemail = sum(reports, 'voicemail')
  const nospeech  = sum(reports, 'no_speech')
  const hangup    = sum(reports, 'hangup')
  const callback  = sum(reports, 'callback')
  const spent     = sum(reports, 'total_spent')
  const cpls      = reports.filter(r => r.qualified > 0).map(r => r.cpl)
  const avgCpl    = cpls.length ? cpls.reduce((a, b) => a + b, 0) / cpls.length : 0

  const kpis = [
    { label: 'Dialed',       value: fmt(dialed),       delta: 'Total across campaigns', tone: 'neutral' },
    { label: 'Connected',    value: fmt(connected),     delta: pct(connected, dialed) + ' connect rate', tone: 'positive' },
    { label: 'Qualified',    value: fmt(qualified),     delta: pct(qualified, connected) + ' of connected', tone: 'positive' },
    { label: 'Voicemail',    value: fmt(voicemail),     delta: pct(voicemail, dialed), tone: 'neutral' },
    { label: 'No Speech',    value: fmt(nospeech),      delta: pct(nospeech, dialed), tone: 'negative' },
    { label: 'Hangup',       value: fmt(hangup),        delta: pct(hangup, connected), tone: 'negative' },
    { label: 'Callback',     value: fmt(callback),      delta: pct(callback, connected), tone: 'positive' },
    { label: 'Avg CPL',      value: rand(avgCpl),       delta: 'Cost per lead', tone: 'neutral' },
    { label: 'Total Spent',  value: rand(spent),        delta: 'All campaigns', tone: 'negative' },
  ]

  const tone: Record<string, string> = {
    positive: 'text-emerald-400',
    negative: 'text-red-400',
    neutral:  'text-slate-400',
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-3 mb-5">
      {kpis.map(k => (
        <div key={k.label} className="bg-slate-800/60 border border-white/8 rounded-xl p-3.5 backdrop-blur">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">{k.label}</p>
          <p className="text-xl font-bold text-white leading-none mb-1">{k.value}</p>
          <p className={`text-[11px] ${tone[k.tone]}`}>{k.delta}</p>
        </div>
      ))}
    </div>
  )
}
