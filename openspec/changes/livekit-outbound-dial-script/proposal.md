## Why

The Agent AVM dashboard currently populates call data only via `/api/simulate`, which writes fake outcomes to Supabase. To validate the real frontend against LiveKit telephony, we need a standalone Node dial script that dispatches the voice agent and places an outbound SIP call, plus a way for the UI to refresh without manual reload. The remote `evra_avm` database already has LiveKit-oriented columns that are missing from repo migrations.

## What Changes

- Add a Node.js script (`scripts/dial-outbound.ts`) that uses LiveKit `AgentDispatchClient` + `SipClient` to dispatch an agent and dial a phone number into the same room
- Add Supabase migration(s) syncing remote schema additions: `sip_trunks`, `campaigns.agent_name`, `campaigns.sip_trunk_id`, dialer tuning columns, `call_records.room`/`contact_id`/`egress_id`, expanded `contacts` statuses
- Document LiveKit and script env vars in `.env.example` (user supplies trunk ID and credentials separately)
- Add dashboard polling interval to refresh `call_records`, `call_logs`, and intent data while authenticated
- Insert a `call_records` row and update `contacts` status when the dial script runs (so the UI reflects in-flight calls)
- Normalize contact phone numbers before dialing (strip stray quotes/whitespace)

## Capabilities

### New Capabilities

- `livekit-outbound-dial`: CLI dial script, LiveKit API integration, Supabase write-back on dial start
- `dashboard-polling`: Periodic refresh of dashboard API data for live call testing

### Modified Capabilities

- `supabase-database`: Schema requirements extended for LiveKit dialer tables/columns and `sip_trunks` RLS

## Impact

- New dependencies: `livekit-server-sdk`, `tsx` (dev), `dotenv` (dev)
- New files: `scripts/dial-outbound.ts`, `lib/phone.ts` (normalization), Supabase migration(s)
- Modified: `package.json` scripts, `.env.example`, `app/page.tsx` (polling `useEffect`)
- External: LiveKit Cloud project with registered agent name, outbound SIP trunk (`ST_…`), agent worker running
- Out of scope: production dialer service, replacing `/api/simulate`, agent-side call completion writes (agent may add later)
