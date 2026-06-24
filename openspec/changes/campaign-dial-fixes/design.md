## Context

The dashboard hands campaign lifecycle to callops (the production dialer/orchestrator) over `/api/campaigns/{id}/{action}`; callops reads Supabase, enqueues contacts into per-campaign pgmq queues, and dispatches LiveKit SIP calls. On 2026-06-24 a full trace of campaign 49 showed a wizard-created campaign going `running` and dialing nobody, surfaced to the operator only as a blank `502`. Four independent defects were on the path; each is small, but together they made the failure opaque. Most of the implementation already landed during the live debug; this change documents it and isolates the one item that is a genuine architecture decision rather than a bug.

## Goals / Non-Goals

**Goals:**
- A campaign that passes validation actually dials.
- Operators see the real reason a start fails, not a generic `502`.
- A re-started campaign always gets a live queue consumer.
- Settle the contact-enumeration contract (DECIDED: callops adopts `campaign_contacts`) and converge both sides onto it.

**Non-Goals:**
- Replacing callops as the dialer.
- Removing or redesigning the M:N `campaign_contacts` model.
- Fixing the downstream SIP/carrier leg (calls now dispatch but the carrier currently drops them — separate, callops/LiveKit-owned).

## Decisions

- **Trunk dropdown binds `sip_trunks.id`, not `livekit_trunk_id`.** callops resolves the trunk by integer FK; the UI must submit that FK. The `Number(sip_trunk_id)` coercion in the create/update routes is kept as the normalization point (`'' | null → null`, else integer).
- **Proxy forwards callops status for 4xx, 502 only for 5xx/unreachable.** A 4xx from callops is operator-actionable config (e.g. missing trunk); masking it as `502` hid the cause. 5xx and transport failures remain `502`.
- **Contact enumeration → `campaign_contacts` join (DECIDED 2026-06-24, Option A).** callops adopts the M:N join the dashboard already uses; this keeps one canonical contact per phone, which is what makes cross-campaign frequency capping (`dial_number_state` keyed by phone) and per-contact consent coherent. The dashboard's `contacts.campaign_id` write stays as a **transitional bridge** so the current callops build keeps dialing. **Sequencing matters**: callops must ship the join read *before* the bridge is removed, or dialing re-breaks. Order: (1) callops reads/writes via `campaign_contacts`, (2) verify, (3) remove the dashboard `campaign_id` dual-write.
- **Dispatcher loop self-cleans `_tasks`.** A done-callback removes the campaign's task from `QueueDispatcher._tasks` when the loop ends, so `run()`'s `if id in _tasks: return` guard can never permanently block a restart. `stop()` still handles the cancel path. Implemented in `evra_callops`; documented here because the dashboard cannot fix it and operators need the Pause→Start recovery in the meantime.

## Risks / Trade-offs

- **Dual-write divergence**: writing both `contacts.campaign_id` and `campaign_contacts` means a contact reused across campaigns is owned by the last campaign (single FK). Acceptable short-term; the decision requirement exists to retire it.
- **Cross-repo coupling**: the dispatcher fix lives in `evra_callops`, so this change isn't fully "done" until that deploys. Mitigated by the documented Pause→Start recovery.
- **Status-passthrough surface**: forwarding callops `detail` to the browser exposes orchestrator vocabulary (e.g. `campaign_missing_sip_trunk`) to operators. Acceptable — it's the actionable signal — but UI copy may want to humanize common cases later.
