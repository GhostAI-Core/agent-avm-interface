## 1. Dashboard — mode toggle (ours, doable now)

- [ ] 1.1 `components/CampaignModal.tsx`: replace the Product `<Select>` (seeker/grace) with a `ToggleButtonGroup` — Seeker / Grace / Lead Gen (exclusive, required)
- [ ] 1.2 Map the toggle to state → payload: Seeker→`{agent:'seeker',routing_mode:'script'}`, Grace→`{agent:'grace',routing_mode:'script'}`, Lead Gen→`{agent:'lead_gen',routing_mode:'lead'}`
- [ ] 1.3 Forward `routing_mode` in `app/api/campaigns/route.ts` (create payload) and add to the PUT whitelist in `app/api/campaigns/[id]/route.ts`
- [ ] 1.4 Gate the Lead Gen option (disabled / "coming soon") until CallOps ships the lead mode — flag-driven so it flips on easily
- [ ] 1.5 Verify: create a Seeker + a Grace campaign, confirm `agent` + `routing_mode` land; typecheck + build

## 2. CallOps — lead-gen gate (Cale, cross-repo)

- [ ] 2.1 `CampaignCreate`/`CampaignUpdate` accept `routing_mode` (column exists; models don't — same gap as voice_id)
- [ ] 2.2 Agent `mode == "lead"`: on `subscribe_key` press → outcome `lead`; SKIP `_CONSENT_RELAY` (no STS SUBSCRIBE); SKIP two-step confirm audio
- [ ] 2.3 Add `lead` to `_OUTCOME_MAP` / outcome vocab, `call_records.outcome` CHECK, and the contact-status path
- [ ] 2.4 Confirm dispatcher passes `routing_mode` through to `CallJobMetadata.mode` (already reads `campaign.routing_mode`)

## 3. Coordination

- [ ] 3.1 Flag the CallOps gate to Cale (Issue/PR) — press-1→lead, no STS, no confirm; accept routing_mode
- [ ] 3.2 Once CallOps lead mode is deployed, un-gate the Lead Gen toggle + verify a lead campaign end-to-end (press-1 → `lead`, no STS relay)
