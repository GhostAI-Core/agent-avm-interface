## 1. Data

- [x] 1.1 Add `voice_scripts` table migration (`text`, `voice_id`, `audio_url`, `campaign_name`, `created_at`) + index + authenticated-all RLS — `supabase/migrations/20260624120000_voice_scripts.sql`
- [x] 1.2 Apply the table in Supabase (SQL editor) and confirm PostgREST sees it (schema cache reloaded)

## 2. API

- [x] 2.1 Add `GET /api/voice-scripts` returning recent rows newest-first for authenticated users — `app/api/voice-scripts/route.ts`
- [x] 2.2 Accept `text` in `POST /api/tts/save` and write a `voice_scripts` row (best-effort) after the audio upload — `app/api/tts/save/route.ts`

## 3. UI (voice generator)

- [x] 3.1 Fetch `/api/voice-scripts` on mount; degrade silently to no bubbles on error — `components/VoiceGenerator.tsx`
- [x] 3.2 Render reuse bubbles above the Script field: text snippet + ▶ play (only when `audio_url`)
- [x] 3.3 Clicking a bubble loads text and restores gender/ethnicity/voice from `voice_id` (both editable)
- [x] 3.4 Send `text` on save; refresh the bubble list after a successful save

## 4. Validation

- [x] 4.1 Lint/typecheck `VoiceGenerator.tsx`, `voice-scripts/route.ts`, `tts/save/route.ts` — `npx tsc --noEmit` clean; `npx eslint` on all three clean (exit 0)
- [ ] 4.2 Manual: save two scripts → bubbles appear → ▶ plays → click loads text + restores voice — REQUIRES HUMAN RUN (can't be verified headless: audio playback + interactive UI)
- [x] 4.3 `openspec validate voice-script-reuse --strict` — passed ("Change 'voice-script-reuse' is valid")
