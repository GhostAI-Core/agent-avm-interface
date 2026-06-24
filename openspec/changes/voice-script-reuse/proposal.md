## Why

The voice generator (`inworld-tts-voice-generation`) lets an operator write a script, generate audio, and save it — then throws the script *text* away, keeping only the MP3. Operators re-type good pitches from scratch every campaign. Persisting the text lets previously-used scripts come back as clickable, playable bubbles: listen to decide, then load the text (and the voice it used) into the editor to tweak.

## What Changes

- Persist the source text whenever a generated script is saved (today only the audio is stored).
- Add a `voice_scripts` table (`text`, `voice_id`, `audio_url`, `campaign_name`, `created_at`) — dashboard authoring content, not callops control state.
- Add `GET /api/voice-scripts` returning recent saved scripts (global across campaigns, newest first).
- Have `POST /api/tts/save` write a `voice_scripts` row alongside the audio upload — best-effort, so a library write never fails the audio save.
- Add a **reuse bubbles** row above the Script field in the voice generator: each bubble shows a text snippet; ▶ plays the saved audio; clicking the bubble loads the text **and** restores the gender/ethnicity/voice it was generated with (all still editable).
- Refresh the bubbles after a successful save so a just-saved script appears immediately.

## Capabilities

### New Capabilities

- `voice-script-library`: persistence and retrieval of previously-used voice scripts (text + voice + audio) and the reuse-bubble UI in the voice generator.

### Modified Capabilities

<!-- No existing openspec spec requires modification: inworld-tts-voice-generation ends at generate-and-save and is unchanged; this is additive. -->

## Impact

- **Frontend**: `components/VoiceGenerator.tsx` (reuse bubbles, load text + voice, play preview, refresh on save).
- **API**: new `app/api/voice-scripts/route.ts` (GET); `app/api/tts/save/route.ts` (also persist `text` + `voice_id` + `audio_url`).
- **Data**: new `voice_scripts` table + RLS (`supabase/migrations/20260624120000_voice_scripts.sql`); authenticated-all policy, matching existing operational tables. Kept out of `production` (OpenSpec/working-layer concern only where applicable; the table itself is real schema applied via the Supabase SQL editor).
- **Backward compatibility**: scripts saved before this change have no row, so they simply have no bubble; nothing breaks. Audio save path is unchanged on failure of the library write.
- **Note (pre-existing drift, not in scope)**: the `inworld-tts-voice-generation` spec describes saving to the `voice-recordings` bucket as `voice_path`; production actually uses the S3 `avm_scripts` bucket as `audio_path`. This change follows production (the S3 path) and stores the resulting public URL as `audio_url`.
