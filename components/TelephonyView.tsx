'use client'

import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Grid from '@mui/material/Grid'
import CircularProgress from '@mui/material/CircularProgress'
import GlassCard from '@/components/ui/GlassCard'
import StatusChip from '@/components/ui/StatusChip'
import CrudSection, { type Column } from '@/components/telephony/CrudSection'
import type { FieldDef, FormValues } from '@/components/telephony/EntityFormDrawer'
import { useTelephonyStore, type TestResult, type DialResult } from '@/lib/telephony-mock'
import { colors } from '@/lib/tokens'
import SipTrunksPanel from '@/components/telephony/SipTrunksPanel'
import type {
  SipProvider, DispatchRule, TelephonyAgent, SystemStatus,
} from '@/types/telephony'

const TABS = ['Settings', 'SIP Providers', 'Outbound Trunks', 'Dispatch Rules', 'Agents', 'Test Dial', 'Status']

export default function TelephonyView() {
  const store = useTelephonyStore()
  const [tab, setTab] = useState(0)

  return (
    <Box>
      <Typography sx={{ fontSize: 22, fontWeight: 800, mb: 0.5 }}>Telephony</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        LiveKit telephony management. SIP Trunks are live via CallOps; the other tabs are still mock (saved to this browser).
      </Typography>

      {/* Custom tab bar — uppercase, letter-spaced, green underline on the active tab (mockup). */}
      <Box sx={{ display: 'flex', gap: 0.5, mb: 3, overflowX: 'auto', borderBottom: `1px solid ${colors.border1}` }}>
        {TABS.map((t, i) => (
          <Box
            component="button"
            key={t}
            type="button"
            onClick={() => setTab(i)}
            sx={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              px: 2,
              pt: 2,
              pb: '13px',
              fontSize: 13,
              letterSpacing: '.04em',
              textTransform: 'uppercase',
              fontWeight: 600,
              whiteSpace: 'nowrap',
              color: tab === i ? colors.greenBright : colors.fg3,
              borderBottom: `2px solid ${tab === i ? colors.green : 'transparent'}`,
              transition: 'color .15s ease, border-color .15s ease',
              '&:hover': { color: colors.greenBright },
            }}
          >
            {t}
          </Box>
        ))}
      </Box>

      {tab === 0 && <SettingsPanel store={store} />}
      {tab === 1 && <ProvidersPanel store={store} />}
      {tab === 2 && <SipTrunksPanel />}
      {tab === 3 && <RulesPanel store={store} />}
      {tab === 4 && <AgentsPanel store={store} />}
      {tab === 5 && <TestDialPanel store={store} />}
      {tab === 6 && <StatusPanel store={store} />}
    </Box>
  )
}

type Store = ReturnType<typeof useTelephonyStore>

