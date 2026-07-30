// Node spec registry — the source of truth for the flow builder. Every node is a configurable
// step: it exposes typed fields (so its behaviour can be changed) and declares how it routes
// (single out, branch with labelled outs, or a terminal). Anything that can't affect the pipeline
// is intentionally absent. The palette and the inspector are both generated from this.
import { colors } from '@/lib/tokens'

export type Field =
  | { key: string; label: string; type: 'number'; def: number; unit?: string; min?: number; max?: number }
  | { key: string; label: string; type: 'text'; def: string; placeholder?: string }
  | { key: string; label: string; type: 'toggle'; def: boolean }
  | { key: string; label: string; type: 'select'; def: string; options: string[] }

export type SpecIO = 'start' | 'end' | 'config' | 'action' | 'branch'
export type NodeSpec = {
  key: string
  group: string
  accent: string
  label: string
  io: SpecIO
  fields: Field[]
  outputs?: string[]                       // branch out-handle labels (left→right)
  summary?: (p: Record<string, ParamValue>) => string
}
export type ParamValue = string | number | boolean

const A = {
  dial: colors.green, connect: colors.greenBright, engage: colors.glow,
  dtmf: colors.info, action: colors.warning, compliance: colors.negative, flow: colors.fg3,
}

export const SPECS: NodeSpec[] = [
  // ── Dial ──────────────────────────────────────────────────────────────────────
  { key: 'caller-id', group: 'Dial', accent: A.dial, label: 'Caller ID', io: 'config',
    fields: [{ key: 'callerId', label: 'Presented number', type: 'text', def: '', placeholder: '+27 11 000 0000' }],
    summary: p => (p.callerId ? String(p.callerId) : 'campaign default') },
  { key: 'select-trunk', group: 'Dial', accent: A.dial, label: 'Select Trunk', io: 'config',
    fields: [{ key: 'trunk', label: 'Trunk', type: 'select', def: 'Auto', options: ['Auto', 'Twilio', 'Telnyx', 'SIP-A', 'SIP-B'] }],
    summary: p => String(p.trunk) },
  { key: 'routing-mode', group: 'Dial', accent: A.dial, label: 'Routing Mode', io: 'config',
    fields: [{ key: 'mode', label: 'Mode', type: 'select', def: 'STS relay', options: ['STS relay', 'Direct'] }],
    summary: p => String(p.mode) },
  { key: 'answer-delay', group: 'Dial', accent: A.dial, label: 'Answer Delay', io: 'config',
    fields: [{ key: 'seconds', label: 'Delay', type: 'number', def: 2, unit: 's', min: 0, max: 30 }],
    summary: p => `${p.seconds}s` },
  { key: 'ring-timeout', group: 'Dial', accent: A.dial, label: 'Ring Timeout', io: 'config',
    fields: [{ key: 'seconds', label: 'Timeout', type: 'number', def: 25, unit: 's', min: 5, max: 120 }],
    summary: p => `${p.seconds}s` },
  { key: 'max-attempts', group: 'Dial', accent: A.dial, label: 'Max Attempts', io: 'config',
    fields: [{ key: 'attempts', label: 'Attempts', type: 'number', def: 3, min: 1, max: 10 }],
    summary: p => `${p.attempts}×` },
  { key: 'retry-no-answer', group: 'Dial', accent: A.dial, label: 'Retry on No-Answer', io: 'config',
    fields: [{ key: 'attempts', label: 'Retries', type: 'number', def: 2, min: 0, max: 10 }, { key: 'delayMin', label: 'Delay', type: 'number', def: 60, unit: 'min' }],
    summary: p => `${p.attempts}× / ${p.delayMin}min` },
  { key: 'amd-detection', group: 'Dial', accent: A.dial, label: 'AMD Detection', io: 'config',
    fields: [{ key: 'enabled', label: 'Enabled', type: 'toggle', def: true }, { key: 'sensitivity', label: 'Sensitivity', type: 'select', def: 'Medium', options: ['Low', 'Medium', 'High'] }],
    summary: p => (p.enabled ? `on · ${p.sensitivity}` : 'off') },
  { key: 'voicemail-action', group: 'Dial', accent: A.dial, label: 'Voicemail Action', io: 'config',
    fields: [{ key: 'action', label: 'On voicemail', type: 'select', def: 'Hang up', options: ['Leave message', 'Hang up', 'None'] }],
    summary: p => String(p.action) },
  { key: 'rate-limit', group: 'Dial', accent: A.dial, label: 'Rate / Concurrency', io: 'config',
    fields: [{ key: 'perMinute', label: 'Calls', type: 'number', def: 30, unit: '/min', min: 1 }],
    summary: p => `${p.perMinute}/min` },
  { key: 'schedule-window', group: 'Dial', accent: A.dial, label: 'Schedule Window', io: 'config',
    fields: [{ key: 'start', label: 'From', type: 'text', def: '09:00' }, { key: 'end', label: 'To', type: 'text', def: '17:00' }, { key: 'days', label: 'Days', type: 'select', def: 'Mon–Fri', options: ['Mon–Fri', 'Every day', 'Weekends'] }],
    summary: p => `${p.start}–${p.end} ${p.days}` },
  { key: 'compliance-gate', group: 'Dial', accent: A.dial, label: 'Pre-dial Gate', io: 'config',
    fields: [{ key: 'consent', label: 'Require consent', type: 'toggle', def: true }, { key: 'suppression', label: 'Check suppression', type: 'toggle', def: true }],
    summary: p => [p.consent ? 'consent' : null, p.suppression ? 'suppression' : null].filter(Boolean).join(' + ') || 'off' },

  // ── Connect / Answer ────────────────────────────────────────────────────────────
  { key: 'call-result', group: 'Connect / Answer', accent: A.connect, label: 'Call Result', io: 'branch',
    fields: [], outputs: ['Answered', 'No Answer', 'Busy', 'Failed'] },
  { key: 'amd-result', group: 'Connect / Answer', accent: A.connect, label: 'AMD Result', io: 'branch',
    fields: [], outputs: ['Human', 'Machine'] },
  { key: 'silence-timeout', group: 'Connect / Answer', accent: A.connect, label: 'Silence Timeout', io: 'config',
    fields: [{ key: 'seconds', label: 'Timeout', type: 'number', def: 6, unit: 's', min: 1, max: 30 }],
    summary: p => `${p.seconds}s` },

  // ── Engage / Playback ─────────────────────────────────────────────────────────
  { key: 'play-audio', group: 'Engage / Playback', accent: A.engage, label: 'Play Audio', io: 'action',
    fields: [{ key: 'source', label: 'Source', type: 'select', def: 'Intro clip', options: ['Intro clip', 'Uploaded audio', 'Product script'] }, { key: 'name', label: 'Clip name', type: 'text', def: '' }],
    summary: p => String(p.name || p.source) },
  { key: 'play-tts', group: 'Engage / Playback', accent: A.engage, label: 'Play Message (TTS)', io: 'action',
    fields: [{ key: 'message', label: 'Message', type: 'text', def: 'Hi, this is …' }, { key: 'voice', label: 'Voice', type: 'select', def: 'Seeker', options: ['Seeker', 'Grace', 'Custom'] }],
    summary: p => `"${String(p.message).slice(0, 22)}…"` },
  { key: 'wait', group: 'Engage / Playback', accent: A.engage, label: 'Wait / Pause', io: 'config',
    fields: [{ key: 'seconds', label: 'Wait', type: 'number', def: 2, unit: 's', min: 0, max: 30 }],
    summary: p => `${p.seconds}s` },
  { key: 'repeat', group: 'Engage / Playback', accent: A.engage, label: 'Repeat Message', io: 'config',
    fields: [{ key: 'times', label: 'Times', type: 'number', def: 1, min: 1, max: 5 }],
    summary: p => `${p.times}×` },
  { key: 'barge-in', group: 'Engage / Playback', accent: A.engage, label: 'Barge-in', io: 'config',
    fields: [{ key: 'enabled', label: 'Allow interrupt', type: 'toggle', def: true }],
    summary: p => (p.enabled ? 'on' : 'off') },

  // ── Input / DTMF ────────────────────────────────────────────────────────────────
  { key: 'collect-dtmf', group: 'Input / DTMF', accent: A.dtmf, label: 'Collect DTMF', io: 'config',
    fields: [{ key: 'maxDigits', label: 'Max digits', type: 'number', def: 1, min: 1, max: 8 }, { key: 'timeout', label: 'Timeout', type: 'number', def: 4, unit: 's' }],
    summary: p => `${p.maxDigits} digit / ${p.timeout}s` },
  { key: 'dtmf-key', group: 'Input / DTMF', accent: A.dtmf, label: 'On Key', io: 'branch',
    fields: [{ key: 'key', label: 'Key', type: 'text', def: '1' }], outputs: ['match', 'else'],
    summary: p => `key = ${p.key}` },
  { key: 'speech-intent', group: 'Input / DTMF', accent: A.dtmf, label: 'On Intent', io: 'branch',
    fields: [{ key: 'intent', label: 'Intent', type: 'text', def: 'interested' }], outputs: ['match', 'else'],
    summary: p => `intent = ${p.intent}` },

  // ── Actions / Outcome ─────────────────────────────────────────────────────────
  { key: 'mark-lead', group: 'Actions / Outcome', accent: A.action, label: 'Mark Lead', io: 'action',
    fields: [{ key: 'tag', label: 'Tag', type: 'select', def: 'Lead', options: ['Lead', 'Hot Lead'] }], summary: p => String(p.tag) },
  { key: 'mark-qualified', group: 'Actions / Outcome', accent: A.action, label: 'Mark Qualified', io: 'action',
    fields: [{ key: 'tier', label: 'Tier', type: 'select', def: 'Qualified', options: ['Qualified', 'Subscribed'] }], summary: p => String(p.tier) },
  { key: 'sts-subscribe', group: 'Actions / Outcome', accent: A.action, label: 'STS Subscribe', io: 'action',
    fields: [{ key: 'productKey', label: 'Product key', type: 'text', def: '' }], summary: p => String(p.productKey || 'STS SUBSCRIBE') },
  { key: 'transfer', group: 'Actions / Outcome', accent: A.action, label: 'Transfer to Agent', io: 'action',
    fields: [{ key: 'target', label: 'Target (SIP/number)', type: 'text', def: '' }, { key: 'dtmfKey', label: 'Trigger key', type: 'text', def: '2' }],
    summary: p => `→ ${p.target || 'agent'} (key ${p.dtmfKey})` },
  { key: 'whatsapp', group: 'Actions / Outcome', accent: A.action, label: 'Send WhatsApp', io: 'action',
    fields: [{ key: 'template', label: 'Template', type: 'text', def: 'welcome' }, { key: 'immediate', label: 'Send immediately', type: 'toggle', def: true }],
    summary: p => `${p.template}${p.immediate ? '' : ' (queued)'}` },
  { key: 'callback', group: 'Actions / Outcome', accent: A.action, label: 'Callback / Reschedule', io: 'action',
    fields: [{ key: 'delayHours', label: 'Delay', type: 'number', def: 24, unit: 'h' }], summary: p => `+${p.delayHours}h` },
  { key: 'hang-up', group: 'Actions / Outcome', accent: A.action, label: 'Hang Up', io: 'action',
    fields: [{ key: 'reason', label: 'Reason', type: 'select', def: 'Completed', options: ['Completed', 'Declined', 'Error'] }], summary: p => String(p.reason) },

  // ── Compliance ────────────────────────────────────────────────────────────────
  { key: 'consent-gate', group: 'Compliance', accent: A.compliance, label: 'Consent Gate', io: 'branch',
    fields: [{ key: 'basis', label: 'Legal basis', type: 'select', def: 'Prior consent', options: ['Prior consent', 'Legitimate interest'] }], outputs: ['pass', 'block'],
    summary: p => String(p.basis) },
  { key: 'suppression-check', group: 'Compliance', accent: A.compliance, label: 'Suppression Check', io: 'branch',
    fields: [], outputs: ['clear', 'suppressed'] },
  { key: 'dnc-check', group: 'Compliance', accent: A.compliance, label: 'DNC Check', io: 'branch',
    fields: [], outputs: ['clear', 'listed'] },
  { key: 'opt-out', group: 'Compliance', accent: A.compliance, label: 'Opt-out / Suppress', io: 'action',
    fields: [{ key: 'addToSuppression', label: 'Add to suppression list', type: 'toggle', def: true }],
    summary: p => (p.addToSuppression ? 'suppress + opt-out' : 'opt-out') },

  // ── Flow ────────────────────────────────────────────────────────────────────────
  { key: 'start', group: 'Flow', accent: A.flow, label: 'Start', io: 'start', fields: [] },
  { key: 'end', group: 'Flow', accent: A.flow, label: 'End', io: 'end', fields: [] },
]

export const SPEC_BY_KEY: Record<string, NodeSpec> = Object.fromEntries(SPECS.map(s => [s.key, s]))

export function defaultParams(spec: NodeSpec): Record<string, ParamValue> {
  return Object.fromEntries(spec.fields.map(f => [f.key, f.def]))
}

export const GROUPS: { group: string; accent: string; keys: string[] }[] = (() => {
  const order: string[] = []
  const by: Record<string, { accent: string; keys: string[] }> = {}
  for (const s of SPECS) {
    if (!by[s.group]) { by[s.group] = { accent: s.accent, keys: [] }; order.push(s.group) }
    by[s.group].keys.push(s.key)
  }
  return order.map(g => ({ group: g, accent: by[g].accent, keys: by[g].keys }))
})()
