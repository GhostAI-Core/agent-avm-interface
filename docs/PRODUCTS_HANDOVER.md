# Products Feature — Handover

**Audience:** a developer picking up this codebase to test/extend the "Products" feature, and to verify the outbound campaign pipeline is production-ready end to end.
**Scope:** replacing the hardcoded `campaigns.agent` (`seeker` / `grace`) + `STS_AGENT_PRODUCT_MAP` pairing with a real, data-driven `products` entity, wiring it through the campaign wizard/edit dialog/reports (§2–§6), **plus** a full functional test of the core dial/script/egress pipeline that's independent of the Products work (§8).
**As of:** `evra_callops` commit `720d122`, `agent-avm-interface` commit `150e429`.

---

## Testing Steps (quick checklist)

Work top to bottom. Every item links to the section with full detail (exact payloads, SQL, expected values) — use this list to track progress, use the linked section when you need the specifics.

**A. Environment sanity** (§7.1)
- [ ] Backend: `cd evra_callops && .venv/bin/python -m pytest -q` → expect ~364 passed / 28 pre-existing failures (baseline, unrelated to this feature)
- [ ] Frontend: `npx tsc --noEmit`, `npx eslint .`, `npm run build` all clean

**B. Migration/backfill already applied — just re-confirm** (§7.2)
- [ ] Run the two SQL checks in §7.2 — confirm `products` has `Seeker` + `Lead Gen` for company 10, and its 4 campaigns are linked via `product_id`

**C. Backend Products API smoke test** (§7.3)
- [ ] `GET /companies/{id}/products` returns the backfilled products
- [ ] `POST /companies/{id}/products` (lead_gen) → 201; duplicate name → 409; sts_subscription without `sts_product_key` → 422
- [ ] `POST /products/{id}/versions` → auto-increments `version`, repoints `current_version_id`
- [ ] `POST /products/{id}/versions/{id}/activate` → rolls back `current_version_id`
- [ ] `PATCH /products/{id}` with `active:false` → disappears from `?active=true` list

**D. Frontend — Products view** (§7.4)
- [ ] Backfilled products show with correct integration-type badge
- [ ] Create a product of each `integration_type` (confirm `sts_product_key` field only shows for STS Subscription)
- [ ] Generate + save a script version via the voice generator; publish a 2nd version and roll back to the 1st

**E. Frontend — Campaign creation wizard** (§7.5)
- [ ] Product dropdown populates per company and refetches on company change
- [ ] Picking a product pre-fills script text/audio/voice/duration + updates the ETA estimate
- [ ] Created campaign's `product_id`/`routing_mode`/`sts_product`/`agent` match the resolution rules in §4.2
- [ ] Overriding the script before submit keeps *your* audio, not the product's default

**F. Frontend — Campaign edit dialog** (§7.6)
- [ ] Editing an existing `Seeker` campaign pre-selects its product + loads saved script (not blank)
- [ ] Changing product updates `routing_mode`/`sts_product`/`agent` on save
- [ ] Changing just the voice persists `campaigns.voice_id` (previously-broken regression, test specifically)
- [ ] Publishing a new product version does **not** auto-apply to an already-saved campaign until it's re-saved (see quirk #2, §6)

**G. Frontend — Reports filter (the reported bug)** (§7.7)
- [ ] "Agent" filter dropdown now lists real product names, not just Seeker/Grace/Sangoma
- [ ] Filtering by product narrows the table/totals correctly
- [ ] Company with zero products still shows a working legacy fallback dropdown
- [ ] Table rows, CSV export, and Campaign Detail chip show `product_name` when present

**H. Products end-to-end** (§7.8)
- [ ] New `lead_gen` product → real/test campaign → dials, outcomes land, **no** STS relay fires
- [ ] `sts_subscription` product → STS subscribe endpoint actually fires on a `subscribed` outcome
- [ ] A campaign untouched by this migration (`product_id IS NULL`) still dials fine off legacy `agent`/`routing_mode`

**I. Core pipeline — pre-flight health** (§8.2)
- [ ] `GET /health` and `GET /livekit/health` on CallOps both healthy
- [ ] `npm run callops -- status|snapshot|watch <campaignId>` all work

**J. Core pipeline — script generation (TTS)** (§8.3)
- [ ] `POST /api/tts/generate` (Inworld) returns playable audio
- [ ] `POST /api/tts/save` uploads to the `avm_scripts` Supabase storage bucket — open the returned public URL directly and confirm it plays
- [ ] Saved URL lands on `campaigns.voice_recording_url` or `product_script_versions.audio_url`
- [ ] Measured `duration_seconds` is accurate (feeds the ETA calc)

