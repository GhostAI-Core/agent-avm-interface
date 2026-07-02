## Why

Campaign creation currently exposes a **Product** dropdown (`Seeker` / `Grace`) that sets `campaigns.agent`. The operators want this reframed as **mode toggles** — `Seeker`, `Grace`, and a new **`Lead Gen`** — because the campaign's *behaviour*, not just a product label, is what they're choosing.

Verified against CallOps `origin/main` (openspec + graph + code):
- The agent's dispatch `mode` comes from **`campaigns.routing_mode`** (default `"script"`); `subscribe_key="1"`, `opt_out_key="9"`.
- **Only `mode == "script"` is implemented** — the two-step consent/subscribe flow: press-1 → `subscribed` → **STS relay `SUBSCRIBE`** to the product (`agent` = seeker/grace). Any other mode → `unsupported_mode` error.
- Outcome vocab has `subscribed`/`opted_out` but **no `lead`**.

So **Seeker/Grace already work** (they're `script` mode with a product) — the toggle is a pure dashboard change. **Lead Gen is genuinely new**: "press 1 → become a lead", with **no product subscribe, no STS relay, no two-step confirm**. That requires a new CallOps gate.

## What Changes

- **Dashboard: replace the Product `<Select>` with a `Seeker | Grace | Lead Gen` toggle** (`ToggleButtonGroup`, already used for voice mode). The toggle maps to the campaign payload:
  - `Seeker` → `agent: "seeker"`, `routing_mode: "script"`
  - `Grace`  → `agent: "grace"`,  `routing_mode: "script"`
  - `Lead Gen` → `agent: "lead_gen"`, `routing_mode: "lead"`
- **Dashboard: forward `routing_mode`** in the campaign create + PUT payloads (forward-compatible — CallOps ignores unknown fields today, like `voice_id` did, until its models accept it).
- **CallOps (Cale — the new gate):** implement `routing_mode="lead"`: on `subscribe_key` press, record outcome **`lead`** (not `subscribed`), **skip the STS consent relay** and **skip the two-step confirm audio**; add `lead` to the outcome vocab + `call_records.outcome` CHECK and the contact-status path; `CampaignCreate/CampaignUpdate` accept `routing_mode`.

## Non-goals

- Building the CallOps `lead` mode itself — that's CallOps-owned (documented here as the dependency + flagged to Cale). The dashboard side is forward-compatible and safe to ship first.
- Changing Seeker/Grace behaviour — they remain `script`/consent mode; only the selector UI changes.
- Lead nurturing / CRM export of leads — out of scope; this only captures the `lead` outcome.
- A per-campaign product beyond the three toggles.

## Impact

- **Dashboard:** `components/CampaignModal.tsx` (toggle instead of Select; map to `agent` + `routing_mode`); `app/api/campaigns/route.ts` + `app/api/campaigns/[id]/route.ts` (forward `routing_mode`).
- **DB:** `campaigns.routing_mode` already exists (dispatcher reads it). No dashboard migration.
- **CallOps dependency:** `routing_mode="lead"` gate + `lead` outcome + `routing_mode` on the campaign models. Until shipped, a `Lead Gen` campaign would hit `unsupported_mode` — so the toggle must not be marked production-ready until CallOps lands the gate (flagged to Cale).

## Capabilities

### New Capabilities

- `campaign-dial-mode-selection`: campaign creation offers a Seeker/Grace/Lead-Gen toggle that persists the matching `agent` + `routing_mode`, replacing the product dropdown.
