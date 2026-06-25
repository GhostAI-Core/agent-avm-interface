# Plan — Issue #34: Frontend ↔ evra-callops integration

**Branch:** implemented via callops integration work merged before this documentation pass
**Status:** Implemented / historical plan. See `docs/app-api-reference.md` and `docs/livekit-outbound-integration.md` for the current operational contract.

## Requirements (from #34)
Delegate outbound call lifecycle to the evra-callops orchestrator (`CALLOPS_URL`). Remove the frontend's own dial/outcome logic; keep all read-model CRUD, the LiveKit recording webhook, TTS routes, and the auth model unchanged.

## Codebase reality check
- `stopped` is now part of `CampaignStatus` and the Supabase status check (`20260618210000_campaign_stopped_status.sql`).
- Pacing columns are wired through campaign create/update: `max_concurrent`, `max_retries`, `retry_cooldown_seconds`, `auto_paused`, `time_window_start/end`.
- Production lifecycle now lives in `app/api/campaigns/[id]/[action]/route.ts`; there is no dashboard `/dial` route.

## Tasks & data models

### T1 — `stopped` status (migration)
New migration `supabase/migrations/20260618210000_campaign_stopped_status.sql`: drop + re-add `campaigns_status_check` with `stopped` added. UI treats `stopped` like `completed` (inactive, restartable).
- **Edge case:** existing rows unaffected (additive). PUT allow-list already permits `status`.
- **Status:** implemented.

### T2 — callops lifecycle proxy
New `app/api/campaigns/[id]/[action]/route.ts` (actions: `start|pause|stop`), server-side `fetch` to `${CALLOPS_URL}/campaigns/{id}/{action}` with `X-Webhook-Secret` header (secret never reaches browser). New GET proxy for `/campaigns/{id}/status` to drive the stats panel.
- Replaced dashboard call sites with `start`; pause/stop buttons also use the proxy.
- **Implemented behavior:** callops unreachable returns 502; missing env vars fall back to local `campaigns.status` writes for development; action names are allow-listed.
- **Resolved:** no deprecated `/dial` API shim is present.

### T3 — retire `/api/calls/result`
Agent now posts to callops `/calls/outcome`. Leave handler returning `{ ok: true }` + deprecation `console.warn` for one sprint, then delete (per #34's safe-transition note).
- **Status:** implemented as a deprecated no-op returning `{ ok: true, deprecated: true }`.

### T4 — expose campaign settings in create/edit form (`components/CampaignModal.tsx`)
Add inputs for `max_concurrent` (priority), `max_retries`, `retry_cooldown_seconds`, `time_window_start/end`. Add these to the PUT allow-list in `app/api/campaigns/[id]/route.ts` and to the POST create payload + `types/index.ts`.
- **Status:** implemented.

### T5 — `auto_paused` badge
Status badge distinguishes auto-pause (outside calling hours, self-resuming) from manual pause. Add `auto_paused` to the campaign type/select + badge logic in `app/page.tsx`.
- **Status:** implemented.

### T6 — env + outcome mapping
Add `CALLOPS_URL`, `CALLOPS_WEBHOOK_SECRET` to `.env.example`. Audit any frontend outcome→label display for the old IVR strings; map per #34 table (display-only; no writes).
- **Status:** implemented for env and documented; display mapping still depends on dashboard/report consumers.

## Sequencing
Historical implementation order was T1 (migration) → T4/T5 (UI) → T2 (proxy) → T3 (retire) → T6 (env/docs).

## ⚠️ Blocker / security
The creds posted in #34's comment (`LIVEKIT_API_SECRET`, `WEBHOOK_SECRET`) are exposed in a GitHub issue. **Rotate both, then scrub the comment** before these land in any `.env`. Do not commit real secret values.

## Testing (2026-06-18) — harness + live verification

Harness: `scripts/callops-test.ts` (`npm run callops -- <cmd>`). Cmds: status / start / pause / stop /
test-call / outcome / snapshot / watch. callops cmds work now; snapshot/watch need a Supabase key.

Verified live against `https://call-center.evra-ai.com` (secret authenticates):
- `/health`, `/livekit/health`, `/livekit/trunks` → 200. Agent worker `outbound-recorder` is deployed.
- Real trunk: `ST_J4VapLgizb32` ("Utility Connect", numbers +27104760560–579). NOTE: differs from
  `.env` `LIVEKIT_SIP_OUTBOUND_TRUNK_ID=ST_WA6…` — test calls must use the callops trunk id.
- `GET /campaigns/1/status` → 500 (campaign 1 not present); need a valid campaign id from callops' DB.

### Blockers
- **B1 — no Supabase key locally.** `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
  are both blank in `.env`. Can't read/verify DB population without the service_role key.
- **B2 — who writes `call_records.outcome` now?** callops `/calls/outcome` doc says it updates the
  *contact* record; the dashboard reports read `call_records`. With `/api/calls/result` deprecated,
  the path that set rich `call_records.outcome` is gone. Confirm with Cale whether callops writes
  `call_records`, or whether the kept `/api/livekit/webhook` must derive outcome. If callops writes
  `call_records`, migration `20260618220000` is required (constraint rejected `answered`/`transferred`).

### Phase test matrix (callops outcome → expected Supabase)
| Phase (user term) | callops `outcome` | contacts.status | call_records.outcome | notes |
|---|---|---|---|---|
| Answered/connected | `answered` | dialed | answered | needs migration 20260618220000 |
| Voicemail | `voicemail` | dialed/retry | voicemail | already allowed |
| No speaking | `no_answer` (maps from no_speech) | retry→failed | no_answer | no distinct no_speech in callops |
| No answer / delay | `no_answer` | retry then failed after max_retries | no_answer | retry_cooldown_seconds gap |
| Busy | `busy` | retry/failed | busy | already allowed |
| Failed | `failed` | failed | failed | already allowed |
| Transferred | `transferred` | dialed | transferred | needs migration; transferred=true |

## Resolved decisions
1. Lifecycle proxy shipped in `app/api/campaigns/[id]/[action]/route.ts`.
2. `/dial` was removed from the dashboard API surface rather than kept as a shim.
3. `CALLOPS_WEBHOOK_SECRET` is documented as required production env; local development falls back to status-only writes when it is absent.
