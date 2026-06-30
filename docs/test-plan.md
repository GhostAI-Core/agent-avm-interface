# Agent AVM Interface — Project Overview & Test Plan

_Last updated: 2026-06-30. Owner: GarthGhostai. Companion to `docs/call-rules-inventory.md`._

This is the single map of **what the dashboard does**, **what is verified**, and **what still
needs testing** — organised by feature area. Update the status columns as items are checked.

Legend: ✅ tested/verified · 🟡 partial / needs re-verify · ⛔ blocked · ⬜ not yet tested · ➖ n/a

---

## 1. What this app is

A Next.js (App Router, MUI) operator dashboard for the EVRA / Agent AVM outbound-calling
platform (South Africa). It is the **control plane**, not the dialer. The dialer is **CallOps**
(`evra_callops`, FastAPI + a LiveKit worker), which owns all call rules, suppression, and the
operational data.

**Hard architecture rule (issue #42, [[callops-handover-42]]):** CallOps is the authoritative
API. The frontend MUST NOT read/write operational tables (campaigns, contacts, call_records,
call_logs, sip_trunks, companies) directly from Supabase. Supabase is **auth/session only** on
the client. All operational data flows through Next.js API routes → `utils/callops.ts` (bearer
client) → CallOps. This is the M2 cutover that is currently in progress.

**Data flow:** Browser → Next.js API route (`/app/api/*`) → `utils/callops.ts`
(`Authorization: Bearer <user Supabase ES256 token>`) → CallOps → shared Supabase.

---

## 2. Current automated coverage

| Suite | Command | Status | Notes |
|---|---|---|---|
| Lib unit tests (`tsx --test`) | `npm test` | ✅ 32 pass | Only `lib/compliance/gate.test.ts`, `lib/sts/outcomes.test.ts`, `lib/sts/client.test.ts` |
| Typecheck | `npx tsc --noEmit` | ✅ exit 0 | Run before every commit |
| Lint | `npm run lint` (`eslint`) | 🟡 | ~20 pre-existing errors/5 warnings (mostly `any[]`/setState-in-effect in `app/page.tsx`); bar is "no NEW errors" |
| Build | `npm run build` | ⬜ | Not run this session |

**Coverage gaps (no automated tests):** API proxy routes, React components, and any
integration against CallOps. Everything below the lib layer is manual-only today.

**Suggested high-value units to add** (pure, no network, testable now):
- `lib/parseCsv.ts` `parseContacts()` — delimiter detection, BOM, quoted commas, header-less → []
- `lib/tokens.ts` `statusChipTone()` / `statusChipKey` mapping for callops lookup values
- `utils/callops.ts` `callopsErrorResponse()` envelope normalisation (`{error:{message}}` → string)

---

## 3. Feature areas — what to test

### 3.1 Auth & session
| Check | Status | How |
|---|---|---|
| Login / logout via Supabase | 🟡 | Manual — works in prior sessions |
| Role resolution (admin vs engineer) + fallback on profile-query timeout | ⬜ | Manual: stall profiles query, confirm login not blocked |
| 15-min inactivity auto-logout | ⬜ | Manual / could unit-test the timer logic if extracted |
| Server forwards ES256 access token to CallOps; 401 when no session | ⛔→🟡 | Needs CallOps `GET /me` 200 (auth fix `ffde3bd` deployed) |
| Expired session → API 401 → client `handleAuthFailure` signs out | ⬜ | Manual: expire token, hit a proxied route |

### 3.2 Companies (M2-1) — `app/api/companies` → CallOps `/companies`
| Check | Status |
|---|---|
| List companies (envelope `{companies}`) | ⬜ needs local CallOps |
| Create company (POST `{company}`, 201) | ⬜ |
| Out-of-scope company surfaced cleanly (404/403, not crash) | ⬜ |
| Detail / archive / restore routes | ⛔ `companies/[id]` route not built yet |

### 3.3 Campaigns (M2-2) — `app/api/campaigns` → CallOps `/companies/{id}/campaigns`
| Check | Status |
|---|---|
| Create campaign via wizard → `contacts_imported`/`contacts_rejected` honoured | ⬜ |
| Trunk dropdown binds integer `sip_trunks.id` (not `ST_…`) → `/start` no 422 | 🟡 fixed in campaign-dial-fixes; re-verify post-cutover |
| `voice_recording_url` sent (not `audio_path`) → wizard campaign plays audio | 🟡 fixed; **blocked on worker no-audio (#42)** for true end-to-end |
| `voice_id` persists via CallOps | ⛔ not in CallOps CampaignCreate/Update yet (flagged for Cale) |
| No `campaign_contacts` M:N write / no `contacts.campaign_id` patch remains | ⬜ grep audit (task 8.1) |
| Lifecycle start/pause/stop surfaces CallOps `detail` (not blank 502) | 🟡 fixed; re-verify |
| List pagination (`{items,page,page_size,total}`) | ⬜ |

### 3.4 Contacts (M2-4) — **built this session**, `components/ContactsView.tsx`
| Check | Status | How |
|---|---|---|
| Campaign-scope selector loads + defaults to first campaign | ⬜ | Local CallOps; pick a campaign |
| List renders (phone masked, name, status chip, network, retries, last attempted) | ⬜ | `GET /campaigns/{id}/contacts` |
| Status filter from `useLookup('contact-statuses')`; empty lookup → no crash | ⬜ | Kill `/api/lookups` → dropdown empty, table intact |
| Search (Enter/button) + prev/next pagination; page resets on scope/filter change | ⬜ | |
| CSV import → parse → `POST /contacts/import` → created/updated/duplicates/rejected summary | ⬜ | Import a sample CSV; verify summary numbers |
| CSV with no `phone` header → "No valid rows" (no request) | ⬜ | |
| Row actions Retry / Archive / DNC POST + reload | ⬜ | Verify status flips; DNC sets compliance flag in CallOps |
| Action/list error surfaces in an Alert, not a crash | ⬜ | |

### 3.5 Dashboard analytics (M2-3) — **rewired this session** (source-swap, FE contract preserved)
`/api/reports` ← CallOps `campaign-performance`; `/api/intents` ← CallOps `intent-stats`. No
Supabase operational reads remain. Cost/CPL/spend + legacy outcome columns read **0** (no CallOps
source). KPI/charts/CallQuality unchanged in code.
| Check | Status | How (clauto) |
|---|---|---|
| Reports table populates from CallOps (Dialed/Connected/Failed real; legacy cols 0) | ⬜ | Open Campaign Report |
| KPI cards: Dialed/Connected/Avg-Talk real; Qualified/CPL/Spend show 0 | ⬜ | Control Room |
| OutcomeDonut / Campaign comparison render without crash | ⬜ | |
| Call Quality waterfall ← `/campaigns/{id}/intent-stats` (`% of Connected`) | ⬜ | Call Quality view |
| **Opt-out excluded from `connected`** (CallOps contract) | ✅ backend; ⬜ confirm | |
| Agent filter still works; date filter is inert (campaign-performance is all-time) | ⬜ | known limitation |
| **Deferred**: prune the now-zero Spend/CPL/legacy widgets (cosmetic, not compliance) | ⬜ | |

### 3.6 Call history & detail (M2-5)
| Check | Status |
|---|---|
| Call history list ← `/companies\|campaigns/{id}/calls` (`/api/logs`) | 🟡 route rewired (prior commit); needs live verify |
| Per-call table: `outcome` + `business_disposition` distinct, missing → "—", CSV both | ✅ logic in `CampaignDetail` (verified 2026-06-26 on campaign 49 seed rows) |
| Call detail proxy routes (`/api/calls/[id]`, `/recording`, `/call-report`, `/telemetry`) | ✅ **built this session** (additive) |
| Call detail **FE panel** (telephony narrative + model-usage; empty → graceful) | ⛔ consumer not built — needs a real call row |
| Recording signed-URL open | ⬜ |

### 3.7 SIP trunks (M2-6) — **built this session** (`components/telephony/SipTrunksPanel.tsx`)
SIP Trunks tab is now CallOps-backed; other Telephony tabs remain mock (no CallOps surface yet).
| Check | Status | How |
|---|---|---|
| Wizard trunk catalog (`/api/trunks` GET) sources CallOps, NOT Supabase `sip_trunks` | ✅ rewired | grep clean; ⬜ live |
| Company-scoped list ← `/companies/{id}/sip-trunks` | ⬜ | Pick a company; list renders |
| Create trunk (name/from_number/address/numbers/auth/livekit_trunk_id) | ⬜ | Add Trunk dialog → POST |
| Health-check per row ← `/sip-trunks/{id}/health` | ⬜ | Check button → 🟢/🔴 |
| Test-call ← `/sip-trunks/{id}/test-call`; `ok:false` at HTTP 200 shown as failure | ⬜ | Dialog → place call |
| Archive ← `/sip-trunks/{id}/archive` | ⬜ | |
| No credential fields rendered (`auth_password` entered on create only, never read back) | ✅ by design; ⬜ live |

### 3.8 Lookups — `app/api/lookups/[type]` + `hooks/useLookup`
| Check | Status |
|---|---|
| 7 allowlisted types proxy; unknown type rejected without calling CallOps | ⬜ local CallOps |
| `useLookup` session-caches one fetch per type; failure → empty, no throw | ✅ tolerant by design; ⬜ live |

### 3.9 Compliance / STS (pre-dial gate)
| Check | Status |
|---|---|
| `lib/compliance/gate.ts` rollover classifier | ✅ unit-tested |
| `lib/sts/outcomes.ts` + `client.ts` vocab alignment | ✅ unit-tested |
| Live suppression gate (owned by CallOps, not dashboard) | ➖ CallOps-side; FE has zero control ([[fe-zero-control]]) |

### 3.10 Other views (pre-M2, Supabase-direct — to be audited in task 8.1)
| View | Status | Note |
|---|---|---|
| Security Audit (`/api/security`) | ⬜ | Confirm whether operational or auth-plane |
| Settings / Profile | ⬜ | Appearance/role; non-operational |
| Tour / FloatingNav / TopBar | ⬜ | UI smoke (issue #15 a11y/keyboard/responsive) |
| Insight dashboard drag/save-template | ⬜ | localStorage layout |

---

## 4. M2 remaining

There is ONE CallOps backend — `call-center.evra-ai.com` — and the dash already points at it
(`.env` `CALLOPS_URL`). No staging, no cutover ceremony; "verify" just means test the dash
against its backend. Backend is done + deployed (PR #7 on `evra_callops` main: auth, worker
no-audio, AMD/teardown, migrations, CI→GHCR→Arcane; SIP pipeline tested 2026-06-29). Remaining
is the dash sync:

1. ✅ Backend live on the merged build — `/health` 200, `/me` enforces bearer (api 0.2.0).
2. ✅ Dash points at the backend — `.env` set; stale `.env.local` localhost override disabled.
3. ⬜ Walk the §3 checklists against the backend: `/me`, company CRUD, campaign create+list,
   contact import, trunk list/test-call, call detail — all green.
4. ⬜ Grep audit (task 8.1): zero `supabase.from('<operational table>')` reads/writes remain.
5. ⬜ `openspec validate --strict callops-authoritative-proxy`; archive superseded
   `callops-outcome-contract-alignment`; merge the dash branch.

---

## 5. How to run a local verification pass

```bash
# 1. Local CallOps (API-only, no dispatcher on shared DB)
cd /home/garthsghost/evra_callops   # branch: stage/jwt-auth-and-migrations
uv sync
DISABLE_BACKGROUND_WORKERS=1 .venv/bin/python -m uvicorn app.main:app --port 8000

# 2. Dashboard pointed at it (.env.local already sets CALLOPS_URL=http://localhost:8000)
cd /home/garthsghost/agent-avm-interface
npm run dev   # then exercise the §3 checklists in the browser

# Pre-commit gates
npm test && npx tsc --noEmit && npm run lint
```

> Note: `evra_callops` is currently on branch `test/behavioral-rule-gaps` with uncommitted
> edits (half-finished `_OUTCOME_MAP`). Stash/commit those before switching to the auth-fix
> branch, or you'll lose Cale's WIP. See [[callops-handover-42]].
