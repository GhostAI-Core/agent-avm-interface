'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
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
import StatusChip from '@/components/ui/StatusChip'
import { useLookup } from '@/hooks/useLookup'
import { parseContacts } from '@/lib/parseCsv'
import { maskPhone } from '@/lib/security'
import type { Campaign, Contact } from '@/types'

const PAGE_SIZE = 50

type ImportSummary = {
  created?: number
  updated?: number
  duplicates?: number
  rejected?: number
  errors?: { row?: number; phone?: string; reason?: string }[]
}

function fullName(c: Contact): string {
  const n = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
  return n || '—'
}

function fmtWhen(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

export default function ContactsView() {
  // Campaign scope — contacts are read per campaign (GET /campaigns/{id}/contacts).
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignId, setCampaignId] = useState<string>('')

  // Filters
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  // Data
  const [contacts, setContacts] = useState<Contact[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Import
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const { items: statusOptions } = useLookup('contact-statuses')

  // Load campaigns once so the scope selector is populated.
  useEffect(() => {
    let active = true
    fetch('/api/campaigns')
      .then((r) => (r.ok ? r.json() : { campaigns: [] }))
      .then((j) => {
        if (!active) return
        const list: Campaign[] = j.campaigns ?? []
        setCampaigns(list)
        if (list.length && !campaignId) setCampaignId(String(list[0].id))
      })
      .catch(() => { if (active) setCampaigns([]) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadContacts = useCallback(async (isActive: () => boolean = () => true) => {
    if (!campaignId) { setContacts([]); setTotal(0); return }
    setLoading(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) })
      if (status) qs.set('status', status)
      if (search) qs.set('search', search)
      const res = await fetch(`/api/campaigns/${campaignId}/contacts?${qs}`)
      const json = await res.json().catch(() => ({}))
      if (!isActive()) return
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`)
      setContacts(json.items ?? [])
      setTotal(json.total ?? (json.items?.length ?? 0))
    } catch (e) {
      if (!isActive()) return
      setError(e instanceof Error ? e.message : 'Failed to load contacts')
      setContacts([])
      setTotal(0)
    } finally {
      if (isActive()) setLoading(false)
    }
  }, [campaignId, page, status, search])

  // Defer the fetch one microtask so setState never runs synchronously inside the effect.
  useEffect(() => {
    let active = true
    Promise.resolve().then(() => loadContacts(() => active))
    return () => { active = false }
  }, [loadContacts])

  // Page resets live in the filter handlers below (not an effect) to avoid a cascading render.
  const pickCampaign = (v: string) => { setCampaignId(v); setPage(1) }
  const pickStatus = (v: string) => { setStatus(v); setPage(1) }
  const runSearch = () => { setSearch(searchInput.trim()); setPage(1) }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  async function rowAction(contact: Contact, action: 'archive' | 'retry' | 'do-not-call') {
    try {
      const res = await fetch(`/api/contacts/${contact.id}/${action}`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j?.error ?? `Action failed (${res.status})`)
        return
      }
      await loadContacts()
    } catch {
      setError('Action failed')
    }
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file || !campaignId) return
    setImporting(true)
    setImportMsg(null)
    try {
      const text = await file.text()
      const parsed = parseContacts(text)
      if (!parsed.length) {
        setImportMsg({ ok: false, text: 'No valid rows found — the CSV needs a `phone` header.' })
        return
      }
      const res = await fetch(`/api/campaigns/${campaignId}/contacts/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: parsed }),
      })
      const json = (await res.json().catch(() => ({}))) as ImportSummary & { error?: string }
      if (!res.ok) {
        setImportMsg({ ok: false, text: json?.error ?? `Import failed (${res.status})` })
        return
      }
      const bits = [
        json.created != null ? `${json.created} created` : null,
        json.updated != null ? `${json.updated} updated` : null,
        json.duplicates != null ? `${json.duplicates} duplicate` : null,
        json.rejected != null ? `${json.rejected} rejected` : null,
      ].filter(Boolean)
      setImportMsg({ ok: true, text: `Imported ${parsed.length} rows — ${bits.join(', ') || 'done'}.` })
      await loadContacts()
    } catch (err) {
      setImportMsg({ ok: false, text: err instanceof Error ? err.message : 'Import failed' })
    } finally {
      setImporting(false)
    }
  }

  const campaignOptions = useMemo(
    () => campaigns.map((c) => ({ id: String(c.id), name: c.name })),
    [campaigns],
  )

  return (
    <Box>
      <Typography sx={{ fontSize: 22, fontWeight: 800, mb: 0.5 }}>Contacts</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Per-campaign contact list, sourced from CallOps. Import, search, and manage status.
      </Typography>

      {/* Scope + filters */}
      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center', mb: 2 }}>
        <TextField
          select size="small" label="Campaign" value={campaignId}
          onChange={(e) => pickCampaign(e.target.value)} sx={{ minWidth: 220 }}
          disabled={!campaignOptions.length}
          helperText={!campaignOptions.length ? 'No campaigns yet' : undefined}
        >
          {campaignOptions.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
        </TextField>

        <TextField
          select size="small" label="Status" value={status}
          onChange={(e) => pickStatus(e.target.value)} sx={{ minWidth: 170 }}
        >
          <MenuItem value="">All statuses</MenuItem>
          {statusOptions.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
        </TextField>

        <TextField
          size="small" label="Search" value={searchInput} placeholder="Phone or name"
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runSearch() }}
          sx={{ minWidth: 200 }}
        />
        <Button variant="outlined" onClick={runSearch}>Search</Button>

        <Box sx={{ flex: 1 }} />

        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFilePicked} />
        <Button
          variant="contained" disabled={!campaignId || importing}
          onClick={() => fileRef.current?.click()}
          startIcon={importing ? <CircularProgress size={16} /> : undefined}
        >
          {importing ? 'Importing…' : 'Import CSV'}
        </Button>
      </Stack>

      {importMsg && (
        <Alert severity={importMsg.ok ? 'success' : 'error'} sx={{ mb: 2 }} onClose={() => setImportMsg(null)}>
          {importMsg.text}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>
      )}

      <Paper sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Phone</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Network</TableCell>
              <TableCell align="right">Retries</TableCell>
              <TableCell>Last attempted</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={22} /></TableCell></TableRow>
            )}
            {!loading && contacts.map((c) => (
              <TableRow key={c.id} hover>
                <TableCell sx={{ fontFamily: 'monospace' }}>{maskPhone(c.phone)}</TableCell>
                <TableCell>{fullName(c)}</TableCell>
                <TableCell><StatusChip status={c.status} /></TableCell>
                <TableCell>{c.network || '—'}</TableCell>
                <TableCell align="right">{c.retry_count ?? 0}</TableCell>
                <TableCell>{fmtWhen(c.last_attempted_at)}</TableCell>
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                    <Button size="small" onClick={() => rowAction(c, 'retry')}>Retry</Button>
                    <Button size="small" onClick={() => rowAction(c, 'archive')}>Archive</Button>
                    <Button size="small" color="error" onClick={() => rowAction(c, 'do-not-call')}>DNC</Button>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {!loading && !contacts.length && (
              <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                {campaignId ? 'No contacts match this view.' : 'Select a campaign to view contacts.'}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {/* Pagination */}
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          {total} contact{total === 1 ? '' : 's'}{total ? ` · page ${page} of ${totalPages}` : ''}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
          <Button size="small" variant="outlined" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </Stack>
      </Stack>
    </Box>
  )
}
