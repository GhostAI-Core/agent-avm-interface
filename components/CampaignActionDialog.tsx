'use client'
import { useState, useEffect } from 'react'
import ResponsiveDialog from '@/components/ui/ResponsiveDialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Stack from '@mui/material/Stack'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import Alert from '@mui/material/Alert'
import Grid from '@mui/material/Grid'
import type { Campaign, Company, Product } from '@/types'
import { parseContacts } from '@/lib/parseCsv'
import { fetchProductsForCompany, fetchCurrentVersion } from '@/lib/products'
import { formatDuration, measureAudioDuration, estimateRunSeconds, DTMF_RESPONSE_SECONDS } from '@/lib/scheduleEstimate'
import VoiceGenerator from '@/components/VoiceGenerator'

type Mode = 'edit' | 'reuse'
type SavedScript = { storageKey: string; publicUrl: string; name: string; lastModified: string | null }
type Trunk = { id: number; name: string; livekit_trunk_id: string; from_number: string }

/** Coerce a stored date (ISO timestamp or date) into the YYYY-MM-DD a date input wants. */
function toDateInput(v: string | null | undefined): string {
  return v ? v.slice(0, 10) : ''
}

export default function CampaignActionDialog({ mode, campaign, onClose, onDone }: {
  mode: Mode
  campaign: Campaign
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(mode === 'reuse' ? `${campaign.name} (copy)` : campaign.name)
  // Unified script pointer (issue #31): audio_path, falling back to the legacy voice_recording_url.
  const [scriptUrl, setScriptUrl] = useState(campaign.audio_path ?? campaign.voice_recording_url ?? '')
  const [scripts, setScripts] = useState<SavedScript[]>([])
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Edit-mode fields mirroring the campaigns table (name, product, company, speed, window).
  // Reuse mode never reads these — its payload carries the source campaign's values verbatim.
  const [productId, setProductId] = useState<number | ''>(campaign.product_id ?? '')
  const [products, setProducts] = useState<Product[]>([])
  const [companyId, setCompanyId] = useState<number | ''>(campaign.company_id ?? '')
  const [dialingSpeed, setDialingSpeed] = useState<number>(campaign.dialing_speed ?? 1)
  const [maxConcurrent, setMaxConcurrent] = useState<number>(campaign.max_concurrent ?? 10)
  const [maxRetries, setMaxRetries] = useState<number>(campaign.max_retries ?? 2)
  const [retryCooldownMinutes, setRetryCooldownMinutes] = useState<number>(Math.round((campaign.retry_cooldown_seconds ?? 3600) / 60))
  const [networkProvider, setNetworkProvider] = useState<string>(campaign.network_provider ?? '')
  const [windowStart, setWindowStart] = useState<string>(campaign.time_window_start ?? '')
  const [windowEnd, setWindowEnd] = useState<string>(campaign.time_window_end ?? '')
  const [sipTrunkId, setSipTrunkId] = useState<string>(campaign.sip_trunk_id != null ? String(campaign.sip_trunk_id) : '')
  const [startDate, setStartDate] = useState<string>(toDateInput(campaign.start_date))
  const [endDate, setEndDate] = useState<string>(toDateInput(campaign.end_date))
  const [companies, setCompanies] = useState<Company[]>([])
  const [trunks, setTrunks] = useState<Trunk[]>([])

  // Schedule estimate: edit mode estimates the remaining run for contacts still pending under
  // the (possibly just-changed) speed/concurrency settings; reuse mode estimates the fresh run
  // for whatever CSV is attached below.
  const [scriptSeconds, setScriptSeconds] = useState<number | null>(null)
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [reuseContactCount, setReuseContactCount] = useState<number | null>(null)

  // Per-campaign script history (script_audio) — reload the last-saved script's text + voice
  // when reopening this campaign for editing, so VoiceGenerator doesn't start blank.
  const [scriptText, setScriptText] = useState('')
  const [savedVoiceId, setSavedVoiceId] = useState<string | null>(null)
  const [voiceId, setVoiceId] = useState<string | null>(campaign.voice_id ?? null)
  const [scriptHistoryLoaded, setScriptHistoryLoaded] = useState(mode !== 'edit')

  // Load the saved S3 scripts for the dropdown.
  useEffect(() => {
    let cancelled = false
    fetch('/api/scripts')
      .then(r => (r.ok ? r.json() : { scripts: [] }))
      .then(j => { if (!cancelled) setScripts(j.scripts ?? []) })
      .catch(() => { /* leave empty → paste a URL instead */ })
    return () => { cancelled = true }
  }, [])

  // Load companies + trunks for the edit-mode dropdowns (same sources as the create modal).
  useEffect(() => {
    if (mode !== 'edit') return
    let cancelled = false
    fetch('/api/companies')
      .then(r => (r.ok ? r.json() : { companies: [] }))
      .then(j => { if (!cancelled) setCompanies(j.companies ?? []) })
      .catch(() => { /* leave empty → dropdown shows the current/empty company */ })
    fetch('/api/trunks')
      .then(r => (r.ok ? r.json() : { trunks: [] }))
      .then(j => { if (!cancelled) setTrunks(j.trunks ?? []) })
      .catch(() => { /* leave empty → keep current/default trunk */ })
    return () => { cancelled = true }
  }, [mode])

  // Products (script + consent-flow) available for the selected company.
  useEffect(() => {
    if (mode !== 'edit') return
    let cancelled = false
    fetchProductsForCompany(companyId).then(list => { if (!cancelled) setProducts(list) })
    return () => { cancelled = true }
  }, [mode, companyId])

  // Explicitly switching products pre-fills the script from its current version. Guarded against
  // the initial value so reopening the dialog doesn't clobber this campaign's already-loaded
  // script with the product's version the moment scriptHistoryLoaded resolves.
  const initialProductId = campaign.product_id ?? ''
  useEffect(() => {
    if (mode !== 'edit' || productId === initialProductId) return
    let cancelled = false
    fetchCurrentVersion(productId).then(v => {
      if (cancelled || !v) return
      setScriptUrl(v.audio_url ?? '')
      setVoiceId(v.voice_id ?? null)
      setScriptText(v.text ?? '')
    })
    return () => { cancelled = true }
  }, [mode, productId, initialProductId])

  // Pending contacts still to be dialed, for the "estimated remaining run" readout.
  useEffect(() => {
    if (mode !== 'edit') return
    let cancelled = false
    fetch(`/api/campaigns/${campaign.id}`)
      .then(r => (r.ok ? r.json() : { summary: null }))
      .then(j => { if (!cancelled) setPendingCount(j?.summary?.pending ?? null) })
      .catch(() => { /* estimate just won't show a contact count */ })
    return () => { cancelled = true }
  }, [mode, campaign.id])

  // Reuse mode: count the attached CSV's rows for the estimate (no server round-trip needed).
  useEffect(() => {
    let cancelled = false
    const count = mode === 'reuse' && csvFile ? csvFile.text().then(text => parseContacts(text).length) : Promise.resolve(null)
    count.then(n => { if (!cancelled) setReuseContactCount(n) }).catch(() => { if (!cancelled) setReuseContactCount(null) })
    return () => { cancelled = true }
  }, [mode, csvFile])

  // Measure the script's audio length for the estimate, same approach as the create wizard.
  useEffect(() => {
    let cancelled = false
    const measured = scriptUrl ? measureAudioDuration(scriptUrl) : Promise.resolve(null)
    measured.then(d => { if (!cancelled) setScriptSeconds(d) })
    return () => { cancelled = true }
  }, [scriptUrl])

  // Reload this campaign's last-saved script text + voice (script_audio, scoped to campaign_id)
  // before rendering VoiceGenerator — it only reads its initialText/initialVoiceId props once,
  // on mount, so we gate the render until this resolves instead of remounting after the fact.
  useEffect(() => {
    if (mode !== 'edit') return
    let cancelled = false
    fetch(`/api/script-audio?campaign_id=${campaign.id}`)
      .then(r => (r.ok ? r.json() : { items: [] }))
      .then(j => {
        if (cancelled) return
        const latest = Array.isArray(j.items) ? j.items[0] : null
        if (latest?.text) { setScriptText(latest.text); }
        if (latest?.voice) setSavedVoiceId(latest.voice)
      })
      .catch(() => { /* no history yet — VoiceGenerator just starts blank */ })
      .finally(() => { if (!cancelled) setScriptHistoryLoaded(true) })
    return () => { cancelled = true }
  }, [mode, campaign.id])

  async function submit() {
    setLoading(true); setError('')
    try {
      if (mode === 'edit') {
        // CallOps rejects (409) a PATCH that even includes dialing_speed/max_concurrent/sip_trunk_id
        // while the campaign is running — pause it first. Omit the keys entirely rather than send
        // unchanged values, since the check is on key presence, not value diff.
        const body: Record<string, unknown> = {
          name: name.trim(),
          // Product (script + consent-flow) drives routing_mode/sts_product/agent server-side —
          // see evra_callops app/api/campaigns.py _resolve_product_fields(). Omitted (not sent)
          // when unchanged, so an untouched product_id never gets clobbered.
          ...(productId !== initialProductId ? { product_id: productId || null } : {}),
          company_id: companyId === '' ? null : companyId,
          time_window_start: windowStart,
          time_window_end: windowEnd,
          max_retries: maxRetries,
          retry_cooldown_seconds: retryCooldownMinutes * 60,
          network_provider: networkProvider || null,
          start_date: startDate || null,
          end_date: endDate || null,
          audio_path: scriptUrl,
          voice_id: voiceId || null,
        }
        if (!isRunning) {
          body.dialing_speed = dialingSpeed
          body.max_concurrent = maxConcurrent
          body.sip_trunk_id = sipTrunkId === '' ? null : Number(sipTrunkId)
        }
        const res = await fetch(`/api/campaigns/${campaign.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to update')

        // Best-effort: record the (possibly new) script text against this campaign's history so
        // it reloads correctly next time it's reopened for editing.
        if (scriptUrl && scriptText.trim()) {
          fetch('/api/script-audio', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign_id: campaign.id, audio_url: scriptUrl, text: scriptText.trim(), voice: voiceId ?? undefined }),
          }).catch(() => { /* history is a nice-to-have, not required for the edit to succeed */ })
        }
      } else {
        const contacts = csvFile && csvFile.size > 0 ? parseContacts(await csvFile.text()) : undefined
        const res = await fetch('/api/campaigns', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            company_id: campaign.company_id,   // company is required — carry it from the source campaign
            product_id: campaign.product_id ?? undefined,
            dialing_speed: campaign.dialing_speed,
            window_start: campaign.time_window_start,
            window_end: campaign.time_window_end,
            audio_path: scriptUrl,
            transfer_key: campaign.transfer_key ?? '',
            transfer_target: campaign.transfer_target ?? '',
            ...(contacts ? { contacts } : {}),
          }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to create')
      }
      onDone(); onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // The dropdown's value is the chosen script's URL ('' = none / use the manual field below).
  const dropdownValue = scripts.some(s => s.publicUrl === scriptUrl) ? scriptUrl : ''
  // CallOps 409s a PATCH touching dialing_speed/max_concurrent/sip_trunk_id while running.
  const isRunning = mode === 'edit' && campaign.status === 'running'

  const contactCount = mode === 'edit' ? pendingCount : reuseContactCount
  const estimate = contactCount != null
    ? estimateRunSeconds({ contactCount, scriptSeconds, dialingSpeed: mode === 'edit' ? dialingSpeed : (campaign.dialing_speed ?? 1), maxConcurrent: mode === 'edit' ? maxConcurrent : (campaign.max_concurrent ?? 10) })
    : null

  return (
    <ResponsiveDialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {mode === 'edit' ? 'Edit Campaign' : 'Reuse as Template'}
        <Typography variant="body2" color="text.secondary">
          {mode === 'edit' ? campaign.name : `Clones "${campaign.name}" — change the script and call list, everything else is reused.`}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {mode === 'reuse' && (
            <TextField label="New campaign name" value={name} onChange={e => setName(e.target.value)} fullWidth size="small" />
          )}

          {mode === 'edit' && (
            <>
              <TextField label="Campaign Name" value={name} onChange={e => setName(e.target.value)} fullWidth size="small" required />
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 7 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel id="edit-company-label">Company</InputLabel>
                    <Select labelId="edit-company-label" label="Company" value={companyId}
                      onChange={e => setCompanyId(Number(e.target.value) || '')} displayEmpty>
                      <MenuItem value=""><em>No company</em></MenuItem>
                      {companies.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 5 }}>
                  <FormControl fullWidth size="small" disabled={!companyId}>
                    <InputLabel id="edit-product-label" shrink>Product</InputLabel>
                    <Select labelId="edit-product-label" label="Product" value={productId} displayEmpty notched
                      onChange={e => setProductId(Number(e.target.value) || '')}
                      renderValue={(v) => {
                        if (!v) return <em>No product</em>
                        const p = products.find(x => x.id === v)
                        return p ? p.name : String(v)
                      }}>
                      <MenuItem value={0}><em>No product</em></MenuItem>
                      {products.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                {isRunning && (
                  <Grid size={12}>
                    <Alert severity="info" sx={{ py: 0 }}>
                      Pause this campaign to change dialing speed, max concurrent calls, or the outbound trunk.
                    </Alert>
                  </Grid>
                )}
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField label="Dialing Speed (calls/min)" type="number" size="small" fullWidth
                    disabled={isRunning}
                    value={dialingSpeed} onChange={e => setDialingSpeed(Math.max(1, Number(e.target.value) || 1))}
                    slotProps={{ htmlInput: { min: 1, max: 120 } }} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField label="Max Concurrent Calls" type="number" size="small" fullWidth
                    disabled={isRunning}
                    value={maxConcurrent} onChange={e => setMaxConcurrent(Math.max(1, Number(e.target.value) || 1))}
                    slotProps={{ htmlInput: { min: 1, max: 200 } }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl size="small" fullWidth>
                    <InputLabel id="edit-network-label">Network Filter</InputLabel>
                    <Select labelId="edit-network-label" label="Network Filter" value={networkProvider} displayEmpty
                      onChange={e => setNetworkProvider(e.target.value)}>
                      <MenuItem value="">All networks</MenuItem>
                      <MenuItem value="Vodacom">Vodacom</MenuItem>
                      <MenuItem value="MTN">MTN</MenuItem>
                      <MenuItem value="Cell C">Cell C</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField label="Max Retries" type="number" size="small" fullWidth
                    value={maxRetries} onChange={e => setMaxRetries(Math.max(0, Number(e.target.value) || 0))}
                    slotProps={{ htmlInput: { min: 0, max: 10 } }} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField label="Retry Wait (minutes)" type="number" size="small" fullWidth
                    value={retryCooldownMinutes} onChange={e => setRetryCooldownMinutes(Math.max(1, Number(e.target.value) || 1))}
                    slotProps={{ htmlInput: { min: 1, max: 1440 } }} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField label="Window Start" type="time" size="small" fullWidth
                    value={windowStart} onChange={e => setWindowStart(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField label="Window End" type="time" size="small" fullWidth
                    value={windowEnd} onChange={e => setWindowEnd(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl size="small" fullWidth disabled={isRunning}>
                    <InputLabel id="edit-trunk-label" shrink>Outbound Trunk</InputLabel>
                    <Select labelId="edit-trunk-label" label="Outbound Trunk" value={sipTrunkId} displayEmpty notched
                      onChange={e => setSipTrunkId(e.target.value)}
                      renderValue={(v) => {
                        if (!v) return <em>Default trunk (env)</em>
                        const t = trunks.find(x => String(x.id) === v)
                        return t ? `${t.name} — ${t.from_number}` : v
                      }}>
                      <MenuItem value=""><em>Default trunk (env)</em></MenuItem>
                      {trunks.map(t => <MenuItem key={t.id} value={String(t.id)}>{t.name} — {t.from_number}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField label="Start Date" type="date" size="small" fullWidth
                    value={startDate} onChange={e => setStartDate(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField label="End Date" type="date" size="small" fullWidth
                    value={endDate} onChange={e => setEndDate(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }} />
                </Grid>
              </Grid>
              {estimate && (
                <Alert severity="info" sx={{ py: 0 }}>
                  Estimated remaining run: ~{formatDuration(estimate.estimateSeconds)} for {contactCount?.toLocaleString()} pending contact{contactCount === 1 ? '' : 's'}, bound by{' '}
                  {estimate.rateLimitedSeconds >= estimate.concurrencyLimitedSeconds
                    ? `${dialingSpeed} calls/min`
                    : `${maxConcurrent} concurrent × ${scriptSeconds !== null ? formatDuration(scriptSeconds) : 'no script'}+${DTMF_RESPONSE_SECONDS}s`}
                </Alert>
              )}
            </>
          )}

          {/* Edit: full voice editor — click a saved script to load its text + voice, edit it,
              and generate a new voice. The saved audio URL becomes this campaign's audio_path. */}
          {mode === 'edit' && scriptHistoryLoaded && (
            <VoiceGenerator
              campaignName={campaign.name}
              voiceRecordingUrl={scriptUrl || null}
              onVoiceRecordingUrlChange={url => setScriptUrl(url ?? '')}
              onVoiceIdChange={setVoiceId}
              initialText={scriptText}
              initialVoiceId={savedVoiceId ?? campaign.voice_id ?? null}
              onScriptTextChange={setScriptText}
              disabled={loading}
            />
          )}

          {/* Reuse: a quick saved-script picker (no editing — the template just points at audio). */}
          {mode === 'reuse' && (
            <FormControl fullWidth size="small" disabled={scripts.length === 0}>
              <InputLabel id="script-label">Saved script (S3)</InputLabel>
              <Select labelId="script-label" label="Saved script (S3)" value={dropdownValue}
                onChange={e => setScriptUrl(e.target.value)} displayEmpty>
                <MenuItem value=""><em>{scripts.length === 0 ? 'No saved scripts' : 'Choose a saved script…'}</em></MenuItem>
                {scripts.map(s => <MenuItem key={s.storageKey} value={s.publicUrl}>{s.name}</MenuItem>)}
              </Select>
            </FormControl>
          )}

          <TextField label="…or paste an audio URL" value={scriptUrl} onChange={e => setScriptUrl(e.target.value)}
            fullWidth size="small" placeholder="https://…/script.mp3" />

          {mode === 'reuse' && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Call list (CSV: phone, first_name, last_name) — leave empty to reuse none</Typography>
              <input type="file" accept=".csv" onChange={e => setCsvFile(e.target.files?.[0] ?? null)} />
            </Box>
          )}

          {mode === 'reuse' && estimate && (
            <Alert severity="info" sx={{ py: 0 }}>
              Estimated run: ~{formatDuration(estimate.estimateSeconds)} for {contactCount?.toLocaleString()} contact{contactCount === 1 ? '' : 's'}, bound by{' '}
              {estimate.rateLimitedSeconds >= estimate.concurrencyLimitedSeconds
                ? `${campaign.dialing_speed ?? 1} calls/min`
                : `${campaign.max_concurrent ?? 10} concurrent × ${scriptSeconds !== null ? formatDuration(scriptSeconds) : 'no script'}+${DTMF_RESPONSE_SECONDS}s`}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={loading}>
          {mode === 'edit' ? 'Save' : 'Create from template'}
        </Button>
      </DialogActions>
    </ResponsiveDialog>
  )
}
