'use client'

// Mock telephony store for issue #27. State is seeded, mutated locally, and
// persisted to localStorage so edits survive a refresh. Every method is named
// after its future endpoint so Phase 2 (real API wiring) is a drop-in: replace
// each body with a fetch and keep the call sites unchanged.

import { useCallback, useEffect, useState } from 'react'
import type {
  LiveKitSettings,
  SipProvider,
  OutboundTrunk,
  DispatchRule,
  TelephonyAgent,
  DialRequest,
  SystemStatus,
} from '@/types/telephony'

const LS_KEY = 'voxi.telephony.mock.v1'

function uid(): string {
  // crypto.randomUUID is available in all target browsers; fall back just in case.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id_${Math.floor(performance.now() * 1000).toString(36)}`
}

type TelephonyData = {
  settings: LiveKitSettings
  providers: SipProvider[]
  trunks: OutboundTrunk[]
  rules: DispatchRule[]
  agents: TelephonyAgent[]
}

function seed(): TelephonyData {
  return {
    settings: { url: '', api_key: '', api_secret: '' },
    providers: [
      { id: uid(), name: 'Utility Connect', host: 'sip.utilityconnect.io', username: 'voxi', password: '', caller_id: '+27 11 234 5678', enabled: true },
      { id: uid(), name: 'Twilio', host: 'voxi.pstn.twilio.com', username: 'AC_voxi', password: '', caller_id: '+27 21 345 6789', enabled: true },
      { id: uid(), name: 'Telnyx', host: 'sip.telnyx.com', username: 'voxi_tx', password: '', caller_id: '+27 87 150 1234', enabled: false },
    ],
    trunks: [],
    rules: [
      { id: uid(), name: 'Grace VOIP', agent_name: 'grace', room_prefix: 'grace_', enabled: true },
      { id: uid(), name: 'Seeker VOIP', agent_name: 'seeker', room_prefix: 'seeker_', enabled: true },
      { id: uid(), name: 'Outbound IVR', agent_name: 'ivr', room_prefix: 'ivr_', enabled: false },
    ],
    agents: [
      { id: uid(), name: 'grace', type: 'voice', description: 'Empathetic outbound voice agent', enabled: true },
      { id: uid(), name: 'seeker', type: 'voice', description: 'Qualification-focused voice agent', enabled: true },
      { id: uid(), name: 'outbound-ivr', type: 'ivr', description: 'Menu-driven IVR flow', enabled: false },
    ],
  }
}

function load(): TelephonyData | null {
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as TelephonyData) : null
  } catch {
    return null
  }
}

export type TestResult = { ok: boolean; message: string }
export type DialResult = { ok: boolean; room?: string; message: string }
// Trunk create/update + test-call go through the real callops proxies (not the mock store).
export type TrunkSaveResult = { ok: boolean; trunk_id?: string; message: string }
export type TrunkTestResult = { ok: boolean; sip_status?: string; message: string }

