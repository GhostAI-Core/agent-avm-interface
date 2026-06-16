export type RoutrSyncStatus = 'pending' | 'synced' | 'error'

export type ProviderType = 'twilio' | 'telnyx' | 'sangoma' | 'utility_connect'

export type CampaignRoutingMode = 'legacy' | 'routr'

export interface VoipProvider {
  id: number
  name: string
  api_key?: string | null
  api_secret?: string | null
  slug: string
  provider_type: ProviderType
  sip_host?: string | null
  sip_port: number
  sip_username?: string | null
  sip_password?: string | null
  send_register: boolean
  routr_trunk_ref?: string | null
  routr_credentials_ref?: string | null
  sync_status: RoutrSyncStatus
  sync_error?: string | null
  last_synced_at?: string | null
  created_at?: string
}

export interface CarrierProviderForm {
  name: string
  slug: string
  provider_type: ProviderType
  sip_host: string
  sip_port: number
  sip_username: string
  sip_password: string
  send_register: boolean
}

export interface LiveKitPeerSettings {
  sip_host: string
  allowed_cidrs?: string
  peer_username: string
  peer_password?: string
}

export const ROUTR_LIVEKIT_SETTINGS_KEY = 'routr_livekit_peer'
