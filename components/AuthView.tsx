'use client'
import { useState, useEffect } from 'react'
import Webcam from 'react-webcam'
import { createClient } from '@/utils/supabase/client'

interface AuthViewProps {
  onAuth: (auth: boolean, role: 'admin' | 'engineer') => void
  C: any
  glass: any
  inputStyle: any
  mounted: boolean
  isSecure: boolean
}

const bufferToBase64 = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)))

export default function AuthView({ onAuth, C, glass, inputStyle, mounted, isSecure }: AuthViewProps) {
  const [authMode, setAuthMode] = useState<'passkey' | 'password'>('passkey')
  const [authStep, setAuthStep] = useState<'login' | '2fa' | 'signup'>('login')
  const [role, setRole] = useState<'admin' | 'engineer'>('admin')
  const [isScanning, setIsScanning] = useState(false)
  const [scanStep, setScanStep] = useState(0)
  const [showFaceReg, setShowFaceReg] = useState(false)
  const [regStep, setRegStep] = useState(0)
  const [loginData, setLoginData] = useState({ user: '', pass: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  const supabase = createClient()

  const handlePasswordLogin = async () => {
    setError('')
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginData.user,
      password: loginData.pass
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setAuthStep('2fa')
  }

  const handleSignUp = async () => {
    setError('')
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: loginData.user,
      password: loginData.pass,
      options: { data: { role: role } }
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    alert('Registration successful! Please sign in.')
    setAuthStep('login')
  }

  // MANUAL PASSKEY BRIDGE (Bypasses 404s)
  const handleCreatePasskey = async () => {
    if (!isSecure) { setError('Biometrics require HTTPS or localhost'); return }
    setError('')
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sign in with password first to enable Passkeys')

      const challenge = new Uint8Array(32); window.crypto.getRandomValues(challenge)
      const userID = Uint8Array.from(user.id.replace(/-/g, ''), c => c.charCodeAt(0))

      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'Agent AVM' },
          user: { id: userID, name: user.email!, displayName: user.email! },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
          timeout: 60000,
          userVerification: 'required'
        }
      }) as PublicKeyCredential

      if (!credential) throw new Error('Verification failed')

      const credentialData = { id: credential.id, rawId: bufferToBase64(credential.rawId) }
      const { error: upErr } = await supabase.from('profiles').upsert({ id: user.id, passkey_credential: credentialData, updated_at: new Date().toISOString() })
      if (upErr) throw upErr
      
      alert('Passkey Linked! You can now sign in instantly.')
    } catch (err: any) {
      setError(err.message || 'Passkey creation failed')
    } finally {
      setLoading(false)
    }
  }

  const handlePasskeyLogin = async () => {
    if (!isSecure) { setError('Biometrics require HTTPS or localhost'); return }
    if (!loginData.user) { setError('Enter email first'); return }
    
    setError('')
    setLoading(true)
    try {
      // Simulate WebAuthn Verification ceremony
      const challenge = new Uint8Array(32); window.crypto.getRandomValues(challenge)
      const credential = await navigator.credentials.get({
        publicKey: { challenge, timeout: 60000, userVerification: 'required' }
      }) as PublicKeyCredential

      if (credential) {
        // Log in the user (In a real app, this would use a signed challenge verified on server)
        onAuth(true, 'admin')
      }
    } catch (err: any) {
      setError(err.message || 'Biometric verification failed')
    } finally {
      setLoading(false)
    }
  }

  const handle2FAVerify = async () => { onAuth(true, role); setAuthStep('login') }

  return (
    <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0f172a', backgroundImage: 'radial-gradient(circle at top right,rgba(59,130,246,0.15),transparent 500px)', fontFamily: "'Inter',sans-serif" }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: 400 }}>
        <div style={{ position: 'absolute', top: -110, left: 0, right: 0, display: 'flex', justifyContent: 'center', zIndex: 10 }}>
          <img src="/logo.png" alt="VAS Inc" style={{ height: 120, objectFit: 'contain', filter: 'drop-shadow(0 0 25px rgba(59, 130, 246, 0.5))' }} />
        </div>
        <div style={{ ...glass, width: '100%', borderRadius: 24, padding: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ textAlign: 'center' }}><p style={{ color: C.muted, fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.1em' }}>SECURE IDENTITY PORTAL</p></div>
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: 12 }}>
            <button onClick={() => { setAuthMode('passkey'); setError('') }} style={{ flex: 1, padding: '0.6rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, background: authMode === 'passkey' ? 'rgba(255,255,255,0.1)' : 'transparent', color: authMode === 'passkey' ? 'white' : C.muted }}>Passkey</button>
            <button onClick={() => { setAuthMode('password'); setError('') }} style={{ flex: 1, padding: '0.6rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, background: authMode === 'password' ? 'rgba(255,255,255,0.1)' : 'transparent', color: authMode === 'password' ? 'white' : C.muted }}>Password</button>
          </div>
          {error && <div style={{ padding:'0.75rem', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:12, fontSize:'0.8rem', color:C.danger, textAlign:'center' }}>{error}</div>}
          {authMode === 'password' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input type="email" placeholder="Email Address" style={inputStyle} value={loginData.user} onChange={e => setLoginData({ ...loginData, user: e.target.value })} />
              <input type="password" placeholder="Password" style={inputStyle} value={loginData.pass} onChange={e => setLoginData({ ...loginData, pass: e.target.value })} />
              <button onClick={handlePasswordLogin} disabled={loading} style={{ background: C.accent, color: 'white', border: 'none', padding: '1rem', borderRadius: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>{loading ? 'Authenticating...' : 'Sign In'}</button>
              <p style={{ textAlign: 'center', fontSize: '0.85rem', color: C.muted }}>No account? <span style={{ color: C.accent, cursor: 'pointer' }} onClick={() => setAuthStep('signup')}>Register Now</span></p>
            </div>
          ) : (
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.5rem', padding: '1rem 0' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', border: `1px solid ${C.accent}`, position:'relative' }}>
                <span style={{ fontSize: '2.5rem' }}>🔑</span>
                <div style={{ position:'absolute', inset:-5, border:`2px solid ${C.accent}`, borderRadius:'50%', borderTopColor:'transparent', animation:'spin 3s linear infinite' }} />
              </div>
              <input type="email" placeholder="Email Address" style={{ ...inputStyle, textAlign:'center' }} value={loginData.user} onChange={e => setLoginData({ ...loginData, user: e.target.value })} />
              <button onClick={handlePasskeyLogin} disabled={loading} style={{ background: C.accent, color: 'white', border: 'none', padding: '1rem', borderRadius: 12, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>{loading ? 'Verifying...' : 'Sign In with Passkey'}</button>
            </div>
          )}
          {authStep === 'signup' && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 20, background: '#0f172a', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY:'auto' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, textAlign:'center' }}>Create Account</h3>
              <input type="email" placeholder="Email" value={loginData.user} onChange={e => setLoginData({...loginData, user: e.target.value})} style={inputStyle} />
              <input type="password" placeholder="Password" value={loginData.pass} onChange={e => setLoginData({...loginData, pass: e.target.value})} style={inputStyle} />
              <button onClick={handleSignUp} disabled={loading} style={{ background: C.accent, color: 'white', border: 'none', padding: '1rem', borderRadius: 12, fontWeight: 700, opacity: loading ? 0.7 : 1 }}>Register Account</button>
              <button onClick={() => setAuthStep('login')} style={{ background: 'transparent', color: C.muted, border: 'none', cursor: 'pointer' }}>Cancel</button>
            </div>
          )}
          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: C.muted }}>Want to skip passwords? <span style={{ color: C.accent, cursor: 'pointer' }} onClick={handleCreatePasskey}>Enable Passkey</span></p>
        </div>
      </div>
    </div>
  )
}
