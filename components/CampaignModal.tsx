'use client'
import { useState } from 'react'

const glass = { background:'rgba(30,41,59,0.9)', backdropFilter:'blur(14px)', WebkitBackdropFilter:'blur(14px)', border:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 8px 32px rgba(0,0,0,0.5)' }
const C = {
  muted:   '#94a3b8',
  accent:  '#3b82f6',
}
const inputStyle: React.CSSProperties = { width:'100%', padding:'0.65rem 0.9rem', background:'rgba(0,0,0,0.25)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'white', fontFamily:'inherit', fontSize:'0.875rem', outline:'none' }

interface Props { onClose: () => void; onCreated: () => void }

export default function CampaignModal({ onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const payload: any = Object.fromEntries(formData.entries())

    // Parse CSV
    const csvFile = formData.get('csv_file') as File
    if (csvFile && csvFile.size > 0) {
      const text = await csvFile.text()
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim())
      const contacts = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim())
        const contact: any = {}
        headers.forEach((h, i) => {
          if (h === 'phone') contact.phone = values[i]
          if (h === 'first_name') contact.first_name = values[i]
          if (h === 'last_name') contact.last_name = values[i]
        })
        return contact
      }).filter(c => c.phone)
      payload.contacts = contacts
    }

    await fetch('/api/campaigns', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
    setLoading(false)
    onCreated()
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', display:'flex', justifyContent:'center', alignItems:'center', zIndex:500, padding:'1rem' }}>
      <div style={{ ...glass, width:'100%', maxWidth:520, borderRadius:16, padding:'1.75rem', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
          <h2 style={{ fontSize:'1.1rem', fontWeight:700 }}>Create New Campaign</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#94a3b8', fontSize:'1.5rem', lineHeight:1, cursor:'pointer' }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display:'flex', gap:'1rem', marginBottom:'1.1rem' }}>
            <div style={{ flex:2 }}>
              <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.85rem', color:'#94a3b8' }}>Campaign Name</label>
              <input name="name" required placeholder="e.g. 1Life BMI AI V5.0" style={inputStyle} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.85rem', color:'#94a3b8' }}>Agent</label>
              <select name="agent" required style={inputStyle}>
                <option value="">— Select —</option>
                <option value="seeker">Seeker</option>
                <option value="grace">Grace</option>
                <option value="sangoma">Sangoma</option>
              </select>
            </div>
          </div>
          <div style={{ display:'flex', gap:'1rem', marginBottom:'1.1rem' }}>
            <div style={{ flex:1 }}>
              <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.85rem', color:'#94a3b8' }}>Dialing Speed (calls/sec)</label>
              <input name="dialing_speed" type="number" min="1" max="10" defaultValue="1" style={inputStyle} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.85rem', color:'#94a3b8' }}>Voice Recording</label>
              <input name="voice_file" type="file" accept="audio/*" style={{ ...inputStyle, color:'#94a3b8', padding:'0.45rem 0.9rem' }} />
            </div>
          </div>
          <div style={{ display:'flex', gap:'1rem', marginBottom:'1.1rem' }}>
            <div style={{ flex:1 }}>
              <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.85rem', color:'#94a3b8' }}>Time Window Start</label>
              <input name="window_start" type="time" defaultValue="08:00" style={{ ...inputStyle, colorScheme:'dark' } as React.CSSProperties} />
            </div>
            <div style={{ flex:1 }}>
              <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.85rem', color:'#94a3b8' }}>Time Window End</label>
              <input name="window_end" type="time" defaultValue="20:00" style={{ ...inputStyle, colorScheme:'dark' } as React.CSSProperties} />
            </div>
          </div>
          <div style={{ marginBottom:'1.1rem' }}>
            <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.85rem', color:'#94a3b8' }}>Contact List (CSV)</label>
            <div style={{ ...inputStyle, padding:0, overflow:'hidden', display:'flex', alignItems:'center' }}>
               <input 
                 name="csv_file" 
                 type="file" 
                 accept=".csv" 
                 required
                 style={{ width:'100%', padding:'0.65rem 0.9rem', background:'transparent', border:'none', color:'white', cursor:'pointer' }} 
               />
            </div>
            <p style={{ fontSize:'0.65rem', color:C.muted, marginTop:'0.4rem' }}>Expected columns: phone, first_name, last_name</p>
          </div>

          <div style={{ padding:'1rem', background:'rgba(59,130,246,0.05)', borderRadius:12, border:`1px solid rgba(59,130,246,0.2)`, marginBottom:'1.1rem' }}>
            <h3 style={{ fontSize:'0.85rem', fontWeight:700, marginBottom:'0.75rem', color:'#3b82f6' }}>Hotkey Call Transfer</h3>
            <div style={{ display:'flex', gap:'1rem', marginBottom:'0.75rem' }}>
              <div style={{ flex:1 }}>
                <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.75rem', color:'#94a3b8' }}>Transfer Key (DTMF)</label>
                <select name="transfer_key" style={inputStyle}>
                  <option value="1">Press 1</option>
                  <option value="2">Press 2</option>
                  <option value="3">Press 3</option>
                </select>
              </div>
              <div style={{ flex:2 }}>
                <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.75rem', color:'#94a3b8' }}>Transfer Target (SIP/Phone)</label>
                <input name="transfer_target" placeholder="e.g. +27..." style={inputStyle} />
              </div>
            </div>
            <p style={{ fontSize:'0.65rem', color:C.muted }}>Lead will be transferred to this target when the hotkey is pressed.</p>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem', marginTop:'1.5rem' }}>
            <button type="button" onClick={onClose} style={{ background:'transparent', color:'white', border:'1px solid rgba(255,255,255,0.1)', padding:'0.65rem 1.2rem', borderRadius:8, cursor:'pointer', fontFamily:'inherit', fontSize:'0.875rem' }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ background:'#3b82f6', color:'white', border:'none', padding:'0.65rem 1.4rem', borderRadius:8, fontWeight:600, fontSize:'0.875rem', cursor:'pointer', fontFamily:'inherit', opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Creating…' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
