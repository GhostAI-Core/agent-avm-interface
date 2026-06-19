# Plan — Issue #34: Frontend ↔ evra-callops integration

**Branch:** `feat/align-callops-control-plane` (extends existing #24/PR #25 work)
**Status:** Draft — awaiting approval before implementation

## Requirements (from #34)
Delegate outbound call lifecycle to the evra-callops orchestrator (`CALLOPS_URL`). Remove the frontend's own dial/outcome logic; keep all read-model CRUD, the LiveKit recording webhook, TTS routes, and the auth model unchanged.

## Codebase reality check (grounds the estimate)
- **Status constraint** currently allows `draft/running/paused/completed/deleted/archived` (`supabase/migrations/20260610150000_campaign_archive.sql`). Missing only `stopped`.
- **Columns already exist** in `schema.sql`: `max_concurrent` (default 10), `max_retries` (2), `retry_cooldown_seconds` (3600), `auto_paused` (false), `time_window_start/end`. → Tasks 4 & 5 are **UI-only**; no DB work.
- Routes to change: `app/api/campaigns/[id]/dial/route.ts`, `app/api/calls/result/route.ts`, `app/api/campaigns/[id]/route.ts` (PUT allow-list).

## Tasks & data models

### T1 — `stopped` status (migration)
New migration `supabase/migrations/20260618210000_campaign_stopped_status.sql`: drop + re-add `campaigns_status_check` with `stopped` added. UI treats `stopped` like `completed` (inactive, restartable).
- **Edge case:** existing rows unaffected (additive). PUT allow-list already permits `status`.

### T2 — callops lifecycle proxy
New `app/api/campaigns/[id]/[action]/route.ts` (actions: `start|pause|stop`), server-side `fetch` to `${CALLOPS_URL}/campaigns/{id}/{action}` with `X-Webhook-Secret` header (secret never reaches browser). New GET proxy for `/campaigns/{id}/status` to drive the stats panel.
- Replace `POST /api/campaigns/[id]/dial` call sites in the UI with `start`; wire pause/stop buttons to the proxy.
- **Edge cases:** callops unreachable → surface 502 + keep last-known status; missing env vars → fail closed with clear error; validate `action` against allow-list to avoid SSRF-by-path.
- **Open Q:** keep `/dial` route as a deprecated shim for one sprint, or delete now?

### T3 — retire `/api/calls/result`
Agent now posts to callops `/calls/outcome`. Leave handler returning `{ ok: true }` + deprecation `console.warn` for one sprint, then delete (per #34's safe-transition note).

### T4 — expose campaign settings in create/edit form (`components/CampaignModal.tsx`)
Add inputs for `max_concurrent` (priority), `max_retries`, `retry_cooldown_seconds`, `time_window_start/end`. Add these to the PUT allow-list in `app/api/campaigns/[id]/route.ts` and to the POST create payload + `types/index.ts`.

### T5 — `auto_paused` badge
Status badge distinguishes auto-pause (outside calling hours, self-resuming) from manual pause. Add `auto_paused` to the campaign type/select + badge logic in `app/page.tsx`.

### T6 — env + outcome mapping
Add `CALLOPS_URL`, `CALLOPS_WEBHOOK_SECRET` to `.env.example`. Audit any frontend outcome→label display for the old IVR strings; map per #34 table (display-only; no writes).

## Sequencing
T1 (migration) → T4/T5 (UI, independent) → T2 (proxy) → T3 (retire) → T6 (env/docs). T2 is the only piece blocked on live `CALLOPS_WEBHOOK_SECRET`.

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

## Decisions needed before coding
1. Branch onto `feat/align-callops-control-plane`, or a fresh branch off `main`?
2. T2: deprecated `/dial` shim or hard-delete?
3. Is `CALLOPS_WEBHOOK_SECRET` (post-rotation) available to wire/test T2, or stub it for now?
