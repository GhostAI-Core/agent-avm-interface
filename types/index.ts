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
  outcome: string
  talk_seconds: number
  cost: number
  transferred: boolean
  recording_url?: string | null
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
