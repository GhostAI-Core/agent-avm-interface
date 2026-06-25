// Telephony management UI types — mirror the mock schemas in issue #27.
// These are the provisional contract; field names are kept exact so the mock
// store can be swapped for the real API endpoints (Phase 2) without redesign.

export type LiveKitSettings = {
  url: string
  api_key: string
  api_secret: string
}

export type SipProvider = {
  id: string
  name: string
  host: string
  username: string
  password: string
  caller_id?: string
  enabled: boolean
}

// Outbound SIP trunk — fields mirror the callops /livekit/trunks schema exactly
// (name, address, numbers[], auth_username, auth_password). `id` is a local store
// key; `trunk_id` is the LiveKit trunk id callops returns on create. `auth_password`
// is write-only — callops never returns it, so it is re-supplied on every save.
export type OutboundTrunk = {
  id: string
  name: string
  address: string
  numbers: string[]
  auth_username: string
  auth_password?: string
  trunk_id?: string
  enabled: boolean
}

export type DispatchRule = {
  id: string
  name: string
  agent_name: string
  room_prefix: string
  enabled: boolean
}

// #27 names this `Agent`, but `Agent` is already taken in types/index.ts.
export type TelephonyAgent = {
  // id is not in the #27 schema (agents are keyed by name); kept internal for
  // the mock store and stripped at the future API boundary if needed.
  id: string
  name: string
  type: 'voice' | 'ivr'
  description?: string
  enabled: boolean
}

export type DialRequest = {
  phone_number: string
  agent_name: string
  trunk_id: string
}

export type ConnectionState = 'connected' | 'disconnected' | 'error'

export type SystemStatus = {
  livekit: ConnectionState
  sip: ConnectionState
  redis: ConnectionState
}