**K. Core pipeline — create + run a real campaign** (§8.4)
- [ ] Campaign with real dialable test numbers dials out after `POST /campaigns/{id}/start`
- [ ] `max_concurrent` / `dialing_speed` / time-window are actually respected
- [ ] Script audio played on the call matches what was generated; AMD doesn't misfire on a live pickup; DTMF branches correctly
- [ ] Call end produces a `call_records` row with correct `outcome`/`business_disposition`, contact status updates

**L. Core pipeline — egress recording to storage** (§8.5)
- [ ] `call_sessions.recording_url` (and `call_records.recording_url` once linked) populates after the call
- [ ] Recording URL opens and plays real call audio — bucket `LIVEKIT_RECORD_BUCKET` (e.g. `call-recordings`)
- [ ] Confirm the `egress_ended` webhook actually reached CallOps (`POST /livekit/webhook`)
- [ ] Check the egress-before-outcome race case: `GET /calls/{id}/recording` falls back to `call_sessions.recording_url` correctly
- [ ] Confirm `LIVEKIT_RECORD_*` env vars are actually set in the environment under test (unset = silent no-op, not an error)

**M. Core pipeline — outcome reconciliation** (§8.6)
- [ ] Outcomes land in `call_records` via the authoritative CallOps path (`POST /calls/outcome`), not just the dashboard's backfill-only route
- [ ] Test at least: answered+subscribed, no-answer, hangup, voicemail

**N. Core pipeline — sanity checks without a real call** (§8.7)
- [ ] `POST /livekit/test-call` and `npm run callops -- test-call` isolate SIP-trunk-only issues
- [ ] `npm run callops -- outcome <campaignId> <contactId> <outcome>` simulates the outcome webhook
- [ ] `POST /campaigns/{id}/prefetch-audio` doesn't error for the resolved `voice_recording_url`

---

## 1. TL;DR — read this before anything else

> ✅ The database migration for this feature (`20260706100000_products.sql`) **has been applied to production** (`evra_avm` / `ytozpjohaphinlsqrxlc`). The `products` and `product_script_versions` tables exist and the backfill has run — confirmed live: company 10 now has `Seeker` (`sts_subscription`) and `Lead Gen` (`lead_gen`) products, and its 4 existing campaigns are correctly linked via `product_id`. No Grace/Sangoma products were created because no campaigns with those `agent` values exist in production yet — the backfill only creates a product where a matching legacy campaign actually exists, which is correct behavior, not a bug.

> **If your priority is "can we actually run a real outbound campaign" rather than the Products feature specifically, skip straight to §8** — it covers campaign create/run, CallOps dialing, script generation/playback, and egress recording to Supabase storage, independent of whether Products is wired up yet.

- "Product" = "Script." A product bundles a versioned script (text + voice + generated audio) with a consent-flow type (`integration_type`): `sts_subscription` (fires the STS subscribe endpoint, e.g. Seeker/Grace) or `lead_gen` (registers the opt-in locally only, no external push — e.g. Sangoma, or a brand-new lead-gen product).
- Campaigns now reference a product via `campaigns.product_id` instead of being hardcoded to `agent = 'seeker' | 'grace'`. Versioning means "Insurance Product A v2" is just a new row in `product_script_versions` under the same product — the product's identity (and its link into STS) doesn't change.
- This is **additive**: the legacy `campaigns.agent` / `campaigns.routing_mode` / `campaigns.sts_product` columns still exist and are what the dispatcher and STS relay actually read at dial time. The new `_resolve_product_fields()` function derives those legacy columns from the chosen product at campaign create/update time. Nothing downstream of campaign save had to change.
- Existing "Seeker", "Grace", "Lead Gen", and "Sangoma" campaigns get backfilled into equivalent `products` rows by the migration itself, so old campaigns keep working unmodified.

---

## 2. Why this exists

Previously, "which script does this campaign use" and "which agent config is this" were two disconnected things: the agent (`seeker`/`grace`/hardcoded Lead Gen) was a fixed enum baked into the frontend `DIAL_MODES` toggle and backend `STS_AGENT_PRODUCT_MAP`, while the actual script text/voice/audio was either typed fresh each time or pulled from an unversioned "reuse" library with no link back to a campaign identity.

The business need: campaigns should be organized around a **product** (e.g. "Insurance Product A"), which owns a script that can be revised over time ("v2") without losing the product's identity or its STS wiring. A product is also either subscription-based (external STS push) or lead-gen (local opt-in only) — and neither of those should require a code change to add (previously, adding a new agent meant editing a hardcoded map in both repos).

---

## 3. Data model

New tables (migration `evra_callops/supabase/migrations/20260706100000_products.sql`):

