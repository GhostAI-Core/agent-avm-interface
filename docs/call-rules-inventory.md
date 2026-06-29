# Call Rules Inventory

_The complete set of rules that govern an outbound call, in lifecycle order. Sourced from the
callops orchestrator (`evra_callops/app/`) and the LiveKit agent worker (`evra_callops/agent/`).
Last reconciled against live source: 2026-06-26._

> Authoritative sources:
> - Dispatch guards — `evra_callops/app/services/queue_dispatcher.py`, `evra_callops/app/guards/`
> - In-call flow — `evra_callops/agent/call_handler.py`
> - Retry / consent — `evra_callops/app/services/call_result_handler.py`

---

## ① Before a call is placed — dispatch guards
_`app/services/queue_dispatcher.py` + `app/guards/`_

| Rule | Value | Scope |
|---|---|---|
| **Calling window** | `time_window_start`–`end`; global tz, **no default** (unset ⇒ 24/7), inclusive bounds, no midnight-wrap | per-campaign |
| **Concurrency cap** | `max_concurrent` (live DB count, multi-instance safe) | per-campaign |
| **Rate limit** | `dialing_speed` (token bucket) | per-campaign |
| **Eligibility filter** | only `status ∈ {pending, retry}` **and** `do_not_call = false` are enqueued | — |

## ② Ringing — waiting for pickup
_`agent/call_handler.py`_

| Rule | Value | Outcome on timeout |
|---|---|---|
| **No-answer drop** (wait for SIP participant to join) | `_SIP_WAIT_TIMEOUT = 30s` | `no_answer` |
| **Connect drop** (wait for SIP to become active) | `_SIP_ACTIVE_WAIT_TIMEOUT = 60s` | `no_answer` |

## ③ Answered — answering-machine detection (runs *before* anything plays)
_Silero VAD + LiveKit `AMD`; `AMD_OUTCOME_MAP` in `agent/call_handler.py`_

| AMD verdict | Action |
|---|---|
| `human` / `uncertain` | continue to playback |
| **`machine-vm`** | → `voicemail`, hang up, **no message played** |
| `machine-ivr` | → `no_answer`, hang up |
| `machine-unavailable` | → `no_speech`, hang up |
| AMD error | fall back to `human` (continue) |

## ④ Human answered — settle delay
- `_POST_ANSWER_AUDIO_DELAY_SECONDS = 2.0s` before the AVM message starts (so the opening words aren't clipped over the callee's "hello?").

## ⑤ Playback
- Streams the campaign voice recording (PCM); sets `outcome = "answered"`. Stops early if the caller hangs up mid-message (`disconnect_event`).

## ⑥ Decision — DTMF window
- Listens for keys `[transfer_key, opt_out_key, subscribe_key]` (whichever are set) during playback.
- **No-decision drop:** if nothing is pressed, wait `_DTMF_POST_PLAYBACK_TIMEOUT = 4.0s` after playback → `dtmf_timeout` → hang up.
- **Key precedence (first match wins):**
  1. **`opt_out_key`** (default `"9"`) → `outcome = "opt_out"`, hang up
  2. **`transfer_key`** (only if `transfer_target` is set) → SIP transfer to target, `transferred = true`, `outcome = "callback"`
  3. **`subscribe_key`** (default `"1"` on AVM-consent campaigns with no transfer target) → `outcome = "subscribe"`, hang up

## ⑦ Outcome reporting
- The worker **always** POSTs the outcome to callops `/calls/outcome` with `talk_seconds`, `transferred`, `amd_category`, `dtmf_digits`, `disconnect_reason`, timestamps, SIP fields, and a batched event stream.

## ⑧ After the call — retry rules
_`app/services/call_result_handler.py`_

| Rule | Value |
|---|---|
| **Retriable outcomes** | `{no_answer, busy, voicemail}` (everything else terminal) |
| **Retry cap** | `voicemail` → **3** (`VOICEMAIL_MAX_RETRIES`); all others → `campaign.max_retries` |
| **Re-dial spacing** | re-enqueued after `campaign.retry_cooldown_seconds` (flat delay, no jitter) |
| **Exhausted** | retriable-but-capped → status `failed`; terminal → status `dialed` |
| **opt_out** | never retried |

## ⑨ Consent (post-call)
- **opt_out** → contact `do_not_call = true` + status `do_not_call` + one-way STS relay
- **subscribe** → one-way STS relay
- STS relay is isolated — a broken/slow STS can never affect the call record, retry logic, or the concurrency-slot release.

---

### Cross-reference: the four in-call timing rules

| Rule | Stage | Constant | Value |
|---|---|---|---|
| Talk delay before the message | ④ | `_POST_ANSWER_AUDIO_DELAY_SECONDS` | 2.0s |
| Drop after no answer | ② | `_SIP_WAIT_TIMEOUT` | 30s |
| Drop on voicemail detection | ③ | `AMD_OUTCOME_MAP["machine-vm"]` | terminal |
| Drop after no decision post-script | ⑥ | `_DTMF_POST_PLAYBACK_TIMEOUT` | 4.0s |
