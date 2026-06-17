export type Agent = 'seeker' | 'grace' | 'sangoma'
export type CampaignStatus = 'draft' | 'running' | 'paused' | 'completed' | 'deleted'

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
  voice_recording_url?: string
  transfer_key?: string | null
  transfer_target?: string | null
  company_id?: number | null
  company?: string | null
  created_at?: string
  updated_at?: string
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
