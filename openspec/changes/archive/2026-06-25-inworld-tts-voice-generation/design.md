## Context

The New Campaign wizard (`CampaignModal`, Step 3) already supports optional voice recording upload to the private Supabase `voice-recordings` bucket. On campaign create, the object key is stored in `campaigns.voice_path`. At dial time, `resolveVoiceUrl()` mints a short-lived signed URL passed to the LiveKit agent as `voiceRecordingUrl`.

There is no Inworld integration today. Voice IDs are listed in `docs/voicelist.md` using the suffix pattern `{gender}_{name}_{ethnicity}` (with optional `_soft` variant). Operators want to select a voice via cascading dropdowns, preview static samples, generate script audio via Inworld TTS, listen back, and save to the same storage pipeline.

## Goals / Non-Goals

**Goals:**

- Add Upload vs Generate toggle on CampaignModal Step 3
- Parse `docs/voicelist.md` into a typed voice catalog with cascade filters (Gender → Ethnicity → Voice)
- Play static voice sample previews from `public/voice-samples/{suffix}.mp3`
- Proxy Inworld TTS from a server API route using `INWORLD_API_KEY`
- Preview generated audio in-browser before committing
- On Save: upload MP3 to `voice-recordings`, set `voicePath` state, include `voice_path` in campaign POST
- Keep voice recording optional for campaign creation

**Non-Goals:**

- TTS in `CampaignActionDialog` (edit/reuse flows)
- Persisting script text on the campaign row
- Exposing TTS model parameters (speaking rate, temperature) in the UI for v1
- Admin rate-limiting UI (server-side max script length only)
- Changing dial route, agent worker, or storage RLS policies

## Decisions

### 1. Server-side TTS proxy (not browser-direct)

**Choice:** `POST /api/tts/generate` on the Next.js server, authenticated via `getAuthUser()`.

**Rationale:** Inworld credentials must not reach the browser. Matches existing API route trust boundary.

**Alternatives considered:**
- Client-side call with public key — rejected (credential exposure)
- Edge function — unnecessary; existing API routes suffice

### 2. Two-phase generate then save (not auto-upload on generate)

**Choice:** Generate returns base64 audio for local preview; Save explicitly uploads to Supabase and sets `voicePath`.

**Rationale:** Operators iterate on script copy without creating orphan storage objects. Matches user requirement that Save does both upload and campaign attachment.

**Alternatives considered:**
- Upload immediately on generate — rejected (orphan files, harder iteration)

### 3. Client-side upload on save (same as file upload today)

**Choice:** After generate, decode base64 to `Blob`, upload via `createClient().storage.from('voice-recordings').upload()` from the browser.

**Rationale:** Reuses proven `CampaignModal` upload path and existing RLS (`voice_auth_insert` for authenticated users). No new server upload endpoint.

**Alternatives considered:**
- Server-side upload with service role — more code, no clear benefit

### 4. Voice catalog from `docs/voicelist.md` suffix parsing

**Choice:** Build `lib/inworld-voices.ts` at build/runtime from the voice ID list. Parse suffix after `__`:

- Normal: `{gender}_{name}_{ethnicity}` → e.g. `male_abulele_african`
- Variant: `{gender}_{name}_{ethnicity}_soft` → ethnicity = second-to-last segment, variant = `soft`, display label = `Name (Soft)`

Dedupe duplicate entries (e.g. duplicate `female_jessica_white_soft`).

**Rationale:** Single source of truth in `docs/voicelist.md`; UI labels derived from slug (capitalized).

**Alternatives considered:**
- Hardcoded JSON only — duplicates doc maintenance

### 5. Static sample path convention

**Choice:** `/voice-samples/{suffix}.mp3` where `suffix` is the part after `__` in the voice ID (e.g. `male_abulele_african.mp3`).

**Rationale:** Operator adds files matching voice list; no API needed for samples.

### 6. Upload vs Generate mutual exclusivity

**Choice:** `ToggleButtonGroup` switches mode; switching clears the other source (`voiceFile` / generated audio / `voicePath`).

**Rationale:** Campaign has one voice source; avoids ambiguous precedence at submit.

### 7. Fixed Inworld synthesis defaults (server)

**Choice:** Server applies constants matching the known working curl:

| Field | Value |
|-------|-------|
| `modelId` | `inworld-tts-1.5-max` |
| `timestampType` | `WORD` |
| `audioConfig.speakingRate` | `1.2` |
| `temperature` | `1.4` |

**Rationale:** v1 simplicity; parameters can be env-tuned later without UI.

### 8. Component structure

**Choice:** Extract `VoiceGenerator` component used inside `CampaignModal` Step 3. Props: `voicePath`, `onVoicePathChange`, `disabled`.

**Rationale:** Keeps `CampaignModal` readable; isolates TTS state machine.

## Architecture

```
CampaignModal Step 3
├── Toggle: Upload | Generate
├── [Upload mode]  FileField (existing)
└── [Generate mode] VoiceGenerator
        ├── Gender / Ethnicity / Voice selects
        ├── Sample <audio> (static /voice-samples/{suffix}.mp3)
        ├── Script TextField (multiline)
        ├── [Generate] → POST /api/tts/generate
        ├── Generated <audio> (blob URL, hidden until success)
        └── [Save recording] → supabase.storage.upload → onVoicePathChange(path)

Campaign submit
└── if voicePath set → payload.voice_path (skip voice_file upload)
```

```
POST /api/tts/generate
├── getAuthUser() → 401 if missing
├── validate { text, voiceId }
├── POST https://api.inworld.ai/tts/v1/voice
│     Authorization: Basic ${INWORLD_API_KEY}
└── return { audioBase64, contentType: 'audio/mpeg' }
```

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Inworld API cost from rapid regenerate | Disable Generate while in-flight; optional max script length (e.g. 2000 chars) |
| Missing sample MP3 for a voice | Hide or disable sample play; graceful 404 on audio element |
| `_soft` suffix parsing edge cases | Explicit variant branch in parser; unit-test catalog entries |
| Generated audio format vs agent playback | Save as `.mp3`; same bucket as uploads; verify agent accepts MP3 in QA |
| Credential in env misconfigured | Return 503 with generic message; log server-side only |
| User switches voice after generate | Clear generated preview and `voicePath` when cascade selection changes |

## Migration Plan

1. Add `INWORLD_API_KEY` to server env (rotate any previously exposed keys)
2. Deploy API route + UI (feature inactive if env missing — show error on Generate)
3. Operator adds `public/voice-samples/*.mp3` files (can ship incrementally)
4. No database migration required

**Rollback:** Remove UI toggle and API route; existing upload flow unchanged.

## Open Questions

- Confirm max script character limit with operators (proposed: 2000)
- Confirm all sample MP3s will use `{suffix}.mp3` naming — operator to supply files
- QA: verify LiveKit agent plays MP3 from signed URL (existing uploads already allow MP3)
