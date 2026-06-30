## 1. Local CallOps + foundation

- [ ] 1.1 Run CallOps locally on `evra_callops` branch `stage/jwt-auth-and-migrations`: `uv sync` then `uvicorn app.main:app --port 8000`, env pointed at the shared Supabase; confirm it boots and serves HTTP
- [ ] 1.2 Smoke-test auth: `GET /me` with a real Supabase ES256 access token returns 200 `{user, profile, companies}` (proves `ffde3bd` JWKS path)
- [ ] 1.3 Set dashboard `.env`: `CALLOPS_URL=http://localhost:8000`, confirm `CALLOPS_WEBHOOK_SECRET` + `SUPABASE_SERVICE_ROLE_KEY` present (server-side only)
- [ ] 1.4 Create `utils/callops.ts` with `callopsGet/Post/Patch(path, token, body?)`: forward `Authorization: Bearer`, throw on non-2xx with status+body
- [ ] 1.5 Add a server helper to resolve the user's Supabase access token in API routes; return 401 when no session before any CallOps call
- [ ] 1.6 Add `/api/lookups/[type]` proxy (campaign-statuses, contact-statuses, call-outcomes, agent-outcomes, timezones, calling-windows) + a `useLookup()` hook (session-cached, tolerant of failure)

## 2. Companies (M2-1)

- [ ] 2.1 Rewire `app/api/companies/route.ts` to `GET /companies` (`{companies}`) and `POST /companies` (`{company}`) via the client
- [ ] 2.2 Rewire company detail/update/archive/restore routes to CallOps; remove direct Supabase `companies` reads/writes
- [ ] 2.3 Verify: list/create/archive a company against local CallOps; confirm out-of-scope company returns 404/403 surfaced cleanly

## 3. Campaigns + contact model (M2-2)

- [ ] 3.1 Rewire campaign create to `POST /companies/{id}/campaigns` (contacts inline); read `{campaign, contacts_imported, contacts_rejected}`
- [ ] 3.2 Rewire campaign list to `GET /companies/{id}/campaigns` (paginated `{items,page,page_size,total}`); detail/update/duplicate/archive to CallOps
- [ ] 3.3 **Remove** all `campaign_contacts` M:N inserts and the `contacts.campaign_id` patch workaround
- [ ] 3.4 Keep `voice_id` in the campaign payload (carry over from superseded change); confirm it persists via CallOps
- [ ] 3.5 Verify: create a campaign with contacts → contacts visible to dispatcher (`contacts.campaign_id` set by CallOps); no M:N write occurs

## 4. Contacts management view (M2-4)

- [x] 4.1 Create `components/ContactsView.tsx`: table (phone, name, status chip, network, retry count, last attempted) from `GET /campaigns/{id}/contacts?page&search&status` — proxied via new `app/api/campaigns/[id]/contacts/route.ts`; campaign-scope selector + masked phone
- [x] 4.2 Status filter from `useLookup('contact-statuses')`; search (Enter/button) + prev/next pagination wired (page resets on scope/filter change)
- [x] 4.3 CSV import: parse via `lib/parseCsv.ts` (`parseContacts`), `POST /campaigns/{id}/contacts/import` (new route); shows created/updated/duplicates/rejected summary
- [x] 4.4 Row actions Archive / Retry / DNC via new `app/api/contacts/[id]/[action]/route.ts` (allowlisted) → `/contacts/{id}/{archive,retry,do-not-call}`
- [x] 4.5 Added "Contacts" entry to `Sidebar.tsx` + `app/page.tsx` view + title. ⚠ NOT yet verified against local CallOps (not running this session) — see test plan
- [x] 4.6 Added `Contact` type to `types/index.ts`

## 5. Dashboard analytics (M2-3)

- [x] 5.1 `app/api/reports` ← CallOps `/companies/{id}/dashboard/campaign-performance` (joined with `/companies/{id}/campaigns` for agent/status); `app/api/intents` ← `/campaigns/{id}/intent-stats` (per-campaign) + `/companies/{id}/intent-stats` (dashboard-wide fan-out). No Supabase `call_logs`/`intent_stats`/`call_records` reads remain in these routes.
- [x] 5.2 KPI cards / reports table / OutcomeDonut / CallQuality keep working — **FE contract preserved** (route maps CallOps → existing `CampaignReport`/`IntentStat` shapes), so no consumer change needed
- [~] 5.3 **Roll-up NOT removed (non-destructive approach)**: `REPORT_KEYS`/`dashboardInsights` summation/donut buckets still exist but now operate on CallOps-sourced data. Decision (Garth 2026-06-30): CallOps 0.2.0 has no cost/CPL/spend or legacy outcome vocab (qualified/voicemail/no_speech/hangup/ni/dnq/callback/busy) → those columns/widgets read **0**. Pruning the now-dead-zero widgets is deferred cleanup, not compliance.
- [~] 5.4 `connected` from CallOps already EXCLUDES opt-out (backend contract). Figures need click-testing via clauto; "before/after" parity is N/A since the legacy source is intentionally retired.

## 6. Call history + detail (M2-5)

