'use client'
import { stsDashboardMock as d } from '@/data/sts-dashboard.mock'

const C = {
  glass:   'rgba(30,41,59,0.75)',
  border:  'rgba(255,255,255,0.10)',
  accent:  '#3b82f6',
  success: '#10b981',
  warn:    '#f59e0b',
  danger:  '#ef4444',
  muted:   '#94a3b8',
  text:    '#f8fafc',
}

const glass = {
  background: C.glass,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: `1px solid ${C.border}`,
  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
}

function fmt(n: number) {
  return n.toLocaleString()
}

function MetricCard({ title, value, sub, valueColor }: { title: string; value: string; sub: string; valueColor?: string }) {
  return (
    <div style={{ ...glass, borderRadius: 12, padding: '1.25rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <p style={{ fontSize: '0.72rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</p>
      <p style={{ fontSize: '1.7rem', fontWeight: 800, color: valueColor ?? C.text, lineHeight: 1.1 }}>{value}</p>
      <p style={{ fontSize: '0.75rem', color: C.muted }}>{sub}</p>
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE:               C.success,
  CANCELLED:            C.danger,
  EXPIRED:              '#f59e0b',
  BILLING_FAILED:       '#ef4444',
  INSUFFICIENT_FUNDS:   '#f97316',
  PENDING_ACTIVATION:   C.accent,
  BLOCKED:              '#a855f7',
  LOCKED:               C.muted,
}

export default function STSDashboard() {
  const { totals, revenue, statusBreakdown, dailyMovement, sevenDayTrend, lastRefreshed } = d

  const changeColor = totals.subscriberChange >= 0 ? C.success : C.danger
  const changePrefix = totals.subscriberChange >= 0 ? '+' : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.25rem' }}>STS Subscription Dashboard</h2>
        <p style={{ fontSize: '0.85rem', color: C.muted }}>Daily overview of subscriber activity, revenue, and churn.</p>
        <p style={{ fontSize: '0.75rem', color: C.muted, marginTop: '0.25rem' }}>
          <span style={{ opacity: 0.6 }}>Last refreshed:</span> {lastRefreshed}
        </p>
      </div>

      {/* User metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
        <MetricCard
          title="Total Users"
          value={fmt(totals.totalUsers)}
          sub="All known STS subscribers."
        />
        <MetricCard
          title="Active Users"
          value={fmt(totals.activeUsers)}
          sub="Users currently active on the service."
          valueColor={C.success}
        />
        <MetricCard
          title="Inactive Users"
          value={fmt(totals.inactiveUsers)}
          sub="Cancelled, expired, blocked, or billing-failed users."
          valueColor={C.muted}
        />
        <MetricCard
          title="Subscriber Change"
          value={`${changePrefix}${fmt(totals.subscriberChange)}`}
          sub="Active users compared to yesterday."
          valueColor={changeColor}
        />
      </div>

      {/* Revenue metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
        <MetricCard
          title="Daily Revenue"
          value={`R${fmt(revenue.dailyRevenue)}`}
          sub="Estimated revenue from today's active users."
          valueColor={C.success}
        />
        <MetricCard
          title="Monthly Run Rate"
          value={`R${fmt(revenue.monthlyRunRate)}`}
          sub="Estimated 30-day revenue at current active user level."
          valueColor={C.success}
        />
        <MetricCard
          title="Lost Daily Revenue"
          value={`R${fmt(revenue.lostDailyRevenue)}`}
          sub="Estimated daily revenue lost from cancellations today."
          valueColor={C.danger}
        />
        <MetricCard
          title="Billing Risk"
          value={`${fmt(revenue.billingRiskUsers)} users`}
          sub="Users with failed billing or insufficient funds."
          valueColor={C.warn}
        />
      </div>

      {/* Status breakdown + Daily movement */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>

        {/* Status breakdown */}
        <div style={{ ...glass, borderRadius: 12, padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>Status Breakdown</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr>
                {['Status', 'Users', '%'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Status' ? 'left' : 'right', padding: '0.45rem 0.6rem', borderBottom: `1px solid ${C.border}`, color: C.muted, fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {statusBreakdown.map(row => (
                <tr key={row.status}>
                  <td style={{ padding: '0.55rem 0.6rem', borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <span style={{ color: STATUS_COLORS[row.status] ?? C.text, fontWeight: 600, fontSize: '0.75rem' }}>{row.status}</span>
                      <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${row.percentage}%`, background: STATUS_COLORS[row.status] ?? C.accent, borderRadius: 4 }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right', borderBottom: `1px solid rgba(255,255,255,0.04)` }}>{fmt(row.users)}</td>
                  <td style={{ padding: '0.55rem 0.6rem', textAlign: 'right', color: C.muted, borderBottom: `1px solid rgba(255,255,255,0.04)` }}>{row.percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Daily movement */}
        <div style={{ ...glass, borderRadius: 12, padding: '1.25rem' }}>
          <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>Daily Movement</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {dailyMovement.map(row => {
              const isNet = row.label === 'Net Active Change'
              const netColor = row.value >= 0 ? C.success : C.danger
              return (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', borderRadius: 8, background: 'rgba(255,255,255,0.03)' }}>
                  <span style={{ fontSize: '0.83rem', color: isNet ? C.text : C.muted }}>{row.label}</span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: isNet ? netColor : C.text }}>
                    {isNet && row.value > 0 ? '+' : ''}{fmt(row.value)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 7-day trend */}
      <div style={{ ...glass, borderRadius: 12, padding: '1.25rem' }}>
        <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>7-Day Trend</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 420 }}>
            <thead>
              <tr>
                {['Date', 'Active Users', 'Daily Revenue'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Date' ? 'left' : 'right', padding: '0.5rem 0.75rem', borderBottom: `1px solid ${C.border}`, color: C.muted, fontWeight: 600, fontSize: '0.72rem', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sevenDayTrend.map((row, i) => {
                const isToday = i === sevenDayTrend.length - 1
                return (
                  <tr key={row.date} style={{ background: isToday ? 'rgba(59,130,246,0.06)' : 'transparent' }}>
                    <td style={{ padding: '0.65rem 0.75rem', borderBottom: `1px solid rgba(255,255,255,0.04)`, fontWeight: isToday ? 700 : 400, color: isToday ? C.text : C.muted }}>
                      {row.date}{isToday ? ' (today)' : ''}
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', borderBottom: `1px solid rgba(255,255,255,0.04)`, color: C.success }}>{fmt(row.activeUsers)}</td>
                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', borderBottom: `1px solid rgba(255,255,255,0.04)` }}>R{fmt(row.dailyRevenue)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
