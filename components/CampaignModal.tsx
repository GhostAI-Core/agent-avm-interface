'use client'
import { useState } from 'react'

interface Props { onClose: () => void; onCreated: () => void }

export default function CampaignModal({ onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const data = Object.fromEntries(new FormData(e.currentTarget).entries())
    await fetch('/api/campaigns', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) })
    setLoading(false)
    onCreated()
    onClose()
  }

  const S = {
    overlay: {
      position: 'fixed' as const, inset: 0,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 500, padding: '1rem',
    },
    modal: {
      width: '100%', maxWidth: 520,
      borderRadius: 16, padding: '1.75rem',
      maxHeight: '90vh', overflowY: 'auto' as const,
    },
    header: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      marginBottom: '1.5rem',
    },
    label: { display: 'block', marginBottom: '0.45rem', fontSize: '0.85rem', color: '#94a3b8' },
    row: { display: 'flex', gap: '1rem' },
    group: { marginBottom: '1.1rem', flex: 1, minWidth: 0 },
    actions: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' },
  }

  return (
    <div style={S.overlay}>
      <div className="glass modal-enter" style={S.modal}>
        <div style={S.header}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Create New Campaign</h2>
          <button onClick={onClose} style={{ background: 'none', color: '#94a3b8', fontSize: '1.5rem', lineHeight: 1 }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={S.row}>
            <div style={{ ...S.group, flex: 2 }}>
              <label style={S.label}>Campaign Name</label>
              <input name="name" required placeholder="e.g. 1Life BMI AI V5.0" />
            </div>
            <div style={S.group}>
              <label style={S.label}>Agent</label>
              <select name="agent" required>
                <option value="">— Select —</option>
                <option value="seeker">Seeker</option>
                <option value="grace">Grace</option>
                <option value="sangoma">Sangoma</option>
              </select>
            </div>
          </div>
          <div style={S.row}>
            <div style={S.group}>
              <label style={S.label}>Dialing Speed (calls/sec)</label>
              <input name="dialing_speed" type="number" min="1" max="10" defaultValue="1" />
            </div>
            <div style={S.group}>
              <label style={S.label}>Voice Recording</label>
              <input name="voice_file" type="file" accept="audio/*" />
            </div>
          </div>
          <div style={S.row}>
            <div style={S.group}>
              <label style={S.label}>Time Window Start</label>
              <input name="window_start" type="time" defaultValue="08:00" />
            </div>
            <div style={S.group}>
              <label style={S.label}>Time Window End</label>
              <input name="window_end" type="time" defaultValue="20:00" />
            </div>
          </div>
          <div style={S.actions}>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating…' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
