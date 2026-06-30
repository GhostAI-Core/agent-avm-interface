'use client'

import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import StatusChip from '@/components/ui/StatusChip'
import type { Company, SipTrunk } from '@/types'

type Health = { live?: boolean; status?: string }
type Banner = { ok: boolean; text: string } | null

const EMPTY_FORM = { name: '', from_number: '', address: '', numbers: '', auth_username: '', auth_password: '', livekit_trunk_id: '' }

// Real SIP-trunk management, sourced from CallOps `/companies/{id}/sip-trunks` (bearer).
// Replaces the browser-local mock store. Credentials are entered on create only and are
// NEVER rendered back — CallOps does not return them.
export default function SipTrunksPanel() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState<string>('')
  const [trunks, setTrunks] = useState<SipTrunk[]>([])
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState<Banner>(null)
  const [health, setHealth] = useState<Record<number, Health>>({})

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  const [testFor, setTestFor] = useState<SipTrunk | null>(null)
  const [testPhone, setTestPhone] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    let active = true
    fetch('/api/companies')
      .then((r) => (r.ok ? r.json() : { companies: [] }))
      .then((j) => {
        if (!active) return
        const list: Company[] = j.companies ?? []
        setCompanies(list)
        if (list.length && !companyId) setCompanyId(String(list[0].id))
      })
      .catch(() => { if (active) setCompanies([]) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadTrunks = useCallback(async (isActive: () => boolean = () => true) => {
    if (!companyId) { setTrunks([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/companies/${companyId}/sip-trunks`)
      const json = await res.json().catch(() => ({}))
      if (!isActive()) return
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`)
      setTrunks(json.items ?? [])
      setHealth({})
    } catch (e) {
      if (isActive()) { setBanner({ ok: false, text: e instanceof Error ? e.message : 'Failed to load trunks' }); setTrunks([]) }
    } finally {
      if (isActive()) setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => loadTrunks(() => active))
    return () => { active = false }
  }, [loadTrunks])

  async function createTrunk() {
    if (!companyId || !form.name.trim()) return
    setSaving(true)
    setBanner(null)
    try {
      const numbers = form.numbers.split(',').map((s) => s.trim()).filter(Boolean)
      const body: Record<string, unknown> = { name: form.name.trim() }
      if (form.from_number.trim()) body.from_number = form.from_number.trim()
      if (form.address.trim()) body.address = form.address.trim()
      if (numbers.length) body.numbers = numbers
      if (form.auth_username.trim()) body.auth_username = form.auth_username.trim()
      if (form.auth_password) body.auth_password = form.auth_password
      if (form.livekit_trunk_id.trim()) body.livekit_trunk_id = form.livekit_trunk_id.trim()

      const res = await fetch(`/api/companies/${companyId}/sip-trunks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Create failed (${res.status})`)
      setBanner({ ok: true, text: `Trunk "${form.name.trim()}" created.` })
      setCreateOpen(false)
      setForm({ ...EMPTY_FORM })
      await loadTrunks()
    } catch (e) {
      setBanner({ ok: false, text: e instanceof Error ? e.message : 'Create failed' })
    } finally {
      setSaving(false)
    }
  }

  async function checkHealth(t: SipTrunk) {
    try {
      const res = await fetch(`/api/sip-trunks/${t.id}/health`)
      const json = (await res.json().catch(() => ({}))) as Health & { error?: string }
      if (!res.ok) { setBanner({ ok: false, text: json?.error ?? `Health check failed (${res.status})` }); return }
      setHealth((h) => ({ ...h, [t.id]: { live: json.live, status: json.status } }))
    } catch {
      setBanner({ ok: false, text: 'Health check failed' })
    }
  }

  async function archiveTrunk(t: SipTrunk) {
    setBanner(null)
    try {
      const res = await fetch(`/api/sip-trunks/${t.id}/archive`, { method: 'POST' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setBanner({ ok: false, text: j?.error ?? `Archive failed (${res.status})` }); return }
      setBanner({ ok: true, text: `Trunk "${t.name}" archived.` })
      await loadTrunks()
    } catch {
      setBanner({ ok: false, text: 'Archive failed' })
    }
  }

  async function runTestCall() {
    if (!testFor || !testPhone.trim()) return
    setTesting(true)
    try {
      const res = await fetch(`/api/sip-trunks/${testFor.id}/test-call`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: testPhone.trim() }),
      })
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string }
      // A failed call still returns 200 with ok:false — surface that as a failure, not a crash.
      const ok = res.ok && json.ok !== false
      setBanner({ ok, text: json.message ?? json.error ?? (ok ? 'Test call placed.' : 'Test call failed.') })
      setTestFor(null); setTestPhone('')
    } catch {
      setBanner({ ok: false, text: 'Test call failed' })
    } finally {
      setTesting(false)
    }
  }

  const field = (key: keyof typeof form, label: string, opts?: { type?: string; helper?: string }) => (
    <TextField
      size="small" fullWidth label={label} type={opts?.type ?? 'text'} value={form[key]}
      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} helperText={opts?.helper}
    />
  )

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
        <TextField
          select size="small" label="Company" value={companyId}
          onChange={(e) => setCompanyId(e.target.value)} sx={{ minWidth: 220 }}
          disabled={!companies.length} helperText={!companies.length ? 'No companies yet' : undefined}
        >
          {companies.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
        </TextField>
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" disabled={!companyId} onClick={() => { setForm({ ...EMPTY_FORM }); setCreateOpen(true) }}>
          + Add Trunk
        </Button>
      </Stack>

      {banner && (
        <Alert severity={banner.ok ? 'success' : 'error'} onClose={() => setBanner(null)}>{banner.text}</Alert>
      )}

      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>From number</TableCell>
              <TableCell>LiveKit trunk</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Health</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6} sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={22} /></TableCell></TableRow>
            )}
            {!loading && trunks.map((t) => {
              const h = health[t.id]
              return (
                <TableRow key={t.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{t.name}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{t.from_number || '—'}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{t.livekit_trunk_id || '—'}</TableCell>
                  <TableCell>{t.status ? <StatusChip status={t.status} /> : '—'}</TableCell>
                  <TableCell>
                    {h ? (h.live ? '🟢 live' : `🔴 ${h.status || 'down'}`) : <Button size="small" onClick={() => checkHealth(t)}>Check</Button>}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                      <Button size="small" onClick={() => { setTestFor(t); setTestPhone('') }}>Test call</Button>
                      <Button size="small" color="warning" onClick={() => archiveTrunk(t)}>Archive</Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              )
            })}
            {!loading && !trunks.length && (
              <TableRow><TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                {companyId ? 'No trunks for this company yet.' : 'Select a company to view trunks.'}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {/* Create dialog — credentials entered here only, never shown in the table. */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>New SIP Trunk</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {field('name', 'Name')}
            {field('from_number', 'From number', { helper: 'Caller ID, e.g. +27111234567' })}
            {field('address', 'SIP address', { helper: 'e.g. sip.provider.com' })}
            {field('numbers', 'Numbers', { helper: 'Comma-separated' })}
            {field('auth_username', 'Auth username')}
            {field('auth_password', 'Auth password', { type: 'password', helper: 'Stored by CallOps; never returned.' })}
            {field('livekit_trunk_id', 'LiveKit trunk id', { helper: 'Optional — link an existing LiveKit trunk' })}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)} variant="outlined">Cancel</Button>
          <Button onClick={createTrunk} variant="contained" disabled={saving || !form.name.trim()}
            startIcon={saving ? <CircularProgress size={16} /> : undefined}>
            {saving ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Test-call dialog */}
      <Dialog open={!!testFor} onClose={() => setTestFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Test call — {testFor?.name}</DialogTitle>
        <DialogContent>
          <TextField autoFocus size="small" fullWidth label="Phone number" value={testPhone} sx={{ mt: 1 }}
            onChange={(e) => setTestPhone(e.target.value)} placeholder="+27 82 123 4567"
            onKeyDown={(e) => { if (e.key === 'Enter') runTestCall() }} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setTestFor(null)} variant="outlined">Cancel</Button>
          <Button onClick={runTestCall} variant="contained" disabled={testing || !testPhone.trim()}
            startIcon={testing ? <CircularProgress size={16} /> : undefined}>
            {testing ? 'Calling…' : 'Place test call'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
