# Call-lifecycle rules & behavioral test checklist

Source of truth = callops (`/home/garthsghost/evra_callops`, branch reviewed: `origin/main` @ 6eb2ea1)
plus the LiveKit agent worker in `evra_callops/agent/`. Every rule below cites real `file:line`. Items
marked **⚠ CONFIRM** are gaps or ambiguities between expected behavior and what's actually implemented —
decide these before writing the assertion.

---

## A. Canonical vocabulary (the contract the UI + Supabase must match)

From `app/api/lookups.py` + DB CHECK constraints:

- **Campaign statuses** (`lookups.py:7`, `migrations/20260625100002`): `draft, ready, running, paused, stopped, completed, archived, deleted`
- **Contact statuses** (`lookups.py:8`, `migrations/20260625100003`): `pending, in_progress, dialed, failed, retry, archived, do_not_call`
- **Call outcomes** (`lookups.py:9`): `pending, connected, qualified, voicemail, no_speech, hangup, ni, dnq, callback, no_answer, busy, failed`
- **Agent outcomes** (`lookups.py:10`): `connected, opt_out, qualified, not_interested, callback, voicemail, no_answer, busy, failed, transfer`
- **Calling windows** (`lookups.py:11-15`): `business_hours` (08:00–17:00), `extended_hours` (07:00–20:00), `all_day`

- [ ] Dashboard `CampaignStatus` union == campaign-statuses lookup (currently missing `ready`)
- [ ] Any UI outcome/status vocab is sourced from `/lookups/*`, not hardcoded

---

## B. Contact lifecycle state machine

Statuses mutate the contact row **in place** (no new contact rows); each dial attempt appends one
`call_records` row. Identifiers `contact_id`, `campaign_id`, `phone` are immutable across transitions.

| # | Transition | New status | Where |
|---|---|---|---|
| B1 | created | `pending` | `api/contacts.py:99-103` |
| B2 | enqueuer picks up (filters `pending`/`retry` AND `do_not_call=false`) | (enqueued) | `db/queries.py:65-71` |
| B3 | dispatcher dequeues + dials | `in_progress` | `services/queue_dispatcher.py:105-108` |
| B4 | LiveKit dispatch fails (SIP/dispatch error) | back to `pending` | `queue_dispatcher.py:185-187` |
| B5 | retriable outcome, retries remaining | `retry` (retry_count++) | `call_result_handler.py:131-149` |
| B6 | retriable outcome, retries exhausted | `failed` | `call_result_handler.py:150-156` |
| B7 | non-retriable outcome | `dialed` | `call_result_handler.py:150-156` |
| B8 | opt-out (agent_outcome=`opt_out`) | `do_not_call` + `do_not_call=true` | `call_result_handler.py:110-115` |
| B9 | API `POST /contacts/{id}/do-not-call` | `do_not_call` + `do_not_call=true` | `api/contacts.py:267-276` |

- [ ] B1 create → `pending`
- [ ] B3 dispatch → `in_progress`, `last_attempted_at` set
- [ ] B4 dispatch error → reverts to `pending` (re-eligible)
- [ ] B5 first `no_answer` (retry_count 0, max_retries 2) → `retry`, retry_count=1, delayed re-enqueue with `attempt+1` after `retry_cooldown_seconds`
- [ ] B6 `no_answer` at retry_count == max_retries → `failed`, no re-enqueue
- [ ] B7 `connected`/`voicemail`/`no_speech` → `dialed` (terminal)  **⚠ CONFIRM voicemail terminal — see G3**
- [ ] B8 opt-out → `do_not_call=true`, never re-enqueued (`queries.py:65-71` excludes it)
- [ ] B9 API DNC → same, emits audit `contact.do_not_call`

**Retry rule** (`call_result_handler.py:131`): retry only if `outcome ∈ {no_answer, busy}` AND
`retry_count < max_retries` AND `agent_outcome != "opt_out"`. Opt-outs are never retried even on no_answer.

---

## C. In-call behavioral rules (agent worker `agent/call_handler.py`)

Constants (`call_handler.py:21-23`): `_SIP_WAIT_TIMEOUT=30s`, `_SIP_ACTIVE_WAIT_TIMEOUT=60s`,
`_DTMF_POST_PLAYBACK_TIMEOUT=4.0s`.

| # | Rule | Behavior | Outcome reported | Where |
|---|---|---|---|---|
| C1 | SIP participant never joins (30s) | give up | `no_answer` | `:239-243` |
| C2 | SIP never goes active (60s) | give up | `no_answer` | `:276-293` |
| C3 | AMD = `machine-vm` (voicemail) | hang up, **no message left** | `voicemail` | `:25-32, 305-306` |
| C4 | AMD = `machine-ivr` | hang up | `no_answer` | `:29, 305-306` |
| C5 | AMD = `machine-unavailable` (no audio/dead) | hang up | `no_speech` | `:30, 305-306` |
| C6 | AMD = `human`/`uncertain` | proceed to playback | (continue) | `:27,31,304` |
| C7 | audio plays to completion | default success | `answered` | `:328` |
| C8 | DTMF opt-out key (default `9`) | hang up + flag DNC | `opt_out` | `:373-376` |
| C9 | DTMF transfer key (+ target + client) | transfer to live agent | `callback` | `:378-388` |
| C10 | DTMF subscribe key (press 1) | hang up | `subscribe` | `:392` |
| C11 | no DTMF within 4s after playback | hang up | `answered` (unchanged) | `:338-355` |
| C12 | audio url missing / fetch fails / bad mode / exception | — | `failed` | `:268-273,315-318,397-402` |