export type TelephonyStore = {
  // LiveKit settings
  settings: LiveKitSettings
  saveSettings: (next: LiveKitSettings) => void
  testConnection: (settings: LiveKitSettings) => Promise<TestResult>
  // SIP providers
  providers: SipProvider[]
  createProvider: (values: Omit<SipProvider, 'id'>) => void
  updateProvider: (id: string, values: Partial<SipProvider>) => void
  deleteProvider: (id: string) => void
  toggleProvider: (id: string) => void
  // Outbound trunks. createTrunk/updateTrunk/deleteTrunk mirror the local store; saveTrunk
  // (create), patchTrunk (edit), deleteTrunkRemote (delete) and testTrunkCall hit the real
  // callops proxies (server-side, secret-protected). Edit/delete address the LiveKit trunk_id.
  trunks: OutboundTrunk[]
  createTrunk: (values: Omit<OutboundTrunk, 'id'>) => void
  updateTrunk: (id: string, values: Partial<OutboundTrunk>) => void
  deleteTrunk: (id: string) => void
  toggleTrunk: (id: string) => void
  saveTrunk: (values: Omit<OutboundTrunk, 'id'>) => Promise<TrunkSaveResult>
  patchTrunk: (trunkId: string, values: Partial<Pick<OutboundTrunk, 'name' | 'address' | 'numbers' | 'auth_username' | 'auth_password'>>) => Promise<TrunkSaveResult>
  deleteTrunkRemote: (trunkId: string) => Promise<TestResult>
  testTrunkCall: (sipTrunkId: string, phone: string) => Promise<TrunkTestResult>
  // Dispatch rules
  rules: DispatchRule[]
  createRule: (values: Omit<DispatchRule, 'id'>) => void
  updateRule: (id: string, values: Partial<DispatchRule>) => void
  deleteRule: (id: string) => void
  toggleRule: (id: string) => void
  // Agents
  agents: TelephonyAgent[]
  createAgent: (values: Omit<TelephonyAgent, 'id'>) => void
  updateAgent: (id: string, values: Partial<TelephonyAgent>) => void
  deleteAgent: (id: string) => void
  toggleAgent: (id: string) => void
  // Test dial + status
  placeTestCall: (req: DialRequest) => Promise<DialResult>
  fetchStatus: () => Promise<SystemStatus>
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function useTelephonyStore(): TelephonyStore {
  // Lazy init from localStorage. This hook only runs inside TelephonyView, which
  // mounts purely client-side (behind the auth gate), so there's no SSR/hydration
  // mismatch to worry about.
  const [data, setData] = useState<TelephonyData>(() => {
    if (typeof window !== 'undefined') {
      const saved = load()
      if (saved) return { ...seed(), ...saved }
    }
    return seed()
  })

  // Persist on change (writing to an external system — the correct use of an effect).
  useEffect(() => {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(data))
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [data])

  // Generic list helpers keep each entity's CRUD to one line.
  const addTo = useCallback(
    <K extends 'providers' | 'trunks' | 'rules' | 'agents'>(key: K, item: TelephonyData[K][number]) =>
      setData((d) => ({ ...d, [key]: [item, ...d[key]] })),
    [],
  )
  const patchIn = useCallback(
    <K extends 'providers' | 'trunks' | 'rules' | 'agents'>(key: K, id: string, values: Partial<TelephonyData[K][number]>) =>
      setData((d) => ({
        ...d,
        [key]: d[key].map((row) => (row.id === id ? { ...row, ...values } : row)),
      })),
    [],
  )
  const removeFrom = useCallback(
    <K extends 'providers' | 'trunks' | 'rules' | 'agents'>(key: K, id: string) =>
      setData((d) => ({ ...d, [key]: d[key].filter((row) => row.id !== id) })),
    [],
  )
  const toggleIn = useCallback(
    <K extends 'providers' | 'trunks' | 'rules' | 'agents'>(key: K, id: string) =>
      setData((d) => ({
        ...d,
        [key]: d[key].map((row) => (row.id === id ? { ...row, enabled: !row.enabled } : row)),
      })),
    [],
  )

  return {
    settings: data.settings,
    saveSettings: (next) => setData((d) => ({ ...d, settings: next })),
    testConnection: async (s) => {
      await delay(700)
      if (!s.url || !s.api_key || !s.api_secret) {
        return { ok: false, message: 'Missing URL, API key, or API secret.' }
      }
      return { ok: true, message: `Connected to ${s.url}` }
    },

    providers: data.providers,
    createProvider: (values) => addTo('providers', { ...values, id: uid() }),
    updateProvider: (id, values) => patchIn('providers', id, values),
    deleteProvider: (id) => removeFrom('providers', id),
    toggleProvider: (id) => toggleIn('providers', id),

    trunks: data.trunks,
    createTrunk: (values) => addTo('trunks', { ...values, id: uid() }),
    updateTrunk: (id, values) => patchIn('trunks', id, values),
    deleteTrunk: (id) => removeFrom('trunks', id),
    toggleTrunk: (id) => toggleIn('trunks', id),

    // POST → /api/trunks proxy → callops /livekit/trunks (CREATE only — edits go via patchTrunk).
    // callops returns { trunk_id, name, address, numbers, auth_username } (no auth_password).
    saveTrunk: async (values) => {
      try {
        const res = await fetch('/api/trunks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: values.name,
            address: values.address,
            numbers: values.numbers,
            auth_username: values.auth_username,
            auth_password: values.auth_password ?? '',
          }),
        })
        const json = (await res.json().catch(() => ({}))) as { trunk_id?: string; error?: string }
        if (!res.ok) {
          return { ok: false, message: json.error ?? `Save failed (${res.status}).` }
        }
        return { ok: true, trunk_id: json.trunk_id, message: `Trunk "${values.name}" saved.` }
      } catch {
        return { ok: false, message: 'Could not reach the dashboard API.' }
      }
    },

    // PATCH → /api/trunks/{trunk_id} proxy → callops PATCH /livekit/trunks/{trunk_id}. Body is
    // the already-diffed set of changed fields (caller omits a blank password = "unchanged").
    patchTrunk: async (trunkId, values) => {
      try {
        const res = await fetch(`/api/trunks/${encodeURIComponent(trunkId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        })
        const json = (await res.json().catch(() => ({}))) as { trunk_id?: string; error?: string }
        if (!res.ok) {
          return { ok: false, message: json.error ?? `Update failed (${res.status}).` }
        }
        return { ok: true, trunk_id: json.trunk_id, message: 'Trunk updated.' }
      } catch {
        return { ok: false, message: 'Could not reach the dashboard API.' }
      }
    },

    // DELETE → /api/trunks/{trunk_id} proxy → callops DELETE /livekit/trunks/{trunk_id}.
    deleteTrunkRemote: async (trunkId) => {
      try {
        const res = await fetch(`/api/trunks/${encodeURIComponent(trunkId)}`, { method: 'DELETE' })
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) {
          return { ok: false, message: json.error ?? `Delete failed (${res.status}).` }
        }
        return { ok: true, message: 'Trunk deleted.' }
      } catch {
        return { ok: false, message: 'Could not reach the dashboard API.' }
      }
    },

    // POST → /api/trunks/test-call proxy → callops /livekit/test-call. A failed *call* still
    // returns 200 with ok:false; only request/upstream faults are non-2xx.
    testTrunkCall: async (sipTrunkId, phone) => {
      if (!phone) return { ok: false, message: 'Phone number is required.' }
      if (!sipTrunkId) return { ok: false, message: 'Select a trunk.' }
      try {
        const res = await fetch('/api/trunks/test-call', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, sip_trunk_id: sipTrunkId }),
        })
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean; sip_status?: string; message?: string; error?: string
        }
        if (!res.ok) {
          return { ok: false, message: json.error ?? `Test call failed (${res.status}).` }
        }
        const ok = Boolean(json.ok)
        const detail = [json.sip_status, json.message].filter(Boolean).join(' — ')
        return {
          ok,
          sip_status: json.sip_status,
          message: detail || (ok ? `Test call to ${phone} connected.` : `Test call to ${phone} did not connect.`),
        }
      } catch {
        return { ok: false, message: 'Could not reach the dashboard API.' }
      }
    },

    rules: data.rules,
    createRule: (values) => addTo('rules', { ...values, id: uid() }),
    updateRule: (id, values) => patchIn('rules', id, values),
    deleteRule: (id) => removeFrom('rules', id),
    toggleRule: (id) => toggleIn('rules', id),

    agents: data.agents,
    createAgent: (values) => addTo('agents', { ...values, id: uid() }),
    updateAgent: (id, values) => patchIn('agents', id, values),
    deleteAgent: (id) => removeFrom('agents', id),
    toggleAgent: (id) => toggleIn('agents', id),

    placeTestCall: async (req) => {
      await delay(900)
      if (!req.phone_number) return { ok: false, message: 'Phone number is required.' }
      if (!req.agent_name) return { ok: false, message: 'Select an agent.' }
      if (!req.trunk_id) return { ok: false, message: 'Select a trunk.' }
      const room = `voxi_test_${uid().slice(0, 8)}`
      return { ok: true, room, message: `Dispatched test call to ${req.phone_number} (room ${room}).` }
    },

    fetchStatus: async () => {
      await delay(500)
      return { livekit: 'connected', sip: 'connected', redis: 'connected' }
    },
  }
}
