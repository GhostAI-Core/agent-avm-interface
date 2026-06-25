## Why

Campaign operators currently must record or upload a voice file to attach an outbound IVR prompt to a campaign. Generating that audio in-app with Inworld TTS would remove the external recording step, let operators iterate on script copy before dialing, and align voice selection with the curated Inworld voice catalog used elsewhere in the stack.

## What Changes

- Add a **Generate with AI** mode on the New Campaign wizard (Step 3 — Voice & Contacts), alongside the existing file upload option
- Add cascading voice picker: **Gender → Ethnicity → Voice name**, derived from `docs/voicelist.md` voice IDs
- Add static voice sample preview playback (sample files supplied separately under `public/voice-samples/`)
- Add script text input, **Generate** button, hidden generated-audio player, and **Save recording** action
- Add server-side `POST /api/tts/generate` proxy to Inworld TTS (credentials never exposed to the browser)
- On save, upload generated MP3 to the existing private `voice-recordings` Supabase bucket and attach `voice_path` to the campaign (same dial-time signing flow as today)
- Voice recording remains **optional** — campaigns can still be created without a voice prompt
- Scope limited to `CampaignModal` (new campaign wizard); `CampaignActionDialog` is out of scope for v1

## Capabilities

### New Capabilities

- `inworld-tts-api`: Server-side Inworld TTS generation endpoint with env-based credentials and fixed synthesis defaults
- `campaign-voice-generation`: New Campaign wizard UI for voice catalog selection, sample preview, script-based TTS generation, listen-back, and save-to-storage

### Modified Capabilities

<!-- No existing openspec specs to modify -->

## Impact

- **Frontend**: `components/CampaignModal.tsx`; new `VoiceGenerator` (or equivalent) component; voice catalog module derived from `docs/voicelist.md`
- **API**: New `app/api/tts/generate/route.ts`
- **Lib**: `lib/inworld-voices.ts` (voice catalog + cascade helpers)
- **Static assets**: `public/voice-samples/{suffix}.mp3` (operator-supplied preview files keyed by voice ID suffix, e.g. `male_abulele_african.mp3`)
- **Config**: `INWORLD_API_KEY` (server-only); document in `.env.local.example` and README
- **Unchanged**: Dial route (`resolveVoiceUrl`), storage bucket/RLS, `campaigns.voice_path` schema — generated audio reuses existing pipeline
- **Dependencies**: Inworld TTS API (`https://api.inworld.ai/tts/v1/voice`)
