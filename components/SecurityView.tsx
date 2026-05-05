'use client'
import type { CampaignReport } from '@/types'

interface SecurityViewProps {
  securityLogs: any[]
  C: any
  glass: any
}

export default function SecurityView({ securityLogs, C, glass }: SecurityViewProps) {
  return (
    <div style={{ ...glass, borderRadius: 12, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 800 }}>
        <thead>
          <tr>
            {['Event', 'Agent', 'IP Address', 'Details', 'Timestamp'].map(h => (
              <th key={h} style={{ padding: '0.85rem 1.1rem', borderBottom: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.2)', fontWeight: 600, color: C.muted, fontSize: '0.7rem', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {securityLogs.map(log => (
            <tr key={log.id} style={{ borderBottom: `1px solid ${C.border}` }}>
              <td style={{ padding: '0.85rem 1.1rem', fontSize: '0.82rem' }}>
                <span style={{
                  padding: '0.2rem 0.5rem',
                  borderRadius: 4,
                  background: log.event_type === 'unauthorized_access' ? 'rgba(239,68,68,0.1)' : (log.event_type === 'login' ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)'),
                  color: log.event_type === 'unauthorized_access' ? C.danger : (log.event_type === 'login' ? C.success : C.accent),
                  fontWeight: 700,
                  fontSize: '0.65rem'
                }}>
                  {log.event_type.replace('_', ' ').toUpperCase()}
                </span>
              </td>
              <td style={{ padding: '0.85rem 1.1rem', fontSize: '0.82rem' }}>{log.agent_name}</td>
              <td style={{ padding: '0.85rem 1.1rem', fontSize: '0.82rem', color: C.muted }}>{log.ip_address}</td>
              <td style={{ padding: '0.85rem 1.1rem', fontSize: '0.82rem' }}>{log.details}</td>
              <td style={{ padding: '0.85rem 1.1rem', fontSize: '0.82rem', color: C.muted }}>{new Date(log.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
