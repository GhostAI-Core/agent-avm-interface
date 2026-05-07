'use client'
import { useState } from 'react'
import Stack from '@mui/material/Stack'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { createClient } from '@/utils/supabase/client'

interface Props { role: 'admin' | 'engineer' }

export default function ProfileView({ role }: Props) {
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [passMsg, setPassMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')

  const supabase = createClient()

  const handleUpdatePassword = async () => {
    setPassMsg(null)
    if (newPass !== confirmPass) { setPassMsg({ type: 'error', text: 'Passwords do not match.' }); return }
    const { error } = await supabase.auth.updateUser({ password: newPass })
    if (error) setPassMsg({ type: 'error', text: error.message })
    else { setPassMsg({ type: 'success', text: 'Password updated successfully.' }); setNewPass(''); setConfirmPass('') }
  }

  return (
    <Stack sx={{ gap: 3, maxWidth: 600 }}>

      {/* Reset Password */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Reset Password</Typography>
        <Stack sx={{ gap: 2 }}>
          <TextField label="New Password" type="password" size="small" fullWidth value={newPass} onChange={e => setNewPass(e.target.value)} />
          <TextField label="Confirm Password" type="password" size="small" fullWidth value={confirmPass} onChange={e => setConfirmPass(e.target.value)} />
          {passMsg && <Alert severity={passMsg.type}>{passMsg.text}</Alert>}
          <Button variant="contained" onClick={handleUpdatePassword} disabled={!newPass || !confirmPass}>Update Password</Button>
        </Stack>
      </Paper>

      {/* Link Employee — admin only */}
      {role === 'admin' && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Link Employee</Typography>
          <Alert severity="info" sx={{ mb: 2 }}>Linked employees have read-only access to all views.</Alert>
          <Stack direction="row" sx={{ gap: 1, mb: 2 }}>
            <TextField label="Employee Email" size="small" fullWidth value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
            <Button variant="outlined" onClick={() => setInviteEmail('')} disabled={!inviteEmail}>Send Invite</Button>
          </Stack>
          <List dense>
            {[{ email: 'alice@company.co.za' }, { email: 'bob@company.co.za' }].map(emp => (
              <ListItem key={emp.email} disableGutters>
                <ListItemIcon sx={{ minWidth: 32 }}><VisibilityIcon sx={{ fontSize: 16, color: 'text.secondary' }} /></ListItemIcon>
                <ListItemText primary={emp.email} slotProps={{ primary: { variant: 'body2' } }} />
              </ListItem>
            ))}
          </List>
        </Paper>
      )}

    </Stack>
  )
}
