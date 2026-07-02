## 1. Network filter control (dashboard — the main gap)

- [ ] 1.1 `components/CampaignModal.tsx`: add a network `Select` — `All networks` / `Vodacom` / `MTN` / `Cell C` → state → `network_provider` (null for "All")
- [ ] 1.2 Confirm the create route (`app/api/campaigns/route.ts`) + PUT whitelist already forward `network_provider` (they do) — no route change needed
- [ ] 1.3 Verify end-to-end: create a `network_provider="MTN"` campaign, confirm CallOps stores it (validated) and the enqueuer filters

## 2. Contact list network breakdown (dashboard visibility)

- [ ] 2.1 Compute counts per `Vodacom`/`MTN`/`Cell C`/`unknown` from the per-contact `network_provider` (already returned by `/api/campaigns/{id}/contacts`)
- [ ] 2.2 Render the breakdown in `ContactsView` (or the campaign view) above the table

## 3. contacts.network_provider population

- [ ] 3.1 Verify whether the campaign-create contact-insert path derives `network_provider` (CallOps `contacts.py` upload does; batches 74/75 are 0% → likely the wizard path does not)
- [ ] 3.2 If not derived: either fix the create path to derive it (CallOps — flag to Cale) or backfill from the E.164 prefix; confirm with a service-role read

## 4. Retire the orphaned /dial network gate

- [ ] 4.1 Delete `app/api/campaigns/[id]/dial/route.ts` + the `isAllowedNetwork` clause in `lib/compliance/gate.ts`; keep `lib/networks.ts` for labelling (coupled with `db-schema-cleanup` Tier 2, which drops `campaign_contacts`/`compliance_events` used only by `/dial`)
- [ ] 4.2 Confirm nothing imports the removed pieces; typecheck + build

## 5. Decision / future (NOT this change)

- [ ] 5.1 Singular `network_provider` (this change) vs multi-select `allowed_providers` set — the set needs a CallOps schema + enqueuer change; flag to Cale as a future enhancement if operators need "MTN + Vodacom together"
