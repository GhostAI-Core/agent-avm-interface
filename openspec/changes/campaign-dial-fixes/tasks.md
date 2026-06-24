## 1. Trunk FK binding (dashboard)

- [x] 1.1 Bind the wizard Trunk dropdown value to `sip_trunks.id` (integer), not `livekit_trunk_id` — `components/CampaignModal.tsx`
- [x] 1.2 Keep `Number(sip_trunk_id)` normalization (`'' | null → null`, else int) in `app/api/campaigns/route.ts`
- [x] 1.3 Accept + normalize `sip_trunk_id` in the campaign PUT route — `app/api/campaigns/[id]/route.ts`
- [ ] 1.4 Verify end-to-end: create a campaign via the wizard, confirm `campaigns.sip_trunk_id` is the integer FK and `/start` no longer 422s

## 2. Lifecycle proxy error surfacing (dashboard)

- [x] 2.1 Pass callops 4xx status + `detail` through; reserve `502` for 5xx/unreachable — `app/api/campaigns/[id]/[action]/route.ts` (POST + GET)
- [ ] 2.2 Confirm a missing-trunk start now shows `campaign_missing_sip_trunk` in the UI instead of a blank 502

## 3. Contact visibility bridge (dashboard)

- [x] 3.1 Set `contacts.campaign_id = campaign.id` on every linked contact in the create route — `app/api/campaigns/route.ts`
- [x] 3.2 Add the inline comment documenting why (callops reads the FK, not the M:N join) + the decision pointer
- [ ] 3.3 Verify callops `/campaigns/{id}/status` reports non-zero `pending` for a freshly created wizard campaign

## 4. Dispatcher single-consumer (callops — cross-repo, evra_callops)

- [x] 4.1 Add a done-callback in `QueueDispatcher.run()` to remove the task from `_tasks` when the loop ends — `app/services/queue_dispatcher.py`
- [ ] 4.2 Deploy callops with the fix
- [ ] 4.3 Verify a completed campaign can be re-started and immediately consumes its queue (no Pause→Start needed)

## 5. Enumeration-model convergence — DECIDED: callops adopts campaign_contacts (Option A)

- [x] 5.1 Decision recorded in proposal/design/supabase-database spec: `campaign_contacts` join is authoritative
- [ ] 5.2 callops: `get_pending_contacts` enumerates `campaign_contacts` (status `pending`/`retry`) joined to `contacts` for identity — `evra_callops/app/db/queries.py`
- [ ] 5.3 callops: `count_contacts_by_status` counts join-row status per campaign
- [ ] 5.4 callops: `update_contact_status` writes the per-campaign **join row** status, not `contacts.status`
- [ ] 5.5 callops: `contact_enqueuer` + `startup_watchdog` operate on the join
- [ ] 5.6 callops: deploy + verify a wizard campaign dials reading only the join (no `contacts.campaign_id`)
- [ ] 5.7 dashboard: remove the `contacts.campaign_id` dual-write bridge from the create route — **only after 5.6 verifies** (else dialing re-breaks)
- [ ] 5.8 Update `supabase-database` spec to drop the transitional-bridge scenario once 5.7 lands

## 6. Validation

- [ ] 6.1 `openspec validate campaign-dial-fixes --strict`
- [ ] 6.2 Lint/typecheck the changed dashboard files
