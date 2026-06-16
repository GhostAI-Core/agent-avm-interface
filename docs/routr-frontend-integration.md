# Routr integration — frontend handoff guide

This document explains what **Routr** is, how it fits into Agent AVM’s outbound calling stack, and what your junior developer needs to know to work on the **frontend integration**. It is based on the **`routr-outbound-v1`** OpenSpec change, commit history on the `production` branch, and the infrastructure docs under `infrastructure/`.

**Related docs (on `production` branch today):**

| Doc | Location | Purpose |
|-----|----------|---------|
| Long-term architecture | `infrastructure/routr_integration.md` | Full Routr + LiveKit + Supabase design |
| M1 staging & rollback | `infrastructure/routr-m1-staging.md` | First real-call checklist, spikes, rollback |
| Legacy LiveKit dialer | `docs/livekit-outbound-integration.md` | Pre-Routr call flow (still valid for `legacy` mode) |

> **Branch note:** Routr work lives on **`origin/production`** as of June 2026. `main` does not yet include the Routr UI, API routes, or `lib/routr/` modules. When you start frontend work, confirm you are on the branch that contains the M2 commits (see [§3](#3-commit-history--milestones)).

---

## Table of contents

1. [What is Routr?](#1-what-is-routr)
2. [Why we added it](#2-why-we-added-it)
3. [Commit history & milestones](#3-commit-history--milestones)
4. [OpenSpec: routr-outbound-v1](#4-openspec-routr-outbound-v1)
5. [Architecture](#5-architecture)
6. [Parallel routing modes](#6-parallel-routing-modes)
7. [Frontend integration map](#7-frontend-integration-map)
8. [API routes the UI calls](#8-api-routes-the-ui-calls)
9. [Database fields the UI depends on](#9-database-fields-the-ui-depends-on)
10. [Environment variables](#10-environment-variables)
11. [End-to-end call flow (Routr mode)](#11-end-to-end-call-flow-routr-mode)
12. [What the junior dev does *not* need to touch](#12-what-the-junior-dev-does-not-need-to-touch)
13. [Testing checklist](#13-testing-checklist)
14. [Known quirks & gotchas](#14-known-quirks--gotchas)
15. [Suggested next frontend tasks](#15-suggested-next-frontend-tasks)

---

## 1. What is Routr?

**Routr** ([routr.io](https://routr.io/docs)) is an open-source **SIP proxy / router** (Fonoster). In our stack it sits **between LiveKit and the PSTN carriers** (Twilio Elastic SIP, Telnyx, Sangoma, etc.).

| Routr **is** | Routr **is not** |
|--------------|------------------|
| SIP signaling proxy (EdgePort :5060) | A media server (no RTP by default) |
| Carrier trunk + credential store | A replacement for LiveKit agent workers |
| Programmable via `@routr/sdk` and `@routr/ctl` | A web UI for operators |
| Postgres-backed config (`routr-one` Docker image) | Integrated with Supabase out of the box |

**One-line summary for the team:**

> LiveKit still runs AI agents and rooms. Routr owns **which carrier** a call exits through. The Next.js app is still the **control plane** — campaigns, contacts, reporting — and now also **syncs carrier config into Routr** when an admin saves Settings.

---

## 2. Why we added it

**Before (legacy mode):** LiveKit had **one or more SIP trunks per carrier** (`ST_…` IDs in LiveKit Cloud). `createSipParticipant()` dialed the callee **directly** through that carrier trunk.

**After (routr mode):** LiveKit has **one outbound trunk** pointing at our Routr server (`LIVEKIT_SIP_ROUTR_TRUNK_ID`). Routr receives the SIP INVITE and routes it **peer-to-pstn** to the correct carrier trunk (Twilio, Telnyx, etc.).

**Benefits:**

- Carrier credentials live in **one place** (Routr), not duplicated in LiveKit Cloud.
- Multiple carriers / regions can be added without creating new LiveKit trunks.
- Future inbound DIDs and per-carrier routing policies are Routr’s job.
- **Parallel migration:** campaigns keep working on `legacy` until individually switched to `routr`.

---

## 3. Commit history & milestones

Chronological summary of Routr-related commits on `origin/production`:

| Commit | Summary |
|--------|---------|
| `5bb49d7` | **M1 foundation** — `campaigns.routing_mode` (`legacy` \| `routr`), Routr Docker service on shared network, `LIVEKIT_SIP_ROUTR_TRUNK_ID`, `ROUTR_PUBLIC_IP`, FreeSWITCH port-5060 handoff notes |
| `74fc36e` | Twilio Elastic SIP env vars, `agent-avm-sip-routr-bootstrap` service, persistent `routr-pgdata` volume |
| `4b0e734` | Bootstrap script uses `@routr/ctl` v2; `bootstrap-apply.cjs` for config apply |
| `43f4aae` | Bootstrap builds from Dockerfile; deploy workflow runs bootstrap after container build |
| `8d33845` | Bootstrap dependency management refactor |
| `3d7733e` | LiveKit + Routr env alignment |
| `33bc508` | Bootstrap upsert + ref resolution helpers |
| `5bb6dff` | Transport protocol casing (`UDP` not `udp`) in Routr payloads |
| `2167b7b` | **M2 frontend sync** — Settings UI, carrier CRUD + Routr sync, LiveKit peer card, campaign routing selector, `lib/routr/*`, migrations, `@routr/sdk` |
| `b34f95e` | Fix Routr peer upsert: no `ref` on create, no `username` on update (proto constraints) |
| `c00caac` | Fix `/api/providers` 500 on dashboard load; lazy-import SDK; `Promise.allSettled` in dashboard; RLS on `voip_providers` |
| `72c908c` | Fix `contactAddr` VARCHAR(20) limit — DNS-resolve long hostnames or omit field |

### Milestone breakdown

| Milestone | Status | What shipped |
|-----------|--------|--------------|
| **M1** | Done on `production` | Routr container + bootstrap, parallel `routing_mode`, dial path uses `LIVEKIT_SIP_ROUTR_TRUNK_ID`, SQL-only campaign toggle, validation checklist in `routr-m1-staging.md` |
| **M2** | Done on `production` | Admin Settings UI syncs carriers + LiveKit peer to Routr; campaign create/edit routing selector; API routes under `/api/routr/*` and extended `/api/providers` |

---

## 4. OpenSpec: routr-outbound-v1

The repo’s `openspec/` folder is **gitignored** (local spec workspace only), but commits and `infrastructure/routr-m1-staging.md` reference the change id **`routr-outbound-v1`**.

### Spec intent (condensed)

| Requirement | M1 | M2 |
|-------------|----|----|
| Deploy Routr alongside EVRA web stack | ✅ | ✅ |
| `campaigns.routing_mode` without breaking legacy | ✅ | ✅ |
| LiveKit single trunk → Routr | ✅ | ✅ |
| Env-based bootstrap for first carrier + LiveKit peer | ✅ | ✅ (still fallback) |
| Settings UI: add carrier → sync to Routr | — | ✅ |
| Settings UI: LiveKit peer host / ACL / password | — | ✅ |
| Campaign UI: routing mode selector | SQL only (M1) | ✅ |
| Per-campaign carrier trunk selection via Routr | — | 🔜 (M3+) |
| Inbound DIDs | — | Future |

### Rollback (from spec / staging doc)

No redeploy needed — set routing back in SQL or the campaign edit dialog:

```sql
UPDATE campaigns SET routing_mode = 'legacy' WHERE id = <campaign_id>;
```

Legacy path continues using `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` and `sip_trunks` / `campaigns.sip_trunk_id` resolution.

---

## 5. Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         BROWSER — Agent AVM UI                               │
│  SettingsView          CampaignModal / CampaignActionDialog                  │
│  (carriers, LiveKit     (routing_mode: legacy | routr)                      │
│   peer, Routr status)                                                        │
│  app/page.tsx — Play → POST /api/campaigns/:id/dial                          │
│  Polls /api/logs, /api/reports, /api/intents (unchanged)                     │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         NEXT.JS API (authenticated)                          │
│  /api/providers          → voip_providers + lib/routr/sync-provider-row      │
│  /api/routr/livekit-peer → system_settings + syncLiveKitPeer()               │
│  /api/routr/status       → list peers + trunks from @routr/sdk               │
│  /api/campaigns/:id/dial → resolveTrunkId() → placeOutboundCall()            │
│  /api/livekit/webhook, /api/calls/result (unchanged)                         │
└───────────────┬─────────────────────────────┬───────────────────────────────┘
                │                             │
                ▼                             ▼
       ┌────────────────┐           ┌────────────────┐
       │  LiveKit Cloud │           │ Routr Connect  │
       │  Agent worker  │◄──SIP────►│ EdgePort :5060 │
       │  (rooms/media) │           │ API :51908     │
       └────────┬───────┘           └────────┬───────┘
                │                            │
                │                            ▼
                │                   ┌────────────────┐
                │                   │ Twilio/Telnyx  │
                │                   │ / ZA carriers  │
                └───────────────────┴───────► PSTN ──► callee
```

**Supabase** remains the **source of truth for business config** (`voip_providers`, `campaigns`, `call_records`). Routr holds the **SIP routing config**, synced on admin save (M2) or via Docker bootstrap (M1 fallback).

---

## 6. Parallel routing modes

`campaigns.routing_mode` controls which LiveKit trunk id is used at dial time. Logic lives in `lib/outbound-call.ts` → `resolveTrunkId()`.

| Mode | LiveKit trunk used | Carrier path |
|------|-------------------|--------------|
| `legacy` (default) | `campaigns.sip_trunk_id` → `sip_trunks.livekit_trunk_id`, else `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` | LiveKit → carrier **direct** |
| `routr` | `LIVEKIT_SIP_ROUTR_TRUNK_ID` only | LiveKit → Routr → carrier |

**Misconfiguration guard:** if `routing_mode = 'routr'` but `LIVEKIT_SIP_ROUTR_TRUNK_ID` is unset, `/api/campaigns/:id/dial` returns **503** with a clear error (no silent fallback).

**Simulator:** unchanged — if LiveKit is not configured, `/dial` returns `{ mode: 'unconfigured' }` and the UI may call `/api/simulate`. Routr is not involved.

---

## 7. Frontend integration map

These files are on **`origin/production`**. Paths are relative to repo root.

### Dashboard shell — `app/page.tsx`

| Responsibility | Detail |
|----------------|--------|
| Load providers | `GET /api/providers` on login (via `Promise.allSettled` so one failure does not crash the dashboard) |
| Pass to Settings | `<SettingsView role={role} providers={providers} setProviders={setProviders} />` |
| Dial on Play | Unchanged — `POST /api/campaigns/:id/dial`; trunk resolution is server-side based on `routing_mode` |
| Poll call data | Unchanged — `/api/logs`, `/api/reports`, `/api/intents` every `NEXT_PUBLIC_POLL_INTERVAL_MS` |

**No Routr-specific code** is required in the polling or call-log views. They read `call_records` the same way regardless of routing mode.

### Settings — `components/SettingsView.tsx`

Admin-only surface (engineers see a warning; form is disabled). Three panels:

#### A. Platform → LiveKit SIP

- Fields: `sip_host` (host:port, **no** `sip:` prefix), `peer_username`, optional `allowed_cidrs`, optional `peer_password`
- Save → `PUT /api/routr/livekit-peer`
- Server stores JSON in `system_settings` (`id = routr_livekit_peer`), then calls `syncLiveKitPeer()` to upsert Routr Peer + optional ACL + credentials
- Helper text explains the **20-character `contactAddr` limit** (server DNS-resolves long hostnames)

#### B. Routr status

- On mount (admin): `GET /api/routr/status`
- Shows peer count, trunk count, and monospace rows for each peer/trunk ref
- If Routr is down: warning alert with error message (`routr_unreachable`)

#### C. Carrier trunks (Routr sync)

- Form: name, type (twilio/telnyx/sangoma), slug, SIP host/port, username/password, send_register checkbox
- Save → `POST /api/providers` → Supabase insert + `syncProviderRow()` → Routr Credentials + Trunk
- List shows each provider with sync chip: **PENDING** / **SYNCED** / **SYNC ERROR**, Routr refs, `sync_error` alert if any
- Passwords are **masked** in API responses (`********`)

### Campaign create — `components/CampaignModal.tsx`

New section **“Outbound routing”**:

```tsx
<Select name="routing_mode" defaultValue="legacy">
  <MenuItem value="legacy">Direct carrier (legacy)</MenuItem>
  <MenuItem value="routr">Via Routr</MenuItem>
</Select>
```

Submitted on `POST /api/campaigns` as `routing_mode`. Helper text points operators at `LIVEKIT_SIP_ROUTR_TRUNK_ID` (server env, not a UI field).

### Campaign edit / reuse — `components/CampaignActionDialog.tsx`

- **Edit mode:** routing mode `Select` bound to state; saved via `PUT /api/campaigns/:id` with `routing_mode`
- **Reuse mode:** copies `campaign.routing_mode` from source campaign into `POST /api/campaigns`

### Types — `lib/types/voip-provider.ts`

```typescript
export type CampaignRoutingMode = 'legacy' | 'routr'
export type RoutrSyncStatus = 'pending' | 'synced' | 'error'
export type ProviderType = 'twilio' | 'telnyx' | 'sangoma'
```

Import these in new UI instead of raw strings.

### Role gating

| Action | Required role |
|--------|---------------|
| View Settings page | Any authenticated user |
| Modify carriers / LiveKit peer | `admin` (`requireAdmin()` on API) |
| View Routr status panel | `admin` (client checks `role === 'admin'`) |

---

## 8. API routes the UI calls

### Existing routes (extended)

| Route | Method | Frontend usage | Routr-related change |
|-------|--------|----------------|----------------------|
| `/api/providers` | GET | Dashboard load, Settings list | Returns `slug`, `sync_status`, `routr_*_ref`; passwords masked; never loads `@routr/sdk` on GET |
| `/api/providers` | POST | Settings “Save carrier” | Admin only; syncs to Routr after insert |
| `/api/providers/[id]` | PATCH | (future edit flow) | Admin only; re-sync on update |
| `/api/campaigns` | POST | CampaignModal create | Accepts `routing_mode` |
| `/api/campaigns/[id]` | PUT | CampaignActionDialog edit | Accepts `routing_mode` |
| `/api/campaigns/[id]/dial` | POST | Play button | Calls `routrTrunkConfigError()` + `resolveTrunkId()` |

### New routes (M2)

| Route | Method | Auth | Response |
|-------|--------|------|----------|
| `/api/routr/status` | GET | Admin | `{ endpoint, peers[], trunks[] }` or `{ error, routr_unreachable }` |
| `/api/routr/livekit-peer` | GET | Admin | `{ settings: LiveKitPeerSettings }` (password masked) |
| `/api/routr/livekit-peer` | PUT | Admin | Saves settings + syncs peer; may return `sync_error` with 503 if Routr down |

### Response patterns junior devs should handle

```typescript
// Carrier save — partial success
{ provider: {...}, sync_error: "...", routr_unreachable: true }  // HTTP 503

// LiveKit peer save
{ settings: {...}, sync_error: "..." }

// Dial — routr misconfig
{ mode: "live", error: "Campaign routing_mode is routr but LIVEKIT_SIP_ROUTR_TRUNK_ID is not set", dispatched: 0 }
```

**UI recommendation:** surface `sync_error` and dial `error` in toasts or inline alerts — today Settings shows inline `Alert`; campaign Play does not yet show routing-specific errors prominently (good follow-up task).

---

## 9. Database fields the UI depends on

### `campaigns`

| Column | Type | UI surface |
|--------|------|------------|
| `routing_mode` | `'legacy' \| 'routr'` | CampaignModal, CampaignActionDialog |

Migration: `supabase/migrations/20260615120000_campaign_routing_mode.sql`

### `voip_providers` (extended in M2)

| Column | Purpose |
|--------|---------|
| `slug` | Routr inbound URI = `{slug}.evra.local` |
| `provider_type` | `twilio` \| `telnyx` \| `sangoma` |
| `sip_host`, `sip_port`, `sip_username`, `sip_password` | Carrier connection |
| `send_register` | Routr trunk `sendRegister` |
| `routr_trunk_ref`, `routr_credentials_ref` | Set after successful sync |
| `sync_status`, `sync_error`, `last_synced_at` | Settings sync chips |

Migration: `supabase/migrations/20260615140000_voip_provider_carrier.sql`

### `system_settings`

| Row `id` | `config` JSON |
|----------|---------------|
| `routr_livekit_peer` | `{ sip_host, allowed_cidrs?, peer_username, peer_password? }` |

---

## 10. Environment variables

Frontend devs rarely set these, but must understand them for local/staging behaviour.

| Variable | Who sets it | Effect on UI |
|----------|-------------|--------------|
| `LIVEKIT_SIP_ROUTR_TRUNK_ID` | Server / deploy | Required for `routr` campaigns to dial |
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` | Server / deploy | Legacy campaigns |
| `ROUTR_API_ENDPOINT` | Docker compose | Web app → Routr SDK (`insecure://agent-avm-sip-routr:51908`) |
| `ROUTR_PUBLIC_IP` | Server `.env` | LiveKit SIP trunk address (not shown in UI) |
| `ROUTR_LIVEKIT_SIP_HOST` | Bootstrap fallback | Pre-fills LiveKit peer if no `system_settings` row |
| `ROUTR_CARRIER_*` | Bootstrap fallback | Default Twilio trunk when UI has no providers |

See `.env.example` on `production` for the full list.

---

## 11. End-to-end call flow (Routr mode)

Sequence the junior dev should be able to explain:

1. Admin configures **LiveKit peer** and at least one **carrier** in Settings (or bootstrap did it via env).
2. Operator creates a campaign with **Routing mode → Via Routr**.
3. Operator clicks **Play** → `app/page.tsx` → `POST /api/campaigns/:id/dial`.
4. Server reads `campaign.routing_mode === 'routr'` → `resolveTrunkId()` returns `LIVEKIT_SIP_ROUTR_TRUNK_ID`.
5. For each pending contact (max 25): `createDispatch()` + `createSipParticipant(trunkId, phone, room)`.
6. LiveKit SIP sends INVITE to **Routr** (`ROUTR_PUBLIC_IP:5060`).
7. Routr routes **peer-to-pstn** to the configured carrier trunk.
8. Callee answers → agent in room → webhooks update `call_records` → dashboard polls show new rows.

**Room naming unchanged:** `avm_{campaignId}_{contactId}_{random8}`

---

## 12. What the junior dev does *not* need to touch

| Area | Location | Notes |
|------|----------|-------|
| Routr Docker / bootstrap | `docker-compose.yml`, `infrastructure/routr/` | Ops / backend |
| SDK sync implementation | `lib/routr/*` | Backend; UI only calls APIs |
| `placeOutboundCall()` | `lib/outbound-call.ts` | Already trunk-aware |
| LiveKit webhooks | `app/api/livekit/webhook/route.ts` | Unchanged |
| Agent callback | `app/api/calls/result/route.ts` | Unchanged |
| Call log / insight widgets | `InsightDashboard`, `CampaignDetail` | Read `call_records` only |

---

## 13. Testing checklist

### Local / staging — Settings UI

- [ ] Log in as **admin** → Settings loads without 500
- [ ] Log in as **engineer** → Settings shows warning; forms disabled
- [ ] Add carrier with valid Twilio/Telnyx host → row appears with **SYNCED** chip (or **SYNC ERROR** if Routr container down)
- [ ] Routr status panel lists ≥1 peer and ≥1 trunk after bootstrap
- [ ] Save LiveKit peer with `host:port` → status panel updates

### Campaign routing

- [ ] Create campaign with **Via Routr** → verify `routing_mode` in Supabase
- [ ] Edit existing campaign → change routing mode → persists on reload
- [ ] Play on `routr` campaign with env configured → call places; rows appear in dashboard within poll interval
- [ ] Play on `routr` campaign **without** `LIVEKIT_SIP_ROUTR_TRUNK_ID` → API 503; UI should show error (improve if missing)

### Regression

- [ ] `legacy` campaign still dials via old trunk resolution
- [ ] Dashboard loads if `/api/providers` fails (empty list, no white screen)
- [ ] `npm run test:routr` passes (`resolveContactAddr` unit tests)

### CLI (backend smoke test)

```bash
npm run dial -- --campaign-id <id> --contact-id <id>
```

---

## 14. Known quirks & gotchas

### `contactAddr` is VARCHAR(20) in Routr

Long LiveKit SIP hostnames (e.g. `2exlse86t0v.sip.livekit.cloud:5060`) exceed 20 chars. Server code in `lib/routr/resolve-contact-addr.ts`:

1. Strips `sip:` prefix
2. If hostname is short enough, uses as-is
3. Else DNS-resolves to IPv4 → `x.x.x.x:5060`
4. If still too long, **omits** `contactAddr` (M1 outbound still works; LiveKit trunk points at `ROUTR_PUBLIC_IP`)

Settings helper text mentions this — do not let operators paste `sip:` prefixes.

### Routr peer upsert proto rules

- **Create peer:** do not send `ref` (Routr assigns it)
- **Update peer:** do not send `username` (causes `INVALID_ARGUMENT`)
- Handled in `lib/routr/upsert-peer.ts` — UI does not need to know, but expect occasional sync errors after Routr upgrades if protos change.

### Lazy SDK import

`GET /api/providers` must not import `@routr/sdk` (gRPC bundle broke SSR / caused 500 on dashboard load). Sync only runs on `POST`/`PATCH`. If adding new provider endpoints, follow the same pattern.

### Legacy `voip_providers` rows

Rows created before M2 may lack `slug`, `sync_status`, etc. `normalizeProvider()` fills defaults client-side; migration backfills where possible.

### `CampaignActionDialog` reuse mode

Reuse copies `routing_mode` from source but does not expose a selector — intentional for M2; add UI if product wants override on copy.

---

## 15. Suggested next frontend tasks

Prioritized backlog for M3+ (not yet implemented):

| Task | Why |
|------|-----|
| Toast on `/dial` error when `routing_mode=routr` misconfigured | Operators currently only see failed dispatch in network tab |
| Badge on campaign card: **Legacy** / **Routr** | Quick visual distinction in Control Room |
| Edit carrier in Settings (PATCH flow) | Today mostly “add”; edit API exists on `production` |
| Per-campaign carrier picker | Map `campaigns.sip_trunk_id` → `voip_providers.routr_trunk_ref` at Routr layer |
| Routr status auto-refresh after carrier save | Today manually re-fetches; could poll or use response body |
| Disable **Via Routr** menu item when server env missing | Proactive guard before campaign save |

---

## Quick reference — files to open first

| If you need to… | Start here |
|-----------------|------------|
| Understand dial trunk selection | `lib/outbound-call.ts` → `resolveTrunkId()`, `routrTrunkConfigError()` |
| Build Settings UI | `components/SettingsView.tsx` |
| Campaign routing selector | `components/CampaignModal.tsx`, `components/CampaignActionDialog.tsx` |
| API contracts | `app/api/providers/route.ts`, `app/api/routr/*` |
| Types | `lib/types/voip-provider.ts`, `types/index.ts` (`routing_mode` on Campaign) |
| Full architecture | `infrastructure/routr_integration.md` (on `production`) |
| Staging / rollback | `infrastructure/routr-m1-staging.md` (on `production`) |

---

*Questions: check commit `2167b7b` (M2 PR body) or the infrastructure docs. For agent worker / webhook contracts, see `docs/livekit-outbound-integration.md`.*
