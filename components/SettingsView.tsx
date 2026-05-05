'use client'
import { useState } from 'react'

interface SettingsViewProps {
  role: 'admin' | 'engineer'
  providers: any[]
  setProviders: (p: any[]) => void
  C: any
  glass: any
  inputStyle: any
}

export default function SettingsView({ role, providers, setProviders, C, glass, inputStyle }: SettingsViewProps) {
  const [newProv, setNewProv] = useState({ name: '', key: '', secret: '' })
  const [loading, setLoading] = useState(false)

  const handleAddProvider = async () => {
    if (!newProv.name) return
    setLoading(true)
    try {
      const res = await fetch('/api/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProv.name,
          api_key: newProv.key,
          api_secret: newProv.secret
        })
      })
      const data = await res.json()
      if (data.provider) {
        setProviders([data.provider, ...providers])
        setNewProv({ name: '', key: '', secret: '' })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      {role !== 'admin' && (
        <div style={{ padding: '1rem', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, marginBottom: '1.5rem', color: '#f59e0b', fontSize: '0.85rem' }}>
          ⚠️ Only administrators can modify VoIP provider configurations and global throttling limits.
        </div>
      )}

      <div style={{ ...glass, borderRadius: 16, padding: '2rem', marginBottom: '2rem', opacity: role === 'admin' ? 1 : 0.6, pointerEvents: role === 'admin' ? 'auto' : 'none' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>Platform Environment</h3>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button style={{ flex: 1, padding: '1rem', borderRadius: 12, border: `1px solid ${C.accent}`, background: 'rgba(59,130,246,0.1)', color: 'white', fontWeight: 600 }}>Staging Environment</button>
          <button style={{ flex: 1, padding: '1rem', borderRadius: 12, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontWeight: 600 }}>Production Environment</button>
        </div>
      </div>

      <div style={{ ...glass, borderRadius: 16, padding: '2rem', marginBottom: '2rem', opacity: role === 'admin' ? 1 : 0.6, pointerEvents: role === 'admin' ? 'auto' : 'none' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>VoIP Provider Integration</h3>
        
        {/* Add New Provider Form */}
        <div style={{ padding: '1.5rem', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px dashed ${C.border}`, marginBottom: '2rem' }}>
          <h4 style={{ fontSize: '0.9rem', color: C.muted, marginBottom: '1rem', fontWeight: 600 }}>ADD NEW GATEWAY</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <input 
              placeholder="Provider Name (e.g. Twilio Production)" 
              style={inputStyle} 
              value={newProv.name} 
              onChange={e => setNewProv({ ...newProv, name: e.target.value })} 
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <input 
                type="password" 
                placeholder="API Key / SID" 
                style={inputStyle} 
                value={newProv.key} 
                onChange={e => setNewProv({ ...newProv, key: e.target.value })} 
              />
              <input 
                type="password" 
                placeholder="API Secret / Token" 
                style={inputStyle} 
                value={newProv.secret} 
                onChange={e => setNewProv({ ...newProv, secret: e.target.value })} 
              />
            </div>
            <button 
              onClick={handleAddProvider}
              disabled={loading || !newProv.name}
              style={{ background: C.accent, color: 'white', border: 'none', padding: '0.8rem', borderRadius: 8, fontWeight: 700, cursor: 'pointer', opacity: (loading || !newProv.name) ? 0.6 : 1 }}
            >
              {loading ? 'Linking Gateway...' : 'Link Provider Account'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {providers.map(p => (
            <div key={p.id} style={{ padding: '1.25rem', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 style={{ fontWeight: 700 }}>{p.name}</h4>
                <span style={{ fontSize: '0.7rem', background: 'rgba(16,185,129,0.1)', color: C.success, padding: '0.2rem 0.6rem', borderRadius: 4 }}>ACTIVE</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: '0.4rem' }}>API Key</label>
                  <input type="password" value={p.api_key} readOnly style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: '0.4rem' }}>API Secret</label>
                  <input type="password" value={p.api_secret} readOnly style={inputStyle} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