/* ── 1. LiveKit Settings ───────────────────────────────────────────────── */
function SettingsPanel({ store }: { store: Store }) {
  const [url, setUrl] = useState(store.settings.url)
  const [key, setKey] = useState(store.settings.api_key)
  const [secret, setSecret] = useState(store.settings.api_secret)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<TestResult | null>(null)

  function save() {
    store.saveSettings({ url, api_key: key, api_secret: secret })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }
  async function runTest() {
    const settings = { url, api_key: key, api_secret: secret }
    store.saveSettings(settings)
    setTesting(true); setTest(null)
    setTest(await store.testConnection(settings))
    setTesting(false)
  }

  return (
    <Paper sx={{ p: 3, maxWidth: 620 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>LiveKit Settings</Typography>
      <Stack spacing={2}>
        {saved && <Alert severity="success">Settings saved.</Alert>}
        {test && <Alert severity={test.ok ? 'success' : 'error'}>{test.message}</Alert>}
        <TextField label="Server URL" size="small" fullWidth value={url}
          onChange={(e) => setUrl(e.target.value)} placeholder="wss://your-project.livekit.cloud" />
        <TextField label="API Key" size="small" fullWidth value={key}
          onChange={(e) => setKey(e.target.value)} />
        <TextField label="API Secret" type="password" size="small" fullWidth value={secret}
          onChange={(e) => setSecret(e.target.value)} />
        <Stack direction="row" spacing={1.5}>
          <Button variant="contained" onClick={save}>Save</Button>
          <Button variant="outlined" onClick={runTest} disabled={testing}
            startIcon={testing ? <CircularProgress size={16} /> : undefined}>
            {testing ? 'Testing…' : 'Test Connection'}
          </Button>
        </Stack>
      </Stack>
    </Paper>
  )
}

/* ── 2. SIP Providers ──────────────────────────────────────────────────── */
function ProvidersPanel({ store }: { store: Store }) {
  const fields: FieldDef[] = [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'host', label: 'Host', type: 'text', required: true, placeholder: 'sip.provider.com' },
    { name: 'username', label: 'Username', type: 'text', required: true },
    { name: 'password', label: 'Password', type: 'password' },
    { name: 'caller_id', label: 'Caller ID', type: 'text', placeholder: '+27 11 234 5678' },
    { name: 'enabled', label: 'Enabled', type: 'switch' },
  ]
  const columns: Column<SipProvider>[] = [
    { key: 'name', label: 'Name' },
    { key: 'host', label: 'Host' },
    { key: 'username', label: 'Username' },
    { key: 'caller_id', label: 'Caller ID', render: (r) => r.caller_id || '—' },
  ]
  const fromForm = (v: FormValues): Omit<SipProvider, 'id'> => ({
    name: String(v.name ?? ''), host: String(v.host ?? ''), username: String(v.username ?? ''),
    password: String(v.password ?? ''), caller_id: v.caller_id ? String(v.caller_id) : undefined,
    enabled: Boolean(v.enabled),
  })
  return (
    <CrudSection<SipProvider>
      title="SIP Providers" entityLabel="Provider"
      items={store.providers} columns={columns} fields={fields}
      rowKey={(r) => r.id}
      toFormValues={(r) => ({ name: r.name, host: r.host, username: r.username, password: r.password, caller_id: r.caller_id ?? '', enabled: r.enabled })}
      emptyForm={{ name: '', host: '', username: '', password: '', caller_id: '', enabled: true }}
      onCreate={(v) => store.createProvider(fromForm(v))}
      onUpdate={(id, v) => store.updateProvider(id, fromForm(v))}
      onDelete={store.deleteProvider}
      onToggle={store.toggleProvider}
    />
  )
}

/* ── 4. Dispatch Rules ─────────────────────────────────────────────────── */
function RulesPanel({ store }: { store: Store }) {
  const fields: FieldDef[] = [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'agent_name', label: 'Agent Name', type: 'text', required: true },
    { name: 'room_prefix', label: 'Room Prefix', type: 'text', required: true, placeholder: 'grace_' },
    { name: 'enabled', label: 'Enabled', type: 'switch' },
  ]
  const columns: Column<DispatchRule>[] = [
    { key: 'name', label: 'Name' },
    { key: 'agent_name', label: 'Agent' },
    { key: 'room_prefix', label: 'Room Prefix' },
  ]
  const fromForm = (v: FormValues): Omit<DispatchRule, 'id'> => ({
    name: String(v.name ?? ''), agent_name: String(v.agent_name ?? ''),
    room_prefix: String(v.room_prefix ?? ''), enabled: Boolean(v.enabled),
  })
  return (
    <CrudSection<DispatchRule>
      title="Dispatch Rules" entityLabel="Rule"
      items={store.rules} columns={columns} fields={fields}
      rowKey={(r) => r.id}
      toFormValues={(r) => ({ name: r.name, agent_name: r.agent_name, room_prefix: r.room_prefix, enabled: r.enabled })}
      emptyForm={{ name: '', agent_name: '', room_prefix: '', enabled: true }}
      onCreate={(v) => store.createRule(fromForm(v))}
      onUpdate={(id, v) => store.updateRule(id, fromForm(v))}
      onDelete={store.deleteRule}
      onToggle={store.toggleRule}
    />
  )
}

