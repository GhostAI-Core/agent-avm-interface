'use client'
import { useState } from 'react'

const TIFFANY = '#0ABAB5'

interface CalloutProps {
  top: string | number
  left: string | number
  text: string
  lineDir: 'tl' | 'tr' | 'bl' | 'br'
}

function Callout({ top, left, text, lineDir }: CalloutProps) {
  const isLeft = lineDir.endsWith('l')
  const isTop = lineDir.startsWith('t')
  
  return (
    <div style={{ position: 'absolute', top, left, zIndex: 10, pointerEvents: 'none' }}>
      {/* The Line */}
      <div style={{
        position: 'absolute',
        width: 60,
        height: 60,
        borderLeft: isLeft ? `2px solid ${TIFFANY}` : 'none',
        borderRight: !isLeft ? `2px solid ${TIFFANY}` : 'none',
        borderTop: isTop ? `2px solid ${TIFFANY}` : 'none',
        borderBottom: !isTop ? `2px solid ${TIFFANY}` : 'none',
        transform: `translate(${isLeft ? '0' : '-60px'}, ${isTop ? '0' : '-60px'})`,
        filter: `drop-shadow(0 0 5px ${TIFFANY})`
      }} />
      
      {/* The Label */}
      <div style={{
        position: 'absolute',
        width: 180,
        padding: '0.75rem',
        background: 'rgba(15, 23, 42, 0.95)',
        border: `1px solid ${TIFFANY}`,
        borderRadius: 8,
        color: 'white',
        fontSize: '0.75rem',
        lineHeight: 1.4,
        transform: `translate(${isLeft ? '65px' : '-245px'}, ${isTop ? '65px' : '-135px'})`,
        boxShadow: `0 0 20px rgba(10, 186, 181, 0.2)`
      }}>
        <strong style={{ color: TIFFANY, display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem' }}>EXPLANATION</strong>
        {text}
      </div>
    </div>
  )
}

export default function GuideView({ glass }: { glass: any }) {
  const [step, setStep] = useState(0)

  const steps = [
    {
      title: 'Biometric Gateway',
      image: '/guide/login.png',
      desc: 'The secure entry point using the "Future of Fast" Passkey technology.',
      callouts: [
        { top: '20%', left: '50%', text: 'Corporate Branding: The VAS Inc logo establishes institutional authority.', lineDir: 'tr' },
        { top: '55%', left: '50%', text: 'Biometric Access: One-touch login bypassing traditional insecure passwords.', lineDir: 'bl' }
      ]
    },
    {
      title: 'Strategic Dashboard',
      image: '/guide/dashboard.png',
      desc: 'Real-time analytical hub for campaign performance and spend tracking.',
      callouts: [
        { top: '30%', left: '30%', text: 'Live KPI Strip: Instant visibility into total spend and qualification rates.', lineDir: 'tl' },
        { top: '60%', left: '70%', text: 'Advanced Analytics: Outcome breakdown and campaign comparison charts.', lineDir: 'br' }
      ]
    },
    {
      title: 'Campaign Management',
      image: '/guide/campaigns.png',
      desc: 'Where administrators orchestrate automated voice calling strategies.',
      callouts: [
        { top: '40%', left: '20%', text: 'Control Center: Start, pause, or terminate campaigns with one click.', lineDir: 'tl' },
        { top: '70%', left: '80%', text: 'Agent Selection: Assign specialized AI agents (Seeker, Grace, Sangoma) to your leads.', lineDir: 'br' }
      ]
    }
  ]

  const s = steps[step]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: TIFFANY }}>Platform Training Guide</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>Comprehensive walkthrough of the Agent AVM ecosystem.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {steps.map((_, i) => (
            <button 
              key={i} 
              onClick={() => setStep(i)}
              style={{
                width: 40, height: 40, borderRadius: '50%', border: `1px solid ${step === i ? TIFFANY : 'rgba(255,255,255,0.1)'}`,
                background: step === i ? 'rgba(10, 186, 181, 0.1)' : 'transparent',
                color: step === i ? TIFFANY : '#94a3b8',
                cursor: 'pointer', fontWeight: 700
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div style={{ ...glass, borderRadius: 24, padding: '1rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: 16, overflow: 'hidden' }}>
          {/* Base Image */}
          <img 
            src={s.image} 
            alt={s.title} 
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} 
          />
          
          {/* Tiffany Annotations */}
          {s.callouts.map((c, i) => (
            <Callout key={i} {...c} />
          ))}
        </div>
        
        <div style={{ padding: '1.5rem', textAlign: 'center' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>{s.title}</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', maxWidth: 600, margin: '0 auto' }}>{s.desc}</p>
        </div>
      </div>

      <div style={{ ...glass, padding: '1.5rem', borderRadius: 16 }}>
        <h4 style={{ color: TIFFANY, fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1rem' }}>Pro Tips for Administrators</h4>
        <ul style={{ color: '#94a3b8', fontSize: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', listStyle: 'none', padding: 0 }}>
          <li>🔹 <strong>Always use Passkeys:</strong> They are phishing-proof and 10x faster than typing passwords.</li>
          <li>🔹 <strong>Monitor Live Streams:</strong> The Dashboard updates in real-time as the Dialing Engine runs.</li>
          <li>🔹 <strong>Audit Regularly:</strong> Check the Security tab daily to monitor access from unverified IPs.</li>
          <li>🔹 <strong>Gateway Priority:</strong> Vonage is recommended for high-volume SA mobile networks.</li>
        </ul>
      </div>
    </div>
  )
}
