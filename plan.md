# Plan — Clean DB · Telephony-sourced campaign selectables · Inworld voice generation

Four pieces. Decisions locked: read Telephony from the localStorage mock store ·
wipe ops data but keep users+settings · guard demo fallbacks · keep file upload AND
add a script→Inworld generator.

## 1. SQL wipe script — `scripts/wipe-demo-data.sql`
- `TRUNCATE ... RESTART IDENTITY CASCADE` for: `campaigns, contacts, call_logs,
  call_records, intent_stats, security_logs, companies`.
- **Keep:** `profiles` (logins), `system_settings`, `sip_trunks`, `voip_providers`,
  `dashboard_templates` (user layouts).
- Wrapped in a transaction; each table guarded with `to_regclass(...)` so a missing
  table is skipped, not an error. Run via Supabase SQL editor / psql.
- Note (not SQL): the `voice-recordings` storage bucket and the browser's
  `voxi.telephony.mock.v1` localStorage are separate — documented in the script header.

## 2. Guard demo-data fallbacks (so empty = empty)
Today these return `lib/demo-data` when `data.length === 0`. Change to: demo only when
`DEMO_MODE` (Supabase unconfigured); otherwise return real rows (even if empty); on
error return empty array.
- `app/api/reports/route.ts`, `app/api/logs/route.ts` (2 spots),
  `app/api/intents/route.ts` (2 spots), `app/api/companies/route.ts`.
- `app/api/campaigns/route.ts` already gates on `DEMO_MODE` — leave as-is.

## 3. Campaign selectables from Telephony + warning
`components/CampaignModal.tsx` reads `useTelephonyStore()`:
- **Agent** select → enabled `agents` (submit as `agent_name`, free-text col). Drop the
  hardcoded Seeker/Grace enum select.
- **Trunk** select → enabled `trunks`; submit the trunk's `trunk_id` as `sip_trunk_id`
  (resolveTrunkId already honours an `ST_…` value).
- **Warning popup:** on open, if `enabled trunks === 0 || enabled agents === 0`, show a
  blocking-ish warning dialog: “Telephony isn’t set up — add a trunk and an agent in
  Telephony first,” with a button that routes to the Telephony view. User can dismiss to
  continue, but selects will be empty.
- `app/api/campaigns/route.ts`: accept + insert `agent_name` and `sip_trunk_id`
  (currently dropped). `agent` enum stays optional/unused.

## 4. Script → Inworld TTS → saved recording
**Inworld API (confirmed from docs):**
- `POST https://api.inworld.ai/tts/v1/voice`
- Header `Authorization: Basic <INWORLD_API_KEY>` (the Base64 key from Inworld Integrations).
- Body: `{ text (≤2000 chars), voiceId, modelId, audioConfig: { audioEncoding: "MP3",
  sampleRateHertz: 44100 } }`.
- Response: `{ audioContent: <base64 mp3>, usage, ... }`.

**New server route `POST /api/voice/generate`** (Node runtime, never exposes the key):
- Auth: require logged-in user.
- Body `{ script: string, voiceId?: string }`; validate non-empty, ≤2000 chars.
- Read env; if `INWORLD_API_KEY` unset → 503 “Inworld not configured.”
- Call Inworld → decode base64 MP3 → upload to private `voice-recordings` bucket via
  service-role admin client as `${uuid}.mp3` → return `{ voice_path, signedUrl }`
  (signed for in-modal preview).

**CampaignModal Voice step (keep both inputs):**
- Existing file upload stays.
- Add a multiline **Script** field + **Generate voice** button → calls `/api/voice/generate`
  → stores returned `voice_path`, shows an `<audio>` preview + success.
- On submit: if a generated `voice_path` exists use it; else upload the chosen file as
  today. (If both, generated wins — surface a note.)

**Env (add to `.env`/examples):**
- `INWORLD_API_KEY=` (Basic base64 key) — **user provides**
- `INWORLD_TTS_VOICE_ID=default-hzau9tlenfqr0yc2k7co6g__charlotte` (default)
- `INWORLD_TTS_MODEL=inworld-tts-1-max` (**confirm** — must be compatible with that voice)

## DB amendments
- No schema change strictly needed: `campaigns.agent_name`, `sip_trunk_id`, `voice_path`
  already exist. We only start *writing* `agent_name`/`sip_trunk_id` from the modal.

## Verify
- `npm run build` green; wipe script parses (psql dry-run / review).
- Manual: wipe → app shows empty (no demo) once Supabase connected; campaign modal lists
  Telephony agents/trunks; warning fires when Telephony empty; Generate voice produces a
  playable preview and the campaign stores its `voice_path`.

## Open items needing you
- **`INWORLD_API_KEY`** dropped into `.env` (I can’t fetch it).
- **Confirm `INWORLD_TTS_MODEL`** for that custom voice id (default assumed `inworld-tts-1-max`).
