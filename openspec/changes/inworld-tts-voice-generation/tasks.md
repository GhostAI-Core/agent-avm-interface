## 1. Configuration & voice catalog

- [x] 1.1 Add `INWORLD_API_KEY` to `.env.local.example` and document in README (server-only, Basic auth value)
- [x] 1.2 Create `lib/inworld-voices.ts` — parse `docs/voicelist.md` IDs into catalog entries (gender, ethnicity, name, variant, label, voiceId, samplePath)
- [x] 1.3 Handle `_soft` variant parsing and dedupe duplicate voice IDs in the catalog
- [x] 1.4 Export cascade helpers: `genders()`, `ethnicities(gender)`, `voices(gender, ethnicity)`, `isValidVoiceId(id)`

## 2. TTS API route

- [x] 2.1 Create `app/api/tts/generate/route.ts` with `getAuthUser()` auth gate
- [x] 2.2 Validate request body (`text`, `voiceId`), enforce max script length (2000 chars)
- [x] 2.3 Proxy to Inworld `POST https://api.inworld.ai/tts/v1/voice` with fixed synthesis defaults and `INWORLD_API_KEY`
- [x] 2.4 Return `{ audioBase64, contentType }` on success; safe error responses for 400/401/503 and Inworld failures

## 3. VoiceGenerator component

- [x] 3.1 Create `components/VoiceGenerator.tsx` with Gender / Ethnicity / Voice cascading `Select` controls
- [x] 3.2 Add static sample preview player (`/voice-samples/{suffix}.mp3`) for selected voice
- [x] 3.3 Add multiline script `TextField`, Generate button, and loading/error state
- [x] 3.4 On generate success: decode base64 → blob URL → show `<audio>` player (hidden until ready)
- [x] 3.5 Add Save recording: upload blob to `voice-recordings` bucket, call `onVoicePathChange(path)`, show saved confirmation
- [x] 3.6 Clear generated preview and `voicePath` when cascade selection changes; revoke blob URLs on unmount

## 4. CampaignModal integration

- [x] 4.1 Add Upload | Generate `ToggleButtonGroup` on Step 3 (default Upload)
- [x] 4.2 Wire `VoiceGenerator` in Generate mode with `voicePath` state
- [x] 4.3 On mode switch: clear upload file state or generated/saved voice state respectively
- [x] 4.4 Update `handleSubmit`: if `voicePath` is set, skip `voice_file` upload and send `voice_path` in campaign POST
- [x] 4.5 Adjust Step 3 layout (spacing/scroll) to accommodate new controls

## 5. Static assets & verification

- [x] 5.1 Create `public/voice-samples/` directory with `.gitkeep` or placeholder README noting `{suffix}.mp3` naming convention
- [x] 5.2 Manual test: select voice → play sample → generate script → listen → save → create campaign → verify `voice_path` on campaign row
- [x] 5.3 Manual test: create campaign without voice (optional path still works)
- [x] 5.4 Manual test: Generate returns 503 when `INWORLD_API_KEY` unset