```
products
  id                  bigint PK
  company_id          bigint FK -> companies (products are scoped per-company)
  name                text                          -- e.g. "Seeker", "Insurance Product A"
  integration_type    text  'sts_subscription' | 'lead_gen'
  sts_product_key     text  nullable                -- required iff sts_subscription (e.g. "psychic")
  active              boolean default true
  current_version_id  bigint FK -> product_script_versions, nullable
  created_at / updated_at
  UNIQUE (company_id, name)

product_script_versions
  id                  bigint PK
  product_id          bigint FK -> products
  version             int                           -- auto-incrementing per product, starts at 1
  text                text nullable                 -- script text
  voice_id            text nullable                 -- TTS voice used
  audio_url           text nullable                 -- generated audio (S3)
  duration_seconds    numeric nullable              -- measured client-side, used for ETA calc
  created_by          uuid FK -> auth.users
  created_at
```

New columns on `campaigns`:

```
campaigns.product_id          bigint FK -> products, nullable
campaigns.product_version_id  bigint FK -> product_script_versions, nullable  -- NULL = "track current version"
campaigns.sts_product         text, nullable                                  -- materialized STS key at write time
```

`product_version_id` left `NULL` means "always use whatever the product's current version is" — but note this is resolved **at campaign save time**, not live at dial time (see §4 quirk). Pinning a specific `product_version_id` locks the campaign to that exact script version even if the product gets a newer one later.

Backfill: the migration creates one `products` row per company for each of "Seeker" (`sts_subscription`), "Grace" (`sts_subscription`), "Lead Gen" (`lead_gen`), and "Sangoma" (`lead_gen` — it never had an STS product mapping to begin with), and links existing campaigns with `lower(agent)` matching those names to the new product via `campaigns.product_id`.

---

## 4. Backend changes (`evra_callops`)

### 4.1 New API — `app/api/products.py`

All routes JWT-authenticated + company-scoped (`assert_company_scope`), same pattern as every other CallOps route.

| Method | Path | Purpose |
|---|---|---|
| GET | `/companies/{company_id}/products` | List products for a company (`?active=true` to filter) |
| POST | `/companies/{company_id}/products` | Create a product. 422 if `integration_type` invalid, or `sts_subscription` without `sts_product_key`. 409 on duplicate name per company. |
| GET | `/products/{id}` | Get one product |
| PATCH | `/products/{id}` | Update name / integration_type / sts_product_key / active |
| GET | `/products/{id}/versions` | List script versions, newest first |
| POST | `/products/{id}/versions` | Add a new version (auto-increments `version`). `set_current: true` (default) also repoints `products.current_version_id`. |
| POST | `/products/{id}/versions/{version_id}/activate` | Roll back/promote — repoints `current_version_id` at an existing version without creating a new one |

All product/version mutations emit audit events (`product.created`, `product.updated`, `product.version_created`, `product.version_activated`).

### 4.2 Campaign integration — `app/api/campaigns.py`

`_resolve_product_fields(db, company_id, product_id, product_version_id)`:
1. Loads the product, 422s if not found or belongs to a different company.
2. Resolves the script version: the explicitly-pinned `product_version_id`, or else the product's `current_version_id`.
3. Derives:
   - `routing_mode` = `"script"` if `integration_type == "sts_subscription"` else `"lead"`
   - `sts_product` = the product's `sts_product_key` if subscription, else `null`
   - `agent` = the product's name, lowercased, **only if** it's one of the legacy values CallOps still recognizes elsewhere (`_LEGACY_AGENT_VALUES`) — otherwise `null`. This is a best-effort backward-compat label, not load-bearing for new products.
   - `voice_recording_url` / `voice_id` from the resolved script version, **if present on the version**.

**Precedence rules — this is the part most likely to surprise you:**
- **On create** (`POST /companies/{id}/campaigns`): `routing_mode`, `sts_product`, and `agent` are **always overwritten** by the product's values once a `product_id` is supplied — even if the request body also sent explicit values for those fields. Script fields (`voice_recording_url`, `voice_id`) only fall back to the product's version **if the caller didn't already supply their own** (lets a campaign use a one-off custom script without touching the product).
- **On update** (`PATCH /campaigns/{id}`): it's the other way around — if the body includes both `product_id` and an explicit `routing_mode`/`agent`, **the explicit body value wins** (`updates = {**product_fields, **updates}`). In practice the frontend never sends both at once, but if you're calling the API directly for testing, know this asymmetry exists.
- `product_version_id` is resolved to concrete audio/voice **once, at save time** — it is not re-resolved at dial time. If you publish a new version on a product after a campaign was saved with `product_version_id = NULL` ("track current"), you must **re-save the campaign** (PATCH with `product_id` again) to pick up the new audio; a live campaign will keep dialing with whatever `voice_recording_url` got materialized onto it at the last save.

### 4.3 `app/db/queries.py`

