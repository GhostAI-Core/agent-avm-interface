/**
 * DEPRECATED as a callops agent selector. callops dispatches a single deployed worker
 * (`outbound-recorder`); do NOT use this union to populate any callops-facing agent/worker
 * selector. It survives ONLY as the type of the existing `campaigns.agent` product label.
 * (Plain doc note, not an `@deprecated` JSDoc tag, so the legitimate product-label uses
 * don't raise deprecation warnings across the build.)
 */
export type Agent = 'seeker' | 'grace' | 'sangoma'
export type CampaignStatus = 'draft' | 'running' | 'paused' | 'stopped' | 'completed' | 'archived' | 'deleted'

export interface Company {
  id: number
  name: string
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
}

export interface DashboardLayout {
  order: string[]
  pinned: string[]
  hidden: string[]
}

export interface DashboardTemplate {
  id: string
  name: string
  layout: DashboardLayout
  created_at?: string
}

export interface Campaign {
  id: number
  name: string
  agent: Agent
  status: CampaignStatus
  dialing_speed: number
  time_window_start: string
  time_window_end: string
  max_concurrent?: number
  max_retries?: number
  retry_cooldown_seconds?: number
  auto_paused?: boolean
  sip_trunk_id?: number | null
  voice_recording_url?: string
  audio_path?: string | null
  /** Full Inworld voice id chosen at script generation; callops uses it to pick the voice-matched two-step-consent confirm audio. */
  voice_id?: string | null
  start_date?: string | null
  end_date?: string | null
  transfer_key?: string | null
  transfer_target?: string | null
  // In-call behavior knobs read by the agent worker (see lib/call-behavior.ts).
  answer_delay_sec?: number | null
  silence_timeout_sec?: number | null
  amd_enabled?: boolean | null
  voicemail_action?: 'hangup' | 'leave_message' | 'continue' | null
  company_id?: number | null
  company?: string | null
  created_at?: string
  updated_at?: string
}

// Live dispatch stats from callops GET /campaigns/{id}/status (via the proxy).
export interface CampaignLiveStatus {
  campaign_id: number
  status: string
  auto_paused?: boolean
  active_calls: number
  queued: number
  pending: number
  in_progress: number
  dialed: number
  failed: number
  retry: number
  completed_today: number
}

/**
 * Aggregates from the `summary` block of callops `GET /campaigns/{id}` (via the proxy).
 * Authoritative campaign roll-up — `opt_out` is only available here, never re-summed client-side.
 */
export interface CampaignSummary {
  contacts_total: number
  pending: number
  in_progress: number
  dialed: number
  failed: number
  retry: number
  calls_total: number
  connected: number
  opt_out: number
}

/**
 * Telephony narrative from callops `GET /calls/{id}/call-report` (via the proxy).
 * The outcome record is intentionally thin; this carries the telephony detail.
 * Field shape is consumed-not-owned — keep optional and tolerate absence.
 */
export interface CallReport {
  call_id?: number | string
  amd_category?: string | null
  sip?: Record<string, unknown> | null
  dtmf_digits?: string | null
  matched_key?: string | null
  playback?: Record<string, unknown> | null
  disconnect_reason?: string | null
  transfer_target?: string | null
  talk_seconds?: number | null
}

/** One model-usage / SDK metric event from callops `GET /calls/{id}/telemetry`. */
export interface TelemetryEvent {
  source: string
  event_type: string
  payload: Record<string, unknown>
  occurred_at?: string
}

/** callops `GET /calls/{id}/telemetry` response: `{ call_id, telemetry: [...] }`. */
export interface Telemetry {
  call_id: number | string
  telemetry: TelemetryEvent[]
}

export interface CampaignReport {
  id: number
  campaign_id: number
  campaign?: { name: string; agent: Agent }
  phone_number: string
  status: string
  dialed: number
  connected: number
  qualified: number
  voicemail: number
  no_speech: number
  hangup: number
  ni: number
  dnq: number
  callback: number
  no_answer: number
  busy_line: number
  failed: number
  duration: string
  cpl: number
  total_spent: number
  called_at?: string
}

export interface CallRecord {
  id: number
  campaign_id: number
  phone: string
  /** Telephony outcome (callops /lookups/call-outcomes): connected, voicemail, no_answer, busy, failed, callback. */
  outcome: string
  /** Business result (callops /lookups/business-dispositions): subscribe, opt_out, callback, interested. Authoritative — supersedes the deprecated agent_outcome. May be null. */
  business_disposition?: string | null
  talk_seconds: number
  cost: number
  transferred: boolean
  recording_url?: string | null
  room?: string | null
  called_at: string
}

/** Raw row the LiveKit agent dumps into `call_events`; a DB trigger ETLs it into call_records. */
export interface CallEvent {
  id: number
  room: string
  campaign_id?: number | null
  contact_id?: number | null
  phone?: string | null
  event_type:
    | 'answered'
    | 'voicemail_detected'
    | 'dropped_no_response'
    | 'outcome'
    | 'recording'
    | 'intent'
    | string
  payload: Record<string, unknown>
  processed: boolean
  created_at: string
}

export interface IntentStat {
  intent_name: string
  step: number
  reached: number
}

export interface IntentWaterfall {
  day: string
  connectedTotal: number
  intents: IntentStat[]
}
