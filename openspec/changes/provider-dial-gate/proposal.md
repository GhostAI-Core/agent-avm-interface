## Why

We may only dial mobile networks vetted/approved to ride for a campaign (Vodacom / MTN / Cell C). **Re-scoped 2026-07-02** after checking CallOps openspec + graph + code: the earlier premise ("the live CallOps dispatcher has **zero** provider gating") is **wrong** — CallOps already enforces a per-campaign network filter on the live path:

- CallOps `campaign-network-filter` spec + code: `campaigns.network_provider` (`Vodacom`/`MTN`/`Cell C`, or null = all), validated on create/update (422 on invalid). **`ContactEnqueuer.enqueue_campaign()` only enqueues contacts whose `network_provider` matches** (null-provider contacts skipped when the filter is set). `start_campaign` + the startup watchdog honour it.
- CallOps `sa-network-prefix-lookup`: `app/utils/networks.py network_provider(phone)` maps E.164 → operator, and **`app/api/contacts.py` derives + stores `network_provider` on every contact insert**.
- Dashboard already **forwards `network_provider`** on campaign create + PUT, and `ContactsView` renders a per-contact **Network** column.

So the **enforcement gate exists**. The real gaps are dashboard + data:

1. **No UI to SET the filter.** `CampaignModal` has no network control, so operators can't say "this campaign is MTN-only" even though the payload + CallOps support it.
2. **No list-level visibility.** There's a per-contact Network column but no **breakdown** (counts per network + unknown) before dialing.
3. **`contacts.network_provider` is 0% populated** on the wizard-created batches (74/75) — CallOps derives it on the `contacts.py` upload path, but the campaign-create contact-insert path may not, so the filter would exclude everyone. Needs verifying/backfilling.
4. **Singular vs set.** CallOps is **single-provider (or all)**; the original "allowed_providers set" (MTN + Vodacom together) is an *enhancement*, not what exists.

## What Changes

- **Dashboard: add a network filter control** to campaign create/edit — a select for `All networks` / `Vodacom` / `MTN` / `Cell C` that persists `campaigns.network_provider`. The create route + PUT already forward it and CallOps validates + enforces it, so this is end-to-end today.
- **Dashboard: list network breakdown** — show counts per network (+ `unknown`) for a campaign's contacts, so an operator sees the mix before dialing (reuse `lib/networks.ts networkProvider()` for labelling; or the per-contact `network_provider` from `/api/campaigns/{id}/contacts`).
- **Verify/backfill `contacts.network_provider`** on the wizard-created path so the filter has data (CallOps already derives it on `contacts.py` upload; confirm the campaign-create insert does too, else backfill via the E.164 prefix).
- **Retire the orphaned `/dial` route's network clause** — `app/api/campaigns/[id]/dial/route.ts` + `gateContacts`' `isAllowedNetwork` check are dead (nothing calls `/dial`; CallOps owns the gate). Keep `lib/networks.ts` for UI labelling only. (Ties to `db-schema-cleanup` Tier 2.)

## Non-goals (documented, NOT built)

- **Multi-provider `allowed_providers` set** (e.g. MTN + Vodacom together). CallOps is single-provider; a set would need a CallOps schema + enqueuer change (flag to Cale as a future enhancement). This change stays with the existing singular `network_provider`.
- **Live HLR / number-portability lookup** — this is an ICASA allocation-prefix filter; a ported number may sit on a different network. Certainty needs an HLR API. Out of scope, flagged.
- Non-SA / landline dialing policy beyond the existing region guard.
- Changing the prefix→provider tables (`lib/networks.ts` / CallOps `app/utils/networks.py` are the source of truth).

## Impact

- **Dashboard:** `components/CampaignModal.tsx` (network select → `network_provider`); a contacts network breakdown (in `ContactsView` or the campaign view); `lib/networks.ts` retained for labelling; delete `app/api/campaigns/[id]/dial/route.ts` + the network clause in `lib/compliance/gate.ts`.
- **Data:** ensure `contacts.network_provider` populated on the wizard path (verify/backfill).
- **CallOps:** none required (enforcement already exists) — except the optional future `allowed_providers` set.

## Capabilities

### New Capabilities

- `provider-selection`: the dashboard lets an operator set a campaign's single allowed network (persists `campaigns.network_provider`) and shows the contact list's network breakdown before dialing.

### Modified Capabilities

- `legacy-outbound-calling`: the network-allow-list clause in the orphaned dashboard `/dial` gate is removed; provider gating is owned by CallOps' enqueuer.
