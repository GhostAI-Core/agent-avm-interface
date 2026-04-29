export type Agent = 'seeker' | 'grace' | 'sangoma'
export type CampaignStatus = 'draft' | 'running' | 'paused' | 'completed' | 'deleted'

export interface Campaign {
  id: number
  name: string
  agent: Agent
  status: CampaignStatus
  dialing_speed: number
  time_window_start: string
  time_window_end: string
  voice_recording_url?: string
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
