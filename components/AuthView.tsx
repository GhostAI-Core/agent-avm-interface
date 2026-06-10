'use client'
import { useMemo, useState } from 'react'
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
import { resolveUserRole, userMetaFromSession, type AppRole } from '@/lib/roles'
import { withTimeout } from '@/lib/async'
import { semantic } from '@/lib/tokens'

interface AuthViewProps {
  onAuth: (auth: boolean, role: AppRole) => void
  isSecure: boolean
}

const bufferToBase64 = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)))

export default function AuthView({ onAuth, isSecure }: AuthViewProps) {
  const supabase = useMemo(() => createClient(), [])
  const [authMode, setAuthMode] = useState<'passkey' | 'password'>('password')
  const [loginData, setLoginData] = useState({ user: '', pass: '' })
  const [error,     setError]     = useState('')
  const [loading,   setLoading]   = useState(false)

  const set = (field: 'user' | 'pass') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setLoginData(d => ({ ...d, [field]: e.target.value }))

  const handlePasswordLogin = async () => {
    setError('')
    setLoading(true)
    try {
      const { data, error: signInError } = await withTimeout(
        supabase.auth.signInWithPassword({
          email: loginData.user.trim(),
          password: loginData.pass,
        }),
        15000,
        'Sign in timed out. Try incognito mode or disable browser extensions (password managers can block auth).',
      )

      if (signInError) throw signInError
      if (!data.session?.user) throw new Error('Sign-in succeeded but no session was created')

      const meta = userMetaFromSession(data.session.user)
      const role: AppRole = meta.role === 'admin' ? 'admin' : 'engineer'
      onAuth(true, role)

      void resolveUserRole(supabase, data.session.user.id, meta).catch(err => {
        console.warn('Profile sync failed:', err)
      })
    } catch (err: any) {
      setError(err.message || 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePasskey = async () => {
    if (!isSecure) { setError('Biometrics require HTTPS or localhost'); return }
    setError(''); setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('Sign in with password first to enable Passkeys')
      const user = session.user
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

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default',
      backgroundImage: `radial-gradient(circle at top right, rgba(55,166,96,0.12), transparent 500px)`, p: 2 }}>
      <Container maxWidth="xs">

        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Box component="img" src="/evra_trans.png" alt="EVRA"
            sx={{ height: { xs: 80, sm: 110 }, width: 'auto', objectFit: 'contain', filter: `drop-shadow(0 0 20px ${semantic.accentGlow}88)` }}
          />
        </Box>

        <Paper sx={{ p: { xs: 3, sm: 4 }, position: 'relative', overflow: 'hidden' }}>
          <Typography variant="caption" className="logo-wordmark" sx={{ display: 'block', textAlign: 'center', fontSize: '0.65rem', mb: 2 }}>
            SECURE IDENTITY PORTAL
          </Typography>

          <ToggleButtonGroup exclusive fullWidth value={authMode} onChange={(_, v) => v && (setAuthMode(v), setError(''))} sx={{ mb: 2 }}>
            <ToggleButton value="password" sx={{ fontSize: '0.85rem', fontWeight: 600 }}>Password</ToggleButton>
            <ToggleButton value="passkey" sx={{ fontSize: '0.85rem', fontWeight: 600 }}>Passkey</ToggleButton>
          </ToggleButtonGroup>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {authMode === 'password' ? (
            <Box component="form" onSubmit={e => { e.preventDefault(); void handlePasswordLogin() }}>
              <Stack sx={{ gap: 2 }}>
                <TextField name="email" label="Email" type="email" size="small" fullWidth required
                  autoComplete="username" value={loginData.user} onChange={set('user')} />
                <TextField name="password" label="Password" type="password" size="small" fullWidth required
                  autoComplete="current-password" value={loginData.pass} onChange={set('pass')} />
                <Button type="submit" variant="contained" fullWidth disabled={loading} sx={{ py: 1.25 }}>
                  {loading ? 'Authenticating…' : 'Sign In'}
                </Button>
                <Typography variant="caption" sx={{ textAlign: 'center', color: 'text.secondary' }}>
                  Access is by invitation only. Contact your administrator if you need an account.
                </Typography>
              </Stack>
            </Box>
          ) : (
            <Stack sx={{ gap: 2, alignItems: 'center', py: 1 }}>
              <Alert severity="info" sx={{ width: '100%' }}>
                Passkey sign-in is not available yet. Use password to sign in, then link a passkey below.
              </Alert>
              <TextField label="Email" type="email" size="small" fullWidth value={loginData.user} onChange={set('user')} />
            </Stack>
          )}

          <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 2, color: 'text.secondary' }}>
            Signed in with password?{' '}
            <Box component="span" role="button" tabIndex={0} sx={{ color: 'primary.main', cursor: 'pointer' }}
              onClick={handleCreatePasskey}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleCreatePasskey()}
            >Link a Passkey</Box>
          </Typography>
        </Paper>
      </Container>
    </Box>
  )
}