- [x] 6.1 `app/api/logs/route.ts` already proxies `GET /companies/{id}/calls` / `GET /campaigns/{id}/calls` (prior M2 commit)
- [~] 6.2 `CampaignDetail.tsx` already renders `outcome` + `business_disposition` distinctly with "—" + CSV (from superseded change); reads proxied calls via `/api/logs`
- [x] 6.3 Proxy routes added: `app/api/calls/[id]/route.ts` (detail) + `app/api/calls/[id]/recording/route.ts`. **FE detail panel consumer NOT built yet** (needs a real call row to verify)
- [x] 6.4 Proxy routes added: `app/api/calls/[id]/call-report/route.ts` + `app/api/calls/[id]/telemetry/route.ts` (live split, normalised). **FE panel consumer NOT built yet**
- [ ] 6.5 Verify against a real call row on local CallOps; script-only call shows no model-usage without error

## 7. SIP trunks (M2-6)

- [x] 7.1 New `components/telephony/SipTrunksPanel.tsx` (CallOps-backed) replaces the mock `TrunksPanel` in the SIP Trunks tab — list/create/archive via new proxy routes (`app/api/companies/[id]/sip-trunks`, `app/api/sip-trunks/[id]` + `/archive`). Also rewired the wizard catalog `app/api/trunks` GET off Supabase `sip_trunks` → CallOps `/companies/{id}/sip-trunks` (kept output shape; wizard unaffected). Dead mock `TrunksPanel`+helpers removed. **Other Telephony tabs (Settings/Providers/Rules/Agents/Test-Dial/Status) stay mock** — no CallOps surface yet; `lib/telephony-mock.ts` retained for them. ⚠ NOT verified against prod (needs logged-in dash)
- [x] 7.2 Health-check (`app/api/sip-trunks/[id]/health`) + test-call (`app/api/sip-trunks/[id]/test-call`) wired; test-call surfaces `ok:false` at HTTP 200 as a failure, not a crash
- [x] 7.3 No credential fields rendered — `auth_username`/`auth_password` are entered on create only, never read back (CallOps never returns them)

## 8. Cleanup, supersede, validate

- [ ] 8.1 Confirm no `supabase.from('<operational table>')` (campaigns/contacts/call_records/call_logs/sip_trunks/companies) reads/writes remain in the dashboard (grep audit)
- [ ] 8.2 Archive/withdraw the superseded `callops-outcome-contract-alignment` change, keeping its retained pieces (types, voice_id) intact
- [ ] 8.3 `npx tsc --noEmit` clean; lint no new errors
- [ ] 8.4 Full local verification pass: `/me`, company CRUD, campaign create+list, contact import, dashboard summary, call detail, trunk list/test-call — all green against local CallOps
- [ ] 8.5 `openspec validate --strict callops-authoritative-proxy`
- [ ] 8.6 Prod cutover checklist (do NOT execute until Cale deploys `ffde3bd`): confirm prod `GET /me` 200, set prod `CALLOPS_URL`, smoke one company/campaign/dashboard read, then merge

## 9. Backend handoff (tracked here, executed by Cale / deploy owner)

- [x] 9.1 Push `stage/jwt-auth-and-migrations` + open PR on `GhostAI-Core/evra_callops` (deploy `ffde3bd`; no `.env` change needed; migrations already applied via SQL editor 2026-06-29) — **DONE 2026-06-29: PR #7** https://github.com/GhostAI-Core/evra_callops/pull/7
- [ ] 9.2 Cale merges + `docker compose up -d --build`; confirm prod `GET /me` returns 200 → unblocks 8.6
- [ ] 9.3 FYI to Cale: stale backend openspec on call reporting (combined vs split); the half-finished `_OUTCOME_MAP` edit on `test/behavioral-rule-gaps` needs completing before commit

---

## Session state — 2026-06-29 (resume here)

**Committed:** `b888641` on branch `feat/callops-outcome-contract-alignment` — M2 backbone + the 3 call-test bug fixes + this change's docs. tsc clean (0 errors).

**Done (committed):** `utils/callops.ts` (bearer client + error normalize), `getAccessToken`, `/api/lookups/[type]` + `useLookup`, and **companies / campaigns (list,create,edit,delete) / call-history (logs)** routes → CallOps. Bug fixes: `audio_path`→`voice_recording_url`; contacts via CallOps (E.164 + `contacts.campaign_id`, M:N drop).

**Remaining M2 (frontend-coupled — do with worker fixed + browser):**
- Analytics: `/api/reports` + `/api/intents` → CallOps `dashboard/*` + `intent-stats`, plus the KPI/OutcomeDonut/chart consumers (`app/page.tsx`, `lib/dashboardInsights.tsx`, `components/Charts.tsx`).
- `components/ContactsView.tsx` + sidebar entry + contact action proxy routes (archive/retry/DNC).
- SIP-trunk: `/api/trunks` → CallOps `/companies/{id}/sip-trunks`; wire `TelephonyView` off `lib/telephony-mock.ts`.
- Call detail: call-report/telemetry panel in `CampaignDetail`.
- `companies/[id]` route (doesn't exist yet).

**Dev setup:** `.env.local` (gitignored from the commit, NOT committed — it would override prod) sets `CALLOPS_URL=http://localhost:8000`. Local CallOps = `evra_callops` branch `stage/jwt-auth-and-migrations`, API-only via `DISABLE_BACKGROUND_WORKERS=1` patch (no dispatcher on the shared DB), run with `.venv/bin/python -m uvicorn app.main:app --port 8000`.

**Gated on Cale:** (1) merge+deploy PR #7 (auth fix) → then prod `GET /me` 200 → flip `CALLOPS_URL` to prod (task 8.6). (2) worker no-audio blocker (issue #42) → then verify a real call WITH audio. Both posted: PR #7 status comment + issue #42 findings comment.