Campaign detail queries now also select `product_id` so the frontend can display/re-edit which product a campaign is on.

---

## 5. Frontend changes (`agent-avm-interface`)

### 5.1 New shared libs

- **`lib/products.ts`** — `fetchProductsForCompany(companyId)`, `fetchCurrentVersion(productId)`. Single source of truth for product fetching, used by `CampaignModal`, `CampaignActionDialog`, `ProductsView`, and the Reports filter.
- **`lib/scheduleEstimate.ts`** — `measureAudioDuration()`, `formatDuration()`, `estimateRunSeconds()`. Extracted so the ETA calculation (dialing speed × contact count × script duration + DTMF response buffer) is identical in the create wizard and the edit dialog.

### 5.2 New proxy routes

`app/api/products/route.ts`, `app/api/products/[id]/route.ts`, `app/api/products/[id]/versions/route.ts`, `app/api/products/[id]/versions/[versionId]/activate/route.ts` — thin proxies to the CallOps endpoints above, same Bearer-forwarding pattern as every other route in `utils/callops.ts`.

### 5.3 New view — `components/ProductsView.tsx`

New sidebar entry ("Products"). Lets a user:
- List/create products per company, set `integration_type` (with an `sts_product_key` field that appears only for `sts_subscription`).
- Open a product to generate/save a new script version via the existing `VoiceGenerator` (text → TTS → measure duration → save as a new `product_script_versions` row), and activate/roll back to a previous version.

### 5.4 `components/CampaignModal.tsx` (create wizard)

The old hardcoded `DIAL_MODES` toggle (Seeker/Grace/Lead Gen buttons) is gone. In its place:
- A product `<Select>` populated from `fetchProductsForCompany(companyId)` — re-fetched whenever the selected company changes.
- Picking a product pre-fills the script step (text, audio URL, voice ID, duration) from `fetchCurrentVersion(productId)`.
- The create payload now sends `product_id` (and `product_version_id` if the user pinned a specific version rather than "current").
- ETA now factors in the pre-filled script's `duration_seconds` via `estimateRunSeconds()`.

### 5.5 `components/CampaignActionDialog.tsx` (edit / reuse dialog)

