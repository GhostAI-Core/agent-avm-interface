'use client'

import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Chip from '@mui/material/Chip'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import CircularProgress from '@mui/material/CircularProgress'
import ResponsiveDialog from '@/components/ui/ResponsiveDialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import VoiceGenerator from '@/components/VoiceGenerator'
import type { Company, Product, ProductScriptVersion } from '@/types'

type Banner = { ok: boolean; text: string } | null

const EMPTY_FORM = { name: '', integration_type: 'lead_gen', sts_product_key: '', active: true }
const INTEGRATION_TYPES = [
  { value: 'lead_gen', label: 'Lead Gen', hint: 'Registers the opt-in locally only, no external push' },
  { value: 'sts_subscription', label: 'STS Subscription', hint: 'Fires the STS subscribe endpoint (needs a product key)' },
]

/** Read an audio URL's duration (seconds) client-side, or null if it can't be read. */
function measureAudioDuration(src: string): Promise<number | null> {
  return new Promise(resolve => {
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => resolve(Number.isFinite(a.duration) ? a.duration : null)
    a.onerror = () => resolve(null)
    a.src = src
  })
}

function formatDuration(seconds?: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—'
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

// Product management: the data-driven replacement for the hardcoded campaigns.agent
// {seeker, grace} pairing. Sourced from CallOps `/companies/{id}/products` (bearer). Each
// product bundles a script (version history, managed here via a VoiceGenerator) with a
// consent-flow (integration_type) — see types/index.ts `Product` for the full model.
export default function ProductsView() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [companyId, setCompanyId] = useState<string>('')
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [banner, setBanner] = useState<Banner>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)

  const [scriptFor, setScriptFor] = useState<Product | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/companies')
      .then(r => (r.ok ? r.json() : { companies: [] }))
      .then(j => {
        if (!active) return
        const list: Company[] = j.companies ?? []
        setCompanies(list)
        if (list.length && !companyId) setCompanyId(String(list[0].id))
      })
      .catch(() => { if (active) setCompanies([]) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadProducts = useCallback(async (isActive: () => boolean = () => true) => {
    if (!companyId) { setProducts([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/products?company_id=${companyId}`)
      const json = await res.json().catch(() => ({}))
      if (!isActive()) return
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`)
      setProducts(json.products ?? [])
    } catch (e) {
      if (isActive()) { setBanner({ ok: false, text: e instanceof Error ? e.message : 'Failed to load products' }); setProducts([]) }
    } finally {
      if (isActive()) setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => loadProducts(() => active))
    return () => { active = false }
  }, [loadProducts])

  async function createProduct() {
    if (!companyId || !form.name.trim()) return
    if (form.integration_type === 'sts_subscription' && !form.sts_product_key.trim()) {
      setBanner({ ok: false, text: 'An STS product key is required for STS Subscription products.' })
      return
    }
    setSaving(true)
    setBanner(null)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: Number(companyId),
          name: form.name.trim(),
          integration_type: form.integration_type,
          sts_product_key: form.integration_type === 'sts_subscription' ? form.sts_product_key.trim() : undefined,
          active: form.active,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Create failed (${res.status})`)
      setBanner({ ok: true, text: `Product "${form.name.trim()}" created — add a script to start using it on a campaign.` })
      setCreateOpen(false)
      setForm({ ...EMPTY_FORM })
      await loadProducts()
    } catch (e) {
      setBanner({ ok: false, text: e instanceof Error ? e.message : 'Create failed' })
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(p: Product) {
    setBanner(null)
    try {
      const res = await fetch(`/api/products/${p.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !p.active }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Update failed (${res.status})`)
      await loadProducts()
    } catch (e) {
      setBanner({ ok: false, text: e instanceof Error ? e.message : 'Update failed' })
    }
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography sx={{ fontSize: 22, fontWeight: 800, mb: 0.5 }}>Products</Typography>
        <Typography variant="body2" color="text.secondary">
          A product bundles a script (with version history) and a consent-flow — STS Subscription
          fires the STS subscribe endpoint, Lead Gen just registers the opt-in. Campaigns dial for
          a product in place of the old hardcoded Seeker/Grace pairing.
        </Typography>
      </Box>

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
          + New Product
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
              <TableCell>Consent flow</TableCell>
              <TableCell>STS key</TableCell>
              <TableCell>Script</TableCell>
              <TableCell>Active</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={6} sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={22} /></TableCell></TableRow>
            )}
            {!loading && products.map((p) => (
              <TableRow key={p.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{p.name}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={p.integration_type === 'sts_subscription' ? 'STS Subscription' : 'Lead Gen'}
                    color={p.integration_type === 'sts_subscription' ? 'primary' : 'default'}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell sx={{ fontFamily: 'monospace' }}>{p.sts_product_key || '—'}</TableCell>
                <TableCell>
                  {p.current_version_id ? <Chip size="small" label="Has script" color="success" variant="outlined" /> : <Chip size="small" label="No script yet" variant="outlined" />}
                </TableCell>
                <TableCell>
                  <Switch size="small" checked={p.active} onChange={() => toggleActive(p)} />
                </TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => setScriptFor(p)}>Manage script</Button>
                </TableCell>
              </TableRow>
            ))}
            {!loading && !products.length && (
              <TableRow><TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                {companyId ? 'No products for this company yet.' : 'Select a company to view products.'}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>

      {/* Create dialog */}
      <ResponsiveDialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>New Product</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              size="small" fullWidth label="Name" placeholder="e.g. Insurance Product A"
              value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <TextField
              select size="small" fullWidth label="Consent flow" value={form.integration_type}
              onChange={(e) => setForm((f) => ({ ...f, integration_type: e.target.value }))}
            >
              {INTEGRATION_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label} — {t.hint}</MenuItem>
              ))}
            </TextField>
            {form.integration_type === 'sts_subscription' && (
              <TextField
                size="small" fullWidth label="STS product key" placeholder="e.g. psychic"
                value={form.sts_product_key} onChange={(e) => setForm((f) => ({ ...f, sts_product_key: e.target.value }))}
                helperText="The key STS uses to identify this product (confirmed with STS ahead of time)."
              />
            )}
            <FormControlLabel
              control={<Switch checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />}
              label="Active"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)} variant="outlined">Cancel</Button>
          <Button onClick={createProduct} variant="contained" disabled={saving || !form.name.trim()}
            startIcon={saving ? <CircularProgress size={16} /> : undefined}>
            {saving ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </ResponsiveDialog>

      {/* Manage script dialog */}
      {scriptFor && (
        <ProductScriptDialog
          product={scriptFor}
          onClose={() => setScriptFor(null)}
          onChanged={() => { loadProducts(); }}
        />
      )}
    </Stack>
  )
}

function ProductScriptDialog({ product, onClose, onChanged }: {
  product: Product
  onClose: () => void
  onChanged: () => void
}) {
  const [versions, setVersions] = useState<ProductScriptVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<Banner>(null)
  const [busyVersionId, setBusyVersionId] = useState<number | null>(null)

  // Tracks the in-progress draft in the VoiceGenerator so a new version can be recorded the
  // moment it uploads the generated audio (voice_id/text arrive via separate callbacks).
  const [draftVoiceId, setDraftVoiceId] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const [savingVersion, setSavingVersion] = useState(false)

  const loadVersions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/products/${product.id}/versions`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`)
      setVersions(json.versions ?? [])
    } catch (e) {
      setBanner({ ok: false, text: e instanceof Error ? e.message : 'Failed to load script versions' })
    } finally {
      setLoading(false)
    }
  }, [product.id])

  useEffect(() => {
    let active = true
    Promise.resolve().then(() => { if (active) loadVersions() })
    return () => { active = false }
  }, [loadVersions])

  const currentVersion = versions.find(v => v.id === product.current_version_id) ?? null

  // VoiceGenerator already uploads to storage and hands back a public URL via this callback —
  // record that as a new version the moment it lands, using whatever voice/text were tracked
  // alongside it. A null url means the recording was cleared, not a new save.
  async function handleGeneratedUrl(url: string | null) {
    if (!url) return
    setSavingVersion(true)
    setBanner(null)
    try {
      const duration = await measureAudioDuration(url)
      const res = await fetch(`/api/products/${product.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: draftText.trim() || undefined,
          voice_id: draftVoiceId ?? undefined,
          audio_url: url,
          duration_seconds: duration ?? undefined,
          set_current: true,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Save failed (${res.status})`)
      setBanner({ ok: true, text: `Saved as version ${json?.version?.version ?? ''}.` })
      await loadVersions()
      onChanged()
    } catch (e) {
      setBanner({ ok: false, text: e instanceof Error ? e.message : 'Could not save script version' })
    } finally {
      setSavingVersion(false)
    }
  }

  async function activateVersion(v: ProductScriptVersion) {
    setBusyVersionId(v.id)
    setBanner(null)
    try {
      const res = await fetch(`/api/products/${product.id}/versions/${v.id}/activate`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? `Failed (${res.status})`)
      setBanner({ ok: true, text: `Version ${v.version} is now current.` })
      await loadVersions()
      onChanged()
    } catch (e) {
      setBanner({ ok: false, text: e instanceof Error ? e.message : 'Could not activate version' })
    } finally {
      setBusyVersionId(null)
    }
  }

  return (
    <ResponsiveDialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Script — {product.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {banner && <Alert severity={banner.ok ? 'success' : 'error'} onClose={() => setBanner(null)}>{banner.text}</Alert>}

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Version history</Typography>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}><CircularProgress size={20} /></Box>
            ) : versions.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No script versions yet — generate one below.</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Version</TableCell>
                    <TableCell>Length</TableCell>
                    <TableCell>Text</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {versions.map(v => (
                    <TableRow key={v.id} hover selected={v.id === product.current_version_id}>
                      <TableCell>
                        v{v.version}
                        {v.id === product.current_version_id && (
                          <Chip size="small" label="current" color="success" variant="outlined" sx={{ ml: 1 }} />
                        )}
                      </TableCell>
                      <TableCell>{formatDuration(v.duration_seconds)}</TableCell>
                      <TableCell sx={{ maxWidth: 220 }}>
                        <Typography variant="caption" noWrap sx={{ display: 'block' }}>{v.text || '—'}</Typography>
                      </TableCell>
                      <TableCell align="right">
                        {v.id !== product.current_version_id && (
                          <Button size="small" disabled={busyVersionId === v.id} onClick={() => activateVersion(v)}>
                            {busyVersionId === v.id ? 'Activating…' : 'Make current'}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>

          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
              Generate a new version{savingVersion ? ' — saving…' : ''}
            </Typography>
            <VoiceGenerator
              key={product.id}
              campaignName={product.name}
              voiceRecordingUrl={null}
              onVoiceRecordingUrlChange={handleGeneratedUrl}
              onVoiceIdChange={setDraftVoiceId}
              onScriptTextChange={setDraftText}
              initialText={currentVersion?.text ?? ''}
              initialVoiceId={currentVersion?.voice_id ?? null}
              disabled={savingVersion}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} variant="outlined">Close</Button>
      </DialogActions>
    </ResponsiveDialog>
  )
}