DTMF detail: digits accumulate and match on **endswith** (`:165-170`); precedence opt-out → transfer →
subscribe (`:370-395`).

- [ ] C1/C2 unanswered → `no_answer`
- [ ] C3 voicemail → `voicemail`, hangs up without leaving a message
- [ ] C5 dead air / no audio → `no_speech` + hangup
- [ ] C7 normal completion → `answered`
- [ ] C8 press 9 → `opt_out` (drives B8 DNC)
- [ ] C10 press 1 → `subscribe`
- [ ] C11 silence after playback → 4s then hangup, stays `answered`

**⚠ CONFIRM C-gaps (expected vs implemented):**
- **G1 — "2 seconds audio after a call":** there is **no** post-answer delay constant. Playback starts
  immediately after AMD (`:328`). If a 2s pre-roll/settle is required, it is **not implemented** — decide
  whether to add it (and whether it's before playback or a trailing pad).
- **G2 — "hang up if no audio":** only AMD-at-start (`machine-unavailable`→`no_speech`) and the 4s
  post-playback DTMF timeout cause hangups. There is **no ongoing mid-call silence detector**. If "no
  audio from callee for N seconds → hang up" is the rule, it's **not implemented**.

---

## D. Outcome → call_records mapping (orchestrator)

`call_result_handler.py:18-27`:
```
RETRIABLE_OUTCOMES = {"no_answer", "busy"}
_OUTCOME_MAP = { answered→connected, no-answer→no_answer, ivr→failed, opt_out→opted_out, subscribe→subscribed }
_CONSENT_RELAY = { subscribed→subscribe, opted_out→opt_out }   # STS relay only for these
```

- [ ] `answered` stored as `connected` in `call_records.outcome`; `agent_outcome` stored raw
- [ ] `opt_out` → outcome `opted_out` + STS `relay_opt_out` (`:166-192`)
- [ ] `subscribe` → outcome `subscribed` + STS `report_avm_result(...,"SUBSCRIBE")`
- [ ] `call_records` is append-only (one row/attempt; unique on `room`); `call_logs` counter incremented (`busy`→`busy_line` column, `queries.py:180`)

**⚠ CONFIRM D-gaps:**
- **G4 — hyphen vs underscore:** `_OUTCOME_MAP` key is `"no-answer"` (hyphen) but the agent reports
  `"no_answer"` (underscore, `call_handler.py`). The hyphen key is **dead**; `no_answer` passes through
  unmapped (still works for retry since it's in `RETRIABLE_OUTCOMES`, but the map entry is misleading).
- **G3 — voicemail/no_speech not retriable:** only `no_answer`/`busy` retry. `voicemail` and `no_speech`
  go straight to `dialed` (terminal). Confirm that's the business intent (often voicemail warrants a retry).

---

## E. Compliance / suppression

- Local gate: enqueuer excludes `do_not_call=true` (`queries.py:65-71`). That's the **only** pre-dial gate.
- STS is the system of record for consent (`app/sts/client.py`): opt_out → `/cancel`, subscribe →
  AVM result `SUBSCRIBE`. `query_subscriber` (global DNC + per-number status) **exists but is NOT wired
  into pre-dial** (`client.py:241-248`).

- [ ] opt-out relays to STS and flags local `do_not_call`
- [ ] **⚠ G5 — pre-dial STS DNC check not enforced.** Confirm whether dialing must query STS global DNC
  before each call, or local `do_not_call` is sufficient for now.

---

## F. Time-window (auto-pause) enforcement

`guards/time_window.py` + `services/campaign_watcher.py:105-140` (poll = `watcher_poll_interval_seconds`).

- [ ] window closes while `running` → auto `paused` + `auto_paused=true` + dispatcher stopped (`main.py:73-77`)
- [ ] window opens while `paused` AND `auto_paused` → auto `running` + re-enqueue + dispatcher restart (`main.py:79-86`)
- [ ] a **manual** pause (`auto_paused=false`) is NOT auto-resumed
- [ ] null window = always in-window
- [ ] `POST /dispatch/job` outside window → 422 `outside_time_window` (`routes/dispatch.py`)

---

## G. Data-write sanity (per call)

- [ ] one `call_records` row per attempt (immutable) — `call_result_handler.py:66-80`
- [ ] `call_logs` per-campaign counters incremented once per outcome — `queries.py:187-193`
- [ ] `call_sessions` upserted by `room`; `call_session_events` append-only, deduped on `external_id`
- [ ] `call_records.contact_id` / `campaign_id` always populated and match the dialed contact

---

## Open decisions to resolve with Cale (the ⚠ items)
G1 (2s audio), G2 (no-audio mid-call hangup), G3 (voicemail retry?), G4 (no-answer map key typo),
G5 (pre-dial STS DNC gate). These are behavioral-rule gaps, not dashboard bugs — they live in callops/agent.
