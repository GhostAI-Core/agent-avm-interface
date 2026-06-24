## Why

Wizard-created campaigns could not place calls. Three defects in the dashboard dial path plus one in the callops dispatcher combined so that a campaign with a valid trunk, audio, and contacts went `running` and dialed nobody — while the UI reported only a blank `502`. All four were diagnosed live on 2026-06-24 (campaign 49). This change records the fixes and forces a decision on a real data-model drift between the dashboard and callops.

## What Changes

- **Trunk FK binding**: the New Campaign wizard's Trunk dropdown bound its value to `livekit_trunk_id` (the `ST_…` string) and submitted that as `sip_trunk_id`. The create route runs `Number(sip_trunk_id)` → `NaN` → stored `NULL`, so callops rejected `/start` with `422 campaign_missing_sip_trunk`. The dropdown MUST bind to the integer `sip_trunks.id` (the FK callops resolves).
- **Lifecycle proxy error surfacing**: `app/api/campaigns/[id]/[action]/route.ts` collapsed every callops non-2xx into a generic `502` and discarded the `detail`. It MUST pass a callops 4xx status + `detail` through, reserving `502` for 5xx / unreachable.
- **Contact visibility — DECIDED 2026-06-24**: the create route links contacts only via the M:N `campaign_contacts` join with `contacts.campaign_id = null`, but callops enumerates contacts by `contacts.campaign_id`, so it saw zero contacts and dialed nobody (verified: setting `campaign_id` flipped callops `pending` 0→3). **Decision: callops adopts the `campaign_contacts` join as the authoritative contract**, aligning to the M:N model the dashboard already uses (one canonical contact per phone; per-campaign status on the join; cross-campaign frequency/consent stay coherent). The create route's `contacts.campaign_id` write is a **transitional bridge**, removed once callops ships the join read. Note: `contacts.status` CHECK only allows pending/in_progress/dialed/failed/retry (no 'completed').
- **Dispatcher single-consumer (callops, cross-repo)**: `QueueDispatcher.run()` no-ops when the campaign id is already in `self._tasks`, and `_tasks` is only cleaned in `stop()`. A loop that ends on its own leaves a dead task, so the next `/start` enqueues contacts but starts no consumer — campaign `running`, full pgmq queue, nothing dialed. The loop MUST remove itself from `_tasks` on completion. Tracked here for visibility; implemented in `evra_callops`.

## Capabilities

### New Capabilities

- `campaign-dial-reliability`: guarantees that a campaign which passes validation actually dials — correct trunk FK submission, actionable error surfacing from callops, and a single live queue consumer per running campaign.

### Modified Capabilities

- `supabase-database`: contacts created for a campaign MUST be discoverable by the dialer's enumeration model; documents the `contacts.campaign_id` vs `campaign_contacts` contract and the `contacts.status` allowed values.

## Impact

- **Frontend**: `components/CampaignModal.tsx` (trunk dropdown binds `sip_trunks.id`).
- **API**: `app/api/campaigns/route.ts` (set `contacts.campaign_id` on create), `app/api/campaigns/[id]/route.ts` (PUT accepts/normalizes `sip_trunk_id`), `app/api/campaigns/[id]/[action]/route.ts` (proxy passes callops status + detail).
- **callops (cross-repo, `evra_callops`)**: `app/services/queue_dispatcher.py` (`run()` done-callback clears `_tasks`).
- **Data**: relies on `contacts.campaign_id`, `contacts.status` CHECK (`pending|in_progress|dialed|failed|retry`), `campaigns.sip_trunk_id` FK → `sip_trunks.id`.
- **Out of scope**: replacing callops as the production dialer; the M:N `campaign_contacts` migration itself; resolving the model drift (this change only forces the decision).
- **Operational**: until the callops dispatcher fix is deployed, a re-started campaign is recovered with Pause → Start.
