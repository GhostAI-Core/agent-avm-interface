'use client'
import { useState } from 'react'
import Container from '@mui/material/Container'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { createClient } from '@/utils/supabase/client'

interface AuthViewProps {
  onAuth: (auth: boolean, role: 'admin' | 'engineer') => void
  // Legacy props kept so the call site in page.tsx doesn't need changing yet
  C?: any; glass?: any; inputStyle?: any; mounted?: boolean; isSecure: boolean
}

const bufferToBase64 = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)))

export default function AuthView({ onAuth, isSecure }: AuthViewProps) {
  const [authMode, setAuthMode] = useState<'passkey' | 'password'>('passkey')
  const [authStep, setAuthStep] = useState<'login' | 'signup'>('login')
  const [role]      = useState<'admin' | 'engineer'>('admin')
  const [loginData, setLoginData] = useState({ user: '', pass: '' })
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)

  const supabase = createClient()
  const set = (field: 'user' | 'pass') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setLoginData(d => ({ ...d, [field]: e.target.value }))

  const handlePasswordLogin = async () => {
    setError(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: loginData.user, password: loginData.pass })
    setLoading(false)
    if (error) { setError(error.message); return }
    onAuth(true, role)
  }

  const handleSignUp = async () => {
    setError(''); setLoading(true)
    const { error } = await supabase.auth.signUp({ email: loginData.user, password: loginData.pass, options: { data: { role } } })
    setLoading(false)
    if (error) { setError(error.message); return }
    alert('Registration successful! Please sign in.')
    setAuthStep('login')
  }

  const handleCreatePasskey = async () => {
    if (!isSecure) { setError('Biometrics require HTTPS or localhost'); return }
    setError(''); setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sign in with password first to enable Passkeys')
      const challenge = new Uint8Array(32); window.crypto.getRandomValues(challenge)
      const userID = Uint8Array.from(user.id.replace(/-/g, ''), c => c.charCodeAt(0))
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge, rp: { name: 'Agent AVM' },
          user: { id: userID, name: user.email!, displayName: user.email! },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
          timeout: 60000, authenticatorSelection: { userVerification: 'required' },
        }
      }) as PublicKeyCredential
      if (!credential) throw new Error('Verification failed')
      const credentialData = { id: credential.id, rawId: bufferToBase64(credential.rawId) }
      const { error: upErr } = await supabase.from('profiles').upsert({ id: user.id, passkey_credential: credentialData, updated_at: new Date().toISOString() })
      if (upErr) throw upErr
      alert('Passkey Linked! You can now sign in instantly.')
    } catch (err: any) {
      setError(err.message || 'Passkey creation failed')
    } finally { setLoading(false) }
  }

  const handlePasskeyLogin = async () => {
    if (!isSecure) { setError('Biometrics require HTTPS or localhost'); return }
    if (!loginData.user) { setError('Enter email first'); return }
    setError(''); setLoading(true)
    try {
      const challenge = new Uint8Array(32); window.crypto.getRandomValues(challenge)
      const credential = await navigator.credentials.get({
        publicKey: { challenge, timeout: 60000, userVerification: 'required' }
      }) as PublicKeyCredential
      if (credential) onAuth(true, 'admin')
    } catch (err: any) {
      setError(err.message || 'Biometric verification failed')
    } finally { setLoading(false) }
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default',
      backgroundImage: 'radial-gradient(circle at top right, rgba(59,130,246,0.15), transparent 500px)', p: 2 }}>
      <Container maxWidth="xs">

        {/* Logo above the card */}
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Box component="img" src="/logo.png" alt="VAS Inc"
            sx={{ height: { xs: 80, sm: 110 }, objectFit: 'contain', filter: 'drop-shadow(0 0 25px rgba(59,130,246,0.5))' }}
          />
        </Box>

        <Paper sx={{ p: { xs: 3, sm: 4 }, position: 'relative', overflow: 'hidden' }}>
          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', fontWeight: 700, letterSpacing: '0.1em', color: 'text.secondary', mb: 2 }}>
            SECURE IDENTITY PORTAL
          </Typography>

          {/* Mode toggle */}
          <ToggleButtonGroup exclusive fullWidth value={authMode} onChange={(_, v) => v && (setAuthMode(v), setError(''))} sx={{ mb: 2 }}>
            <ToggleButton value="passkey" sx={{ fontSize: '0.85rem', fontWeight: 600 }}>Passkey</ToggleButton>
            <ToggleButton value="password" sx={{ fontSize: '0.85rem', fontWeight: 600 }}>Password</ToggleButton>
          </ToggleButtonGroup>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {authMode === 'password' ? (
            <Stack sx={{ gap: 2 }}>
              <TextField label="Email" type="email" size="small" fullWidth value={loginData.user} onChange={set('user')} />
              <TextField label="Password" type="password" size="small" fullWidth value={loginData.pass} onChange={set('pass')} />
              <Button variant="contained" fullWidth disabled={loading} onClick={handlePasswordLogin} sx={{ py: 1.25 }}>
                {loading ? 'Authenticating…' : 'Sign In'}
              </Button>
              <Typography variant="body2" sx={{ textAlign: 'center', color: 'text.secondary' }}>
                No account?{' '}
                <Box component="span" role="button" tabIndex={0} sx={{ color: 'primary.main', cursor: 'pointer' }}
                  onClick={() => setAuthStep('signup')}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setAuthStep('signup')}
                >Register Now</Box>
              </Typography>
            </Stack>
          ) : (
            <Stack sx={{ gap: 2, alignItems: 'center', py: 1 }}>
              <Box sx={{ width: 80, height: 80, borderRadius: '50%', bgcolor: 'rgba(59,130,246,0.1)', border: '1px solid', borderColor: 'primary.main',
                display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <Typography sx={{ fontSize: '2.5rem' }}>🔑</Typography>
                <Box sx={{ position: 'absolute', inset: -5, border: '2px solid', borderColor: 'primary.main', borderRadius: '50%',
                  borderTopColor: 'transparent', animation: 'spin 3s linear infinite' }} />
              </Box>
              <TextField label="Email" type="email" size="small" fullWidth value={loginData.user} onChange={set('user')} sx={{ textAlign: 'center' }} />
              <Button variant="contained" fullWidth disabled={loading} onClick={handlePasskeyLogin} sx={{ py: 1.25 }}>
                {loading ? 'Verifying…' : 'Sign In with Passkey'}
              </Button>
            </Stack>
          )}

          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 2, color: 'text.secondary' }}>
            Want to skip passwords?{' '}
            <Box component="span" role="button" tabIndex={0} sx={{ color: 'primary.main', cursor: 'pointer' }}
              onClick={handleCreatePasskey}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleCreatePasskey()}
            >Enable Passkey</Box>
          </Typography>

          {/* Signup overlay */}
          {authStep === 'signup' && (
            <Box sx={{ position: 'absolute', inset: 0, zIndex: 20, bgcolor: 'background.default', p: 4, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
              <Typography variant="h6" sx={{ textAlign: 'center', fontWeight: 800 }}>Create Account</Typography>
              <TextField label="Email" type="email" size="small" fullWidth value={loginData.user} onChange={set('user')} />
              <TextField label="Password" type="password" size="small" fullWidth value={loginData.pass} onChange={set('pass')} />
              <Button variant="contained" fullWidth disabled={loading} onClick={handleSignUp}>Register Account</Button>
              <Button variant="text" onClick={() => setAuthStep('login')} sx={{ color: 'text.secondary' }}>Cancel</Button>
            </Box>
          )}
        </Paper>
      </Container>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Box>
  )
}