Same product picker as the modal, plus:
- On open (edit mode), pre-selects the campaign's existing `product_id` and loads its current script version — guarded so it doesn't clobber the campaign's already-saved script text on first render.
- **Now actually sends `voice_id` on edit** — this was previously never wired at all, meaning editing a campaign's voice never persisted, even though both the backend and the PUT proxy already supported it (fixed as a side-effect of this work).
- Added ETA estimation to the edit dialog (didn't exist before): fetches pending contact count for edit mode, derives contact count from the uploaded CSV for reuse mode.

### 5.6 Reports — `app/page.tsx`, `app/api/reports/route.ts`, `types/index.ts`, `components/CampaignDetail.tsx`

This is the fix for the ticket you raised ("Agent filter still hardcoded to Seeker/Grace/Sangoma"):
- `app/api/reports/route.ts` now fetches each company's campaigns + products, builds a `campaign_id → product_id → product_name` lookup, and attaches `product_id`/`product_name` onto every report row. It accepts a `?product_id=` query param for filtering, falling back to the legacy `?agent=` param if not supplied (so old bookmarked filter states / API callers don't break).
- `app/page.tsx`'s Reports filter dropdown is now populated live from `fetchProductsForCompany()` across the user's companies. **If a company has products, only its products show in the dropdown, not the 3 legacy names.** If a company has zero products (e.g. a company that predates this feature and hasn't had any products created for it yet), it falls back to the old hardcoded `Seeker/Grace/Sangoma` list so the filter isn't just empty.
- The dropdown's value is prefixed (`product:<id>` or `agent:<name>`) so a single `<Select>` can serve both filter types; `reportsQueryParams()` translates that into the right query param.
- Table rows and CSV export now show `product_name` when present, falling back to `agent`.

---

## 6. Known quirks / things that will trip you up

1. **Create vs. update precedence is asymmetric** — see §4.2. Don't assume PATCH behaves like POST if you're testing the API directly (e.g. with curl/Postman) rather than through the UI.
2. **`product_version_id = NULL` isn't "live-updated"** — a running campaign does not pick up a newly-published product version automatically. You must re-save the campaign. This is called out in the `_resolve_product_fields` docstring; don't "fix" it without checking whether the dispatcher would need a live join instead (bigger change, wasn't in scope here).
3. **The `agent` field on a new custom product will be `null`**, not the product's name — it's only populated for the 4 legacy names (`seeker`, `grace`, `lead_gen`... check `_LEGACY_AGENT_VALUES` in `app/api/campaigns.py` for the exact set). Anywhere in the codebase still reading `campaign.agent` directly (instead of `campaign.product_id` → product name) will show blank/null for new products. `CampaignDetail.tsx` and the Reports table were updated to prefer `product_name`; audit anywhere else that reads `.agent` before assuming it'll show something sensible for a new product.
4. **Reports filter degrades to the legacy 3-agent list per company** if that company has no products yet (pre-migration, or a company that was never backfilled). Don't be surprised if two companies show different dropdown option sets during the transition period.
5. **Sangoma is `lead_gen`, not its own integration type** — per product decision, "lead gen" is a consent-flow category, not a product name. Sangoma just happens to be the pre-existing example of a lead-gen product with no STS mapping. Nothing stops you from creating more lead-gen products (e.g. an "Outsurance" product that pushes leads elsewhere in future) — that's the whole point.

---

## 7. Testing checklist for your developer

Work through this in order. Each section assumes the previous one passed.

### 7.1 Environment sanity

```bash
# Backend
cd evra_callops
.venv/bin/python -m pytest -q
# Baseline: ~364 passed / 28 pre-existing failures (unrelated to this feature — auth/outcome/trunk
# tests that were already red before this change; if the count moves significantly, investigate).

# Frontend
cd agent-avm-interface
npx tsc --noEmit
npx eslint .
npm run build
```

All three frontend commands should be clean (no new errors). If `tsc`/`eslint` are already clean on `main`, any red here is a regression from this feature.

### 7.2 Migration/backfill sanity (already applied — just re-confirm state)

```sql
select company_id, name, integration_type, sts_product_key from public.products order by company_id, name;

select c.id, c.name, c.agent, c.product_id, p.name as product_name
from public.campaigns c
left join public.products p on p.id = c.product_id
where lower(c.agent) in ('seeker','grace','lead_gen','sangoma')
order by c.id;
```

Confirmed live as of this migration: company 10 has `Seeker` (`sts_subscription`, key `psychic`) and `Lead Gen` (`lead_gen`) products, and its 4 campaigns (`Vas Inc 100 live test`, `Vas Inc next batch 100 live test`, `lead test 1`, `Lead Gen Live Test`) are all correctly linked via `product_id`. **No Grace or Sangoma products exist** — that's correct, since no production campaign currently has `agent` = `grace` or `sangoma`; the backfill only creates a product where a matching legacy campaign actually exists. If you add a company/campaign with those legacy agent values later, you'll need to create the corresponding product manually via the Products view (the migration backfill is a one-time, already-run script — it won't retroactively catch new data).

### 7.3 Backend API smoke test (via `/docs` Swagger UI or curl, using a real Bearer token)

1. `GET /companies/{id}/products` — should return the backfilled products for a real company (e.g. `Seeker` + `Lead Gen` for company 10).
2. `POST /companies/{id}/products` with `{"name": "Test Product QA", "integration_type": "lead_gen"}` → 201, product returned with `current_version_id: null`.
3. Same call again with the same name → 409 conflict (unique per company).
4. `POST /companies/{id}/products` with `{"name": "Test STS QA", "integration_type": "sts_subscription"}` (no `sts_product_key`) → 422 validation error.
5. `POST /products/{id}/versions` on the Test Product QA product with some `text` → 201, `version: 1`, and the product's `current_version_id` should now point at it (`GET /products/{id}` to confirm).
6. Add a second version, then `POST /products/{id}/versions/{first_version_id}/activate` → confirm `current_version_id` rolls back to the first version.
7. Delete/deactivate: `PATCH /products/{id}` with `{"active": false}` → confirm it no longer shows in `GET /companies/{id}/products?active=true`.

### 7.4 Frontend — Products view

1. Log in, go to the new **Products** sidebar entry.
2. Confirm the backfilled products (`Seeker`, `Lead Gen` for company 10) show up with the right integration type badge.
3. Create a new product through the UI (both integration types — confirm the `sts_product_key` field only appears for STS Subscription).
4. Open a product, generate a script via the voice generator, save it as a new version, confirm it becomes "current."
5. Publish a second version, then roll back to the first — confirm the UI reflects which version is active.

### 7.5 Frontend — Campaign creation wizard (`CampaignModal`)

1. Start a new campaign, pick a company, confirm the product dropdown populates with that company's products (and refetches if you change the company).
2. Pick an existing product with a current script version — confirm script text/audio/voice/duration pre-fill in the script step, and the ETA estimate updates once contacts are uploaded (should reflect script duration + DTMF buffer per contact ÷ pacing).
3. Create the campaign. Then, via Supabase/API, confirm `campaigns.product_id`, `routing_mode`, `sts_product` (if STS product), and `agent` landed correctly per the resolution rules in §4.2.
4. Repeat with a `lead_gen` product — confirm `routing_mode = 'lead'` and `sts_product` is `null` on the created campaign.
5. Create a campaign, then override the pre-filled script (type new text / generate new audio) before submitting — confirm the campaign saves with *your* audio/voice, not the product's default (per the "explicit fields win for script, not for routing" rule).

### 7.6 Frontend — Campaign edit dialog (`CampaignActionDialog`)

1. Open one of the existing backfilled `Seeker` campaigns for edit — confirm its product is pre-selected correctly and its previously-saved script text/voice loads (not blank).
2. Change the product on an existing campaign, save, confirm the campaign's `routing_mode`/`sts_product`/`agent` update to match the new product.
3. Change just the voice (leave product/script otherwise alone), save, confirm `campaigns.voice_id` actually persists this time (this was broken before this change — regression-test it specifically).
4. Open the "reuse as template" flow (new campaign seeded from an old one's CSV/config) — confirm contact count derives from the CSV and the ETA estimate is sane.
5. Publish a new script version on a product a campaign is already using (with that campaign's `product_version_id` left as "track current," not pinned), then re-open and re-save that campaign — confirm it now picks up the new version's audio (see quirk #2 in §6 — it will *not* pick it up automatically without a re-save).

### 7.7 Frontend — Reports filter (the specific bug that was fixed)

1. Go to Reports. Confirm the "Agent" filter dropdown is now labeled/populated with real product names for companies that have products (not just Seeker/Grace/Sangoma).
2. Filter by a specific product — confirm only that product's campaign rows show, and the count/totals update accordingly.
3. Confirm a company with zero products still shows a working (legacy) fallback dropdown rather than an empty one.
4. Check the report table rows and CSV export — confirm they display the product name (not blank/legacy agent) for campaigns tied to a new custom product.
5. Open Campaign Detail for a campaign with a product — confirm the chip there also shows the product name.

### 7.8 End-to-end (the real test — do this last, ideally with Cale)

1. Create a brand-new product (e.g. not `Seeker`/`Lead Gen`) with a real script + generated audio, `integration_type = lead_gen`.
2. Build a small real (or test-number) campaign against it end-to-end: upload contacts → confirm ETA looks right → launch → confirm calls dial, dispatcher reads the right `voice_recording_url`/`voice_id`, and outcomes land correctly (no STS relay should fire, since it's lead_gen — confirm in CallOps logs).
3. Repeat with an `sts_subscription` product (existing `Seeker`, or a new one with a real `sts_product_key`) — confirm the STS subscribe endpoint actually fires on a `subscribed` outcome, using the resolved `sts_product` on the campaign.
4. Confirm nothing broke for a campaign that was never touched by this migration (an old campaign that predates products entirely, if any exist with `product_id IS NULL` — should still dial fine off its legacy `agent`/`routing_mode` columns, since those weren't removed).

---

## 8. Core pipeline functional test — "can we actually run an outbound campaign"

Section 7 tests the **Products feature** specifically. This section tests the **underlying campaign pipeline itself** — create → run → dial → play script → record → report outcome — independent of products. Run this regardless of whether you're touching products at all; it's the real "is this production ready" test.

### 8.1 How a campaign actually turns into a phone call (so you know what you're checking at each step)

```
1. POST /companies/{id}/campaigns/{id}/start   (CallOps, app/routes/campaigns.py::start_campaign)
     → validates SIP trunk, sets campaigns.status = "running"
     → ContactEnqueuer.enqueue_campaign()  writes pending contacts into a per-campaign
       Postgres queue (PGMQ), queue name campaign_{id}_calls
       (app/services/contact_enqueuer.py, app/db/queries.py)
     → QueueDispatcher.run(campaign_id) starts a background polling loop
       (app/services/queue_dispatcher.py, poll interval = dispatcher_idle_sleep_seconds, default 1s)

2. QueueDispatcher._dispatch_loop(), every tick:
     → checks campaign status, TimeWindowGuard (dialing hours), max_concurrent (active session count),
       RateLimiter (dialing_speed)
     → dequeues one contact, marks it in_progress, builds a room name
       (app/livekit/room_name.py::build_call_room_name -> "call-{digits}-{contact_id}-{attempt}")
     → LiveKitClient.dispatch_call() -> api.agent_dispatch.create_dispatch()
       (app/livekit/client.py) — this ONLY dispatches an agent job. CallOps itself never
       places the SIP call directly.
     → upsert_call_session() creates the call_sessions row at T0 (dial attempt recorded)

3. The LiveKit agent worker (a separate long-running process, agent/main.py) picks up the
   dispatched job:
     → dial_sip_under_amd() -> ctx.api.sip.create_sip_participant() actually places the SIP
       call over the campaign's trunk (agent/amd_flow.py)
     → on answer/AMD-pass, fetches the campaign's script audio (voice_recording_url, resolved
       via app/voice_recording.py::resolve_voice_recording_url) and plays it
       (agent/call_handler.py::_run_script_consent_flow / _play_audio)
     → starts room-composite egress recording in parallel (see §8.4)
     → on call end, OutcomeReporter.report() POSTs the result to CallOps
       (agent/outcome_reporter.py -> POST /calls/outcome)

4. CallOps: call_outcome() -> CallResultHandler.handle_outcome()
   (app/routes/calls.py, app/services/call_result_handler.py)
     → writes/updates the call_records row, updates contact status, links call_record_id
       to the call_sessions row from step 2, schedules a retry via the queue if applicable

5. LiveKit fires an `egress_ended` webhook once the recording upload finishes ->
   POST /livekit/webhook (app/routes/livekit/webhooks.py, app/services/livekit_webhook_handler.py)
     → writes the recording's storage URL onto call_sessions.recording_url, and onto
       call_records.recording_url if call_record_id is already linked
```

**Important:** the script's `voice_id` is only used for the DTMF confirm-phase clip (bundled local WAV files, `agent/confirm_script_audio/{voice_id}.wav`) — it is **not** used for live TTS during the main pitch. The main script is always pre-generated audio (`voice_recording_url`), played back verbatim. If confirm-phase is skipped (`dtmf_single_press_subscribe=True`, the current default), `voice_id` may never even get exercised on a call — don't be surprised if it "does nothing" audibly in a quick test.

### 8.2 Pre-flight health checks (no real call needed)

```bash
# CallOps reachable + healthy
curl https://<callops-host>/health
curl https://<callops-host>/livekit/health     # confirms LiveKit API connectivity from CallOps

# From the frontend repo — CLI helper wraps CallOps + Supabase reads
cd agent-avm-interface
npm run callops -- status <campaignId>          # campaign status, contact counts, active sessions
npm run callops -- snapshot <campaignId>         # one-shot Supabase + CallOps state dump
npm run callops -- watch <campaignId>            # polls status live while a campaign runs
```

### 8.3 Script generation (TTS) — does it work end to end

1. In the UI (Products view or `VoiceGenerator` inside the campaign wizard), type script text and generate audio.
2. Confirm `POST /api/tts/generate` succeeds (Inworld TTS, `INWORLD_API_KEY`) and returns playable audio in the browser.
3. Save it — confirm `POST /api/tts/save` (`lib/avm-script-storage.ts::uploadCampaignScript`) succeeds and returns a public URL.
4. **Check the actual storage bucket** (Supabase Storage, S3-compatible API — bucket from `AVM_SCRIPT_AUDIO_STORAGE_BUCKET`, e.g. `avm_scripts`): confirm a new object landed at `{prefix}{slugified-name}-{dd-mm-yyyy}.mp3` and that the public URL actually resolves (open it directly in a browser — not just "the API said 200").
5. Confirm the returned URL gets written onto `campaigns.voice_recording_url` (create flow) or `product_script_versions.audio_url` (Products flow) — query the row directly, don't just trust the UI state.
6. Duration: confirm `measureAudioDuration()` produced a sane `duration_seconds` (compare against actually playing the clip) — this number feeds the ETA calculation, so a wrong value silently makes every campaign's ETA wrong.

### 8.4 Create + run a campaign — the real test

1. Create a campaign with a small batch of **real, dialable test numbers** (your own cell, a colleague's, or a SIP soft-phone you control) and a valid SIP trunk.
2. Start it (`POST /campaigns/{id}/start` via the UI or `npm run callops -- start <campaignId>`).
3. Watch it dial: `npm run callops -- watch <campaignId>` or poll `GET /companies/{id}/campaigns/{id}` — confirm contacts transition `pending -> in_progress -> completed/failed` and `call_sessions` rows appear.
4. **Confirm max_concurrent / dialing_speed are actually respected** — if you set `max_concurrent: 1`, you should never see more than one `in_progress` contact at a time; if you set a slow dialing speed, calls shouldn't fire back-to-back instantly.
5. **Confirm time-window enforcement** — set a `time_window_start`/`end` that excludes "now" and confirm the dispatcher holds off (no dials) until the window opens (or skip this by setting a window that includes now, and separately confirm the `TimeWindowGuard` code path exists/is covered by its tests — `app/services/queue_dispatcher.py`).
6. Answer the test call. Confirm:
   - The script audio actually plays and matches what you generated in §8.3 (not stale/cached audio from a previous version).
   - AMD (answering machine detection) doesn't misfire on a live human pickup.
   - DTMF works if the script includes an opt-in/transfer key (press the key, confirm the flow branches correctly).
7. Let the call end (hang up, or let it complete naturally). Confirm within a few seconds:
   - `call_records` gets a row with the correct `outcome` / `business_disposition`.
   - The contact's status updates accordingly (don't stay stuck `in_progress`).
   - If it's an `sts_subscription` product/campaign and the outcome was `subscribed`, confirm the STS relay actually fired (check CallOps logs / STS project) — see §8.6.

### 8.5 Egress / recording — does it actually save to storage

1. After the test call in §8.4 completes, check `call_sessions.recording_url` (and `call_records.recording_url` once outcome links them) — should be populated within roughly the egress upload time (a few seconds to ~1 minute for a short call).
2. **Open the recording URL directly** and confirm it plays and contains actual call audio (not silence, not truncated) — bucket is `LIVEKIT_RECORD_BUCKET` (e.g. `call-recordings`), path `{LIVEKIT_RECORD_PREFIX}/{room-name}.ogg` (default prefix `recordings`).
3. Confirm the `egress_ended` webhook actually reached CallOps: check CallOps logs for `POST /livekit/webhook`, or query `call_sessions` before/after to confirm `recording_url` transitioned from null to populated (don't just assume it worked because the call completed).
4. **Race condition to specifically check**: if egress finishes uploading *before* the outcome webhook links `call_record_id` to the session (steps 4 and 5 in §8.1 can arrive out of order), the recording URL may sit on `call_sessions` only, with `call_records.recording_url` staying null. Confirm `GET /calls/{id}/recording` (the frontend's actual read path) falls back to `call_sessions.recording_url` correctly in that case — don't just check the raw `call_records` row and conclude recording is broken if it's actually just sitting on the session row.
5. If `LIVEKIT_RECORD_BUCKET` (or the other `LIVEKIT_RECORD_*` env vars) is unset/misconfigured, recording is **silently skipped entirely** (`_start_recording()` no-ops) — the call will otherwise work fine with no recording and no error. Explicitly confirm these env vars are set in whichever environment you're testing before concluding "recording is broken" vs. "recording was never enabled here."

### 8.6 Outcome reconciliation — don't trust just one write path

There are two separate places outcomes can be written, and only one is authoritative for the real pipeline:

- **Authoritative**: agent -> `POST /calls/outcome` -> CallOps `CallResultHandler.handle_outcome()`. This is what a real campaign uses.
- **Secondary/backfill only**: dashboard's `POST /api/calls/result` (`app/api/calls/result/route.ts`) — an insert-if-missing fallback for when the primary write failed. **Nothing in CallOps forwards outcomes to this route** — if you only see call results appearing via this path and never via CallOps directly, that's a red flag, not a working system.

Test: trigger one call of each meaningfully different outcome if you can (answered+subscribed, no-answer, hangup, voicemail) and confirm each lands in `call_records` with the correct `outcome`/`business_disposition` **from the CallOps path**, not just "a row eventually appeared."

### 8.7 Sanity checks that don't require a real phone call

If you want to validate wiring without spending real call minutes:

- `POST /livekit/test-call` (CallOps) — places a one-off real SIP call **without** going through the agent/campaign pipeline, useful to isolate "is the SIP trunk itself working" from "is the campaign/agent pipeline working."
- `npm run callops -- test-call <+E164> [--trunk ST_xxx] [--from +E164]` (frontend CLI) — same idea, scriptable.
- `npm run callops -- outcome <campaignId> <contactId> <outcome>` — simulates the `POST /calls/outcome` webhook directly, letting you verify CallOps' outcome-handling/reconciliation logic (§8.6) without an actual call.
- `POST /dispatch/job` — dispatches a single contact without running the full campaign start flow, useful for isolating dispatcher/agent-dispatch behavior.
- `POST /campaigns/{id}/prefetch-audio` — warms the shared audio cache (`AUDIO_CACHE_DIR`) ahead of a run; confirm this doesn't error for whatever `voice_recording_url` the campaign/product resolved to (a 404/format error here means the *first real dial* would have had to fetch+decode audio cold, or fail).

Relevant existing backend tests to lean on rather than re-deriving from scratch: `tests/test_livekit_dispatch.py`, `tests/test_dispatch_voice_id.py`, `tests/test_livekit_webhook.py` (egress → recording_url), `tests/test_call_result_handler.py`, `tests/test_campaign_trunk_validation.py`, `tests/agent/test_amd_dial_flow.py`.

---

## 9. Git state

- **`evra_callops`**: committed, `main`, commit `720d122` ("Enhance campaign management and product integration"), on top of `0954124`. Working tree clean.
- **`agent-avm-interface`**: committed, `main`, commit `150e429` ("feat(products): integrate product management into campaigns and reports"), on top of `73d5493`. Working tree clean.

Nothing is pending a commit, and the database migration has also been applied to production (§1, §7.2) — there is no outstanding deploy step left for this feature.
