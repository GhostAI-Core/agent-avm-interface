import type { CampaignReport } from '@/types'

function sum(rows: CampaignReport[], key: keyof CampaignReport) {
  return rows.reduce((a, r) => a + (Number(r[key]) || 0), 0)
}
function pct(n: number, d: number) { return d ? `${((n / d) * 100).toFixed(1)}%` : '—' }
function fmtN(n: number) { return n.toLocaleString('en-ZA') }
function fmtR(n: number) { return `R${n.toLocaleString('en-ZA', { minimumFractionDigits:2, maximumFractionDigits:2 })}` }

const glass = { background:'rgba(30,41,59,0.75)', backdropFilter:'blur(14px)', WebkitBackdropFilter:'blur(14px)', border:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 8px 32px rgba(0,0,0,0.3)' }

const DELTA_COLOR = { pos:'#10b981', neg:'#ef4444', neu:'#94a3b8' }

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
  const avgCpl    = cpls.length ? cpls.reduce((a,b) => a+b, 0) / cpls.length : 0

  const kpis: { label: string; value: string; delta: string; tone: keyof typeof DELTA_COLOR }[] = [
    { label:'Dialed',      value:fmtN(dialed),    delta:'Total across campaigns',            tone:'neu' },
    { label:'Connected',   value:fmtN(connected), delta:pct(connected,dialed)+' connect',    tone:'pos' },
    { label:'Qualified',   value:fmtN(qualified), delta:pct(qualified,connected)+' of conn', tone:'pos' },
    { label:'Voicemail',   value:fmtN(voicemail), delta:pct(voicemail,dialed),               tone:'neu' },
    { label:'Avg Duration', value:'1:12',         delta:'Benchmark: 1:00',                   tone:'pos' },
    { label:'Hangup',      value:fmtN(hangup),    delta:pct(hangup,connected),               tone:'neg' },
    { label:'Callback',    value:fmtN(callback),  delta:pct(callback,connected),             tone:'pos' },
    { label:'Avg CPL',     value:fmtR(avgCpl),    delta:'Cost per lead',                     tone:'neu' },
    { label:'Total Spent', value:fmtR(spent),     delta:'All campaigns',                     tone:'neg' },
  ]

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(168px,1fr))', gap:'1rem', marginBottom:'1.5rem' }}>
      {kpis.map(k => (
        <div key={k.label} style={{ ...glass, borderRadius:12, padding:'1.1rem 1.25rem' }}>
          <p style={{ fontSize:'0.7rem', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.35rem' }}>{k.label}</p>
          <p style={{ fontSize:'1.85rem', fontWeight:700, letterSpacing:'-1px', lineHeight:1.1 }}>{k.value}</p>
          <p style={{ fontSize:'0.72rem', marginTop:'0.3rem', color: DELTA_COLOR[k.tone] }}>{k.delta}</p>
        </div>
      ))}
    </div>
  )
}
