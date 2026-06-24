## Context

The frontend reads call data from Supabase via `/api/logs` (`call_records`), `/api/reports` (`call_logs`), and `/api/intents` (`intent_stats`). Starting a campaign today triggers `/api/simulate`, which fakes outcomes. The remote `evra_avm` Supabase project already has LiveKit dialer columns (`agent_name`, `sip_trunk_id`, `sip_trunks`, `call_records.room`, etc.) but local migrations and `schema.sql` lag behind.

LiveKit outbound calling requires two server-side steps when the **dial script** owns the SIP leg ([outbound calling recipe](https://docs.livekit.io/reference/recipes/make_call/)):

1. **Agent dispatch** — `AgentDispatchClient.createDispatch(room, agentName, { metadata })` starts the registered agent worker in the room.
2. **SIP participant** — `SipClient.createSipParticipant(trunkId, phone, room, options)` places the PSTN call. Use a stored outbound trunk ID (`ST_…`) from env or `sip_trunks.livekit_trunk_id`.

The agent joins the room and converses with the callee once the SIP participant connects. Metadata is opaque JSON passed to the agent job for campaign/contact context (not for dialing — the script dials).

## Goals / Non-Goals

**Goals:**

- Runnable `npm run dial -- --campaign-id N` (or `--phone` / `--contact-id`) from this repo
- Resolve agent name and trunk ID from campaign row → `sip_trunks` join → env fallbacks
- Write `call_records` (outcome `pending`) and set `contacts.status` to `in_progress` before dialing
- Sync DB migrations so repo matches production LiveKit schema
- Poll dashboard APIs every 15s while authenticated so new calls appear without manual refresh
- Document all LiveKit prerequisites and env vars

**Non-Goals:**

- Long-running campaign dialer / queue worker
- Agent writing final outcomes to Supabase (future agent work)
- Inline SIP trunk config (user will configure stored trunk in LiveKit + `sip_trunks` table or env)
- Replacing or removing `/api/simulate`
- Supabase Realtime subscriptions

## Decisions

### 1. Script owns SIP dial (not the agent)

**Choice:** `scripts/dial-outbound.ts` calls both `createDispatch` and `createSipParticipant`.

**Rationale:** Matches LiveKit's [make_call recipe](https://docs.livekit.io/reference/recipes/make_call/) and keeps agent code unchanged. Agent receives metadata for context only.

**Alternative considered:** Agent-initiated dial (dispatch with `phone_number` in metadata, agent calls SIP API). Rejected per product decision — script dials on SIP.

### 2. Stored trunk ID over inline trunk config

**Choice:** Resolve `trunkId` from `campaigns.sip_trunk_id` → `sip_trunks.livekit_trunk_id`, else `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` env.

**Rationale:** Aligns with remote DB design and [stored outbound trunk](https://docs.livekit.io/telephony/making-calls/outbound-calls/) docs. User adds trunk config in LiveKit CLI/dashboard and optionally seeds `sip_trunks`.

### 3. Room naming convention

**Choice:** `avm-c{campaignId}-ct{contactId}-{unixMs}` (or `avm-manual-{unixMs}` for `--phone` only).

**Rationale:** Deterministic, unique, parseable. Stored on `call_records.room` for correlation.

### 4. Dispatch metadata contract

**Choice:** JSON string:

```json
{
  "campaign_id": 16,
  "contact_id": 51,
  "phone": "+27821234567",
  "agent": "seeker"
}
```

**Rationale:** Agent can log/use context without owning the dial step.

### 5. Supabase client in script uses service role

**Choice:** `SUPABASE_SERVICE_ROLE_KEY` in script-only env (not exposed to browser).

**Rationale:** Script runs outside Next.js auth; must bypass RLS for `call_records` insert and `contacts` update.

### 6. Dashboard polling at 15 seconds

**Choice:** `setInterval` in `app/page.tsx` reusing existing `fetchData` + logs/intents fetch, only when `auth === true`. Clear interval on unmount/logout.

**Rationale:** Simple, no Realtime infra. 15s is acceptable for manual testing; configurable via `NEXT_PUBLIC_POLL_INTERVAL_MS` (default 15000).

### 7. Phone normalization

**Choice:** `lib/phone.ts` strips surrounding quotes, whitespace, and normalizes to E.164-ish (`+` prefix, digits only after country code).

**Rationale:** Remote `contacts.phone` has malformed values (e.g. `"\"+27 86 …\""`).

### 8. SIP options

**Choice:** `waitUntilAnswered: true`, `participantIdentity` = normalized phone, `krispEnabled: true`.

**Rationale:** Per LiveKit outbound docs; script logs `TwirpError` SIP status codes on failure and updates `call_records.outcome` to `failed` / `no_answer` / `busy` where mappable.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Agent name mismatch → dispatch succeeds but no worker | Document `LIVEKIT_AGENT_NAME`; fail fast if `listDispatch` shows no running job after timeout |
| Missing/invalid trunk ID | Validate trunk ID present before dial; link to `lk sip outbound list` in script README output |
| `sip_trunks` RLS disabled in production | Migration enables RLS + authenticated policy |
| Polling increases API load | 15s interval, only when logged in; skip when tab hidden (optional `document.visibilityState`) |
| Script secrets in `.env.local` | Document service role is script-only; never prefix with `NEXT_PUBLIC_` |
| Agent doesn't write final outcome | Script sets `pending`; manual or future agent callback updates row |

## Migration Plan

1. Apply new Supabase migration(s) to `evra_avm` via CLI or dashboard
2. User configures LiveKit outbound trunk and sets `LIVEKIT_*` + `SUPABASE_SERVICE_ROLE_KEY` in local `.env.local`
3. User seeds `sip_trunks` row or sets `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`
4. Ensure agent worker is running with matching `agentName`
5. Run `npm run dial -- --campaign-id 16 --contact-id 51`
6. Open dashboard — polling should show new `call_records` row within 15s

**Rollback:** Remove polling `useEffect`; script is additive; migrations are idempotent `IF NOT EXISTS`.

## Open Questions

- None blocking implementation. User will supply trunk config separately.

## LiveKit Prerequisites (reference)

| Requirement | Source |
|-------------|--------|
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | LiveKit Cloud project settings |
| Agent registered with explicit `agentName` matching dispatch | Agent server `ServerOptions.agentName` |
| Outbound SIP trunk created (`ST_…`) | `lk sip outbound create` or dashboard |
| API token with `roomAdmin` for dispatch | Server SDK handles automatically |
| Agent worker running and connected to same LiveKit project | `lk agent deploy` / local dev |
