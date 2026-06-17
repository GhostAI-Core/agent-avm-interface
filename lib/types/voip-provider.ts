export type ProviderType = 'twilio' | 'telnyx' | 'sangoma' | 'utility_connect'

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
