## Why

GitHub issue #42 (Cale's 2026-06-28 "last 5%" handover) establishes a hard architecture rule the dashboard currently violates: **CallOps is the authoritative API; the frontend must not read or write operational tables (campaigns, contacts, call_records, call_logs) directly from Supabase — Supabase is for auth only on the client side.** Today the dashboard bypasses CallOps for nearly all CRUD and analytics, which (a) drifts from the backend's normalisation, scoping, and outcome logic, (b) silently breaks the contact pipeline (the UI writes a `campaign_contacts` M:N join the dispatcher never reads), and (c) duplicates analytics where historical bugs lived. The backend API surface that fixes all of this is already implemented and specified (`evra_callops/openspec/specs/*`); this change finishes the integration loop and extends [[fe-zero-control]] from control to all reads. This **supersedes** the in-flight `callops-outcome-contract-alignment` change, retaining its still-valid pieces (the `CallRecord`/`CampaignSummary` types and `campaigns.voice_id` persistence) and retiring its now-wrong approach of reading `call_records` straight from Supabase.

## What Changes

- **Add a server-side CallOps client** (`utils/callops.ts`): `callopsGet/Post/Patch` helpers that resolve the user's Supabase access token server-side and forward it as `Authorization: Bearer`; `CALLOPS_WEBHOOK_SECRET`/`SUPABASE_SERVICE_ROLE_KEY` stay server-only. All Next.js API routes proxy through this.
- **BREAKING (data flow): stop reading operational Supabase tables directly.** Companies, campaigns, contacts, reports, call history, and SIP trunks read/write CallOps, not `supabase.from('<operational table>')`. Supabase client usage is reduced to auth/session only.
- **Wire companies** (`app/api/companies/route.ts`) to `GET/POST /companies` (envelopes `{companies}` / `{company}`).
- **Wire campaigns + fix the contact model** (`app/api/campaigns/route.ts`): create via `POST /companies/{id}/campaigns` (contacts inline) and list via `GET /companies/{id}/campaigns`; **BREAKING:** remove all `campaign_contacts` M:N writes and the `contacts.campaign_id` patch workaround — CallOps owns `contacts.campaign_id`, E.164 normalisation, and rejection reporting.
- **Wire reports/analytics** to `GET /companies/{id}/dashboard{,/live,/outcomes,/call-volume,/campaign-performance}` and `/intent-stats`; delete the local roll-up. Opt-out is surfaced separately and excluded from connected, per the backend contract.
- **Build a contacts management view** (`components/ContactsView.tsx` + sidebar entry): list/search/filter/paginate via `GET /campaigns/{id}/contacts`, CSV import via `POST /campaigns/{id}/contacts/import` (created/updated/rejected summary), row actions Archive/Retry/DNC; status options from `GET /lookups/contact-statuses`.
- **Wire call history** to `GET /companies/{id}/calls`, `GET /campaigns/{id}/calls`, `GET /calls/{id}` (detail incl. `business_disposition`/timestamps), `GET /calls/{id}/recording`, and the **live 4-way split** call endpoints (`/calls/{id}/call-report`, `/calls/{id}/telemetry`; model-usage/events as available) — NOT the stale combined-telemetry spec.
- **Wire SIP trunk management** (`components/TelephonyView.tsx`): replace `telephony-mock.ts` with `GET/POST /companies/{id}/sip-trunks`, health-check, test-call, archive; credentials never rendered.
- **Out of scope (handled separately, documented):** the backend auth fix `ffde3bd` (staged for Cale to deploy; no `.env` change needed) and the three missing migrations (already applied via SQL editor 2026-06-29). See [[callops-handover-42]].

## Capabilities

### New Capabilities

- `callops-api-client`: a server-side CallOps proxy client (`utils/callops.ts`) that forwards the user's Supabase bearer token, keeps secrets server-side, and is the single channel for all operational reads/writes — establishing that the dashboard never touches operational Supabase tables directly.
- `companies-proxy`: company list/create/detail/update/archive routed through CallOps `/companies*`.
- `campaigns-proxy`: campaign list/create/detail/update/duplicate/archive routed through CallOps `/companies/{id}/campaigns*`, with the contact model corrected to CallOps-owned `contacts.campaign_id` (the `campaign_contacts` M:N write path removed).
- `contacts-management`: a contacts management view plus contact list/import/retry/archive/do-not-call routed through CallOps `/campaigns/{id}/contacts*` and `/contacts/{id}/*`, with statuses from `/lookups/contact-statuses`.
- `dashboard-analytics-proxy`: reports, KPI cards, outcome chart, call-volume, and live queue sourced from CallOps `/companies/{id}/dashboard/*` and `/intent-stats`, replacing the local `call_records`/`call_logs` roll-up, with opt-out reported separately from connected.
- `call-history-proxy`: call history, call detail, recording metadata, and the split call-report/telemetry detail reads routed through CallOps `/companies|campaigns/{id}/calls` and `/calls/{id}/*`.
- `sip-trunks-proxy`: SIP trunk management (list/create/update/archive, health-check, test-call) routed through CallOps `/companies/{id}/sip-trunks*` and `/sip-trunks/{id}/*`, replacing the mock state, with credentials never exposed in responses.

### Modified Capabilities

<!-- None. The dashboard's direct-Supabase operational reads were never captured in a committed openspec spec (openspec/specs/ holds only UI-theme, TTS, deployment, and the legacy-outbound/supabase-database specs). The behaviour being replaced lives in the in-flight, non-committed callops-outcome-contract-alignment change, which this supersedes rather than modifies. -->

## Impact

- **New**: `utils/callops.ts`; `components/ContactsView.tsx`; sidebar entry for Contacts.
- **Rewired API routes** (Supabase → CallOps proxy): `app/api/companies/route.ts`, `app/api/campaigns/route.ts` (+ `[id]` routes), `app/api/reports/route.ts`, `app/api/logs/route.ts`, `app/api/intents/route.ts`, plus new proxy routes for contacts, calls/{id} detail+recording+call-report+telemetry, sip-trunks, and `/lookups/[type]`.
- **Components**: `components/CampaignDetail.tsx` (call table reads proxied calls; `outcome` + `business_disposition`), `components/TelephonyView.tsx` (drop `lib/telephony-mock.ts`), `app/page.tsx` / `lib/dashboardInsights.tsx` / `components/Charts.tsx` (local roll-up removed), `components/CallQuality.tsx` (`/intent-stats`).
- **Retained from superseded change**: `types/index.ts` (`CallRecord`, `CampaignSummary`, `voice_id`); `campaigns.voice_id` persistence in campaign save.
- **Env**: `CALLOPS_URL`, `CALLOPS_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (all server-side; already present).
- **APIs consumed (not changed here)**: CallOps `/me`, `/companies*`, `/campaigns*`, `/contacts*`, `/calls*`, `/companies/{id}/dashboard/*`, `/intent-stats`, `/sip-trunks*`, `/lookups/*`.
- **External dependency (separate)**: CallOps prod must run `ffde3bd` for JWT auth; until then, develop/verify against a local CallOps instance on the auth-fix branch.