/* ── 5. Agents ─────────────────────────────────────────────────────────── */
function AgentsPanel({ store }: { store: Store }) {
  const fields: FieldDef[] = [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'type', label: 'Type', type: 'select', required: true,
      options: [{ value: 'voice', label: 'Voice' }, { value: 'ivr', label: 'IVR' }] },
    { name: 'description', label: 'Description', type: 'text' },
    { name: 'enabled', label: 'Enabled', type: 'switch' },
  ]
  const columns: Column<TelephonyAgent>[] = [
    { key: 'name', label: 'Name' },
    { key: 'type', label: 'Type', render: (r) => r.type.toUpperCase() },
    { key: 'description', label: 'Description', render: (r) => r.description || '—' },
  ]
  const fromForm = (v: FormValues): Omit<TelephonyAgent, 'id'> => ({
    name: String(v.name ?? ''), type: v.type === 'ivr' ? 'ivr' : 'voice',
    description: v.description ? String(v.description) : undefined, enabled: Boolean(v.enabled),
  })
  return (
    <CrudSection<TelephonyAgent>
      title="Agents" entityLabel="Agent"
      items={store.agents} columns={columns} fields={fields}
      rowKey={(r) => r.id}
      toFormValues={(r) => ({ name: r.name, type: r.type, description: r.description ?? '', enabled: r.enabled })}
      emptyForm={{ name: '', type: 'voice', description: '', enabled: true }}
      onCreate={(v) => store.createAgent(fromForm(v))}
      onUpdate={(id, v) => store.updateAgent(id, fromForm(v))}
      onDelete={store.deleteAgent}
      onToggle={store.toggleAgent}
    />
  )
}

/* ── 6. Test Dial ──────────────────────────────────────────────────────── */
function TestDialPanel({ store }: { store: Store }) {
  const [phone, setPhone] = useState('')
  const [agent, setAgent] = useState('')
  const [trunk, setTrunk] = useState('')
  const [dialing, setDialing] = useState(false)
  const [result, setResult] = useState<DialResult | null>(null)

  async function placeCall() {
    setDialing(true); setResult(null)
    setResult(await store.placeTestCall({ phone_number: phone, agent_name: agent, trunk_id: trunk }))
    setDialing(false)
  }

  return (
    <Paper sx={{ p: 3, maxWidth: 620 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>Test Dial</Typography>
      <Stack spacing={2}>
        {result && <Alert severity={result.ok ? 'success' : 'error'}>{result.message}</Alert>}
        <TextField label="Phone Number" size="small" fullWidth value={phone}
          onChange={(e) => setPhone(e.target.value)} placeholder="+27 82 123 4567" />
        <TextField label="Agent" size="small" fullWidth select value={agent}
          onChange={(e) => setAgent(e.target.value)}>
          {store.agents.map((a) => <MenuItem key={a.id} value={a.name}>{a.name}</MenuItem>)}
        </TextField>
        <TextField label="Trunk" size="small" fullWidth select value={trunk}
          onChange={(e) => setTrunk(e.target.value)}>
          {store.trunks.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
        </TextField>
        <Box>
          <Button variant="contained" onClick={placeCall} disabled={dialing}
            startIcon={dialing ? <CircularProgress size={16} /> : undefined}>
            {dialing ? 'Placing…' : 'Place Test Call'}
          </Button>
        </Box>
      </Stack>
    </Paper>
  )
}

/* ── 7. System Status ──────────────────────────────────────────────────── */
function StatusPanel({ store }: { store: Store }) {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(false)

  async function refresh() {
    setLoading(true)
    setStatus(await store.fetchStatus())
    setLoading(false)
  }
  // Initial load: resolve asynchronously so we never setState synchronously in the effect body.
  useEffect(() => {
    let active = true
    store.fetchStatus().then((s) => { if (active) setStatus(s) })
    return () => { active = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cards: { label: string; value: SystemStatus[keyof SystemStatus] | undefined }[] = [
    { label: 'LiveKit', value: status?.livekit },
    { label: 'SIP', value: status?.sip },
    { label: 'Redis', value: status?.redis },
  ]

  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>System Status</Typography>
        <Button variant="outlined" onClick={refresh} disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : undefined}>
          {loading ? 'Checking…' : 'Refresh'}
        </Button>
      </Stack>
      <Grid container spacing={2}>
        {cards.map((c) => (
          <Grid key={c.label} size={{ xs: 12, sm: 4 }}>
            <GlassCard sx={{ p: 2.5 }}>
              <Typography variant="overline" color="text.secondary">{c.label}</Typography>
              <Box sx={{ mt: 1 }}>
                <StatusChip status={c.value ?? 'unknown'} />
              </Box>
            </GlassCard>
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
