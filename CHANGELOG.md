# Changelog

This file tracks **what shipped**, **how it works**, and **what operators need to configure** — aimed at onboarding and keeping the team aligned. Update it when meaningful features land in `production` (or when production-critical config changes).

**Format for new entries**

- Newest release at the top under `## [Unreleased]` or `## YYYY-MM-DD — short title`
- Sections: Summary → User-facing behavior → Technical details → Env / deploy → Files touched → Known issues / ops notes

---

## [Unreleased]

### Summary

Documentation now reflects the callops cutover: the dashboard proxies campaign lifecycle to **evra-callops** and no longer exposes the production `/api/campaigns/:id/dial` or `/api/simulate` routes.

### User-facing behavior

- Campaign Play/Pause/Stop goes through `POST /api/campaigns/:id/start|pause|stop`.
- Running/paused campaign cards can show live callops counters from `GET /api/campaigns/:id/status`.
- The campaign wizard loads SIP trunk choices from `GET /api/trunks`.
- `POST /api/calls/result` is deprecated and is a no-op; agents should post outcomes to callops `/calls/outcome`.

### Technical details

- `app/api/campaigns/[id]/[action]/route.ts` keeps `CALLOPS_WEBHOOK_SECRET` server-side and falls back to local status updates when callops env is missing.
- `app/api/trunks/route.ts` reads `sip_trunks` and optionally cross-checks callops `/livekit/trunks`.
- `scripts/callops-test.ts` is the main smoke harness for status, lifecycle, test calls, outcome simulation, snapshots, and watch mode.
- `npm run dial` remains a direct LiveKit diagnostic path, not the production dashboard path.

### Env / deploy

- Required for production lifecycle: `CALLOPS_URL`, `CALLOPS_WEBHOOK_SECRET`.
- Keep `LIVEKIT_*` and `SUPABASE_SERVICE_ROLE_KEY` for LiveKit webhook validation and diagnostics.
- Production `.env` also documents `INWORLD_API_KEY` and `AVM_SCRIPT_AUDIO_STORAGE_*` for campaign voice generation.

### Known issues / ops notes

- `app/api/livekit/webhook/route.ts` still expects `call_records.room` rows to exist; under the callops model, callops is responsible for creating or maintaining those rows.
- Settings/Telephony admin UI does not write carrier configuration; authoritative trunk/provider config lives in LiveKit/callops and `sip_trunks`.

---

## 2026-06-17 — Inworld TTS & campaign voice generation

### Summary

Operators can generate outbound IVR voice prompts **inside the New Campaign wizard** using **Inworld TTS**, preview them, and save them to Supabase Storage. Voice selection uses a **Gender → Ethnicity → Voice** cascade backed by a curated catalog of **17 voices**. Static voice demos live in `public/voice-samples/`. Saved campaign scripts go to the public **`avm-scripts`** bucket via **Supabase S3 (PutObject)** with campaign-labelled filenames.

**Production URL:** `https://avm.evra-ai.com`  
**Deploy path:** `/opt/docker/production/evra_avm` (see `infrastructure/deploy/runbook.md`)

---

### User-facing behavior

#### Where to find it

1. Open **Campaigns** → **New Campaign**
2. Complete **Step 1** (campaign name is required for saving generated audio)
3. Complete **Step 2** (schedule)
4. On **Step 3 — Voice & Contacts**, choose:
   - **Upload recording** — existing flow (optional MP3/WAV/MP4 → private `voice-recordings` bucket)
   - **Generate with AI** — new Inworld TTS flow

#### Generate with AI flow

| Step | Action |
|------|--------|
| 1 | Pick **Gender** → **Ethnicity** → **Voice** |
| 2 | Optional: **Play voice sample** (static demo MP3 for that voice) |
| 3 | Enter **Script** text |
| 4 | Click **Generate** — listens via in-browser audio player |
| 5 | Click **Save recording** — uploads to `avm-scripts` and attaches URL to the campaign |
| 6 | **Create Campaign** — CSV required; voice remains **optional** |

#### Voice catalog (17 voices)

Source of truth: `docs/voicelist.md` (must stay in sync with `lib/inworld-voices.ts`).

| Gender | Ethnicity | Count | Voices |
|--------|-----------|-------|--------|
| Female | African | 4 | Anele, Mamohau, Tumi, Kudi |
| Female | White | 5 | Catherine, Fiona, Jennifer (Soft), Jessica (Soft), Shannon |
| Male | African | 4 | Bongani, Abulele, Jacob, Kew |
| Male | White | 4 | Frank, Ashley, Alex, Rob |

Voice IDs follow the pattern:

```text
default-hzau9tlenfqr0yc2k7co6g__{gender}_{name}_{ethnicity}
default-hzau9tlenfqr0yc2k7co6g__{gender}_{name}_{ethnicity}_soft   # soft variants
```

#### Saved script filename convention

Generated scripts are stored as:

```text
script-{campaign-slug}-{DD-MM-YYYY}.mp3
```

Example: campaign **EasyBonds** saved on 17 June 2026 → `script-easybonds-17-06-2026.mp3`

- `{campaign-slug}` = lowercased campaign name, non-alphanumeric → `-`
- Re-saving the **same campaign on the same day** overwrites that object (S3 PutObject upsert semantics)

Public playback URL pattern:

```text
{AVM_SCRIPT_AUDIO_STORAGE_ENDPOINT}/script-{slug}-{DD-MM-YYYY}.mp3
```

On campaign create, the public URL is stored in `campaigns.voice_recording_url`. At dispatch time, callops or the direct diagnostic CLI can use that URL directly (no signing needed for public objects).

**Upload mode** is unchanged: file → private `voice-recordings` bucket → `campaigns.voice_path` → signed URL when a server-side dispatch path needs to hand audio to an agent.

---

### Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│ CampaignModal (Step 3)                                          │
│   Upload mode          │  Generate mode (VoiceGenerator)        │
│   voice-recordings     │  POST /api/tts/generate → preview      │
│   voice_path           │  POST /api/tts/save → avm-scripts    │
│                        │  voice_recording_url on campaign       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    callops lifecycle / direct diagnostic CLI
                              │
                              ▼
                    resolveVoiceUrl(campaign) → LiveKit agent
```

#### API routes

| Route | Auth | Purpose |
|-------|------|---------|
| `POST /api/tts/generate` | Supabase session | Proxy to Inworld TTS; returns `{ audioBase64, contentType }` |
| `POST /api/tts/save` | Supabase session | S3 PutObject to `avm-scripts`; returns `{ storageKey, publicUrl }` |

**Inworld is never called from the browser** — credentials stay server-side.

#### Inworld request defaults (server-applied)

| Field | Value |
|-------|-------|
| `modelId` | `inworld-tts-1.5-max` |
| `timestampType` | `WORD` |
| `deliveryMode` | `STABLE` |
| `applyTextNormalization` | `ON` |
| `audioConfig.speakingRate` | `1.2` |
| `temperature` | `1.4` |

Client only sends `text` and `voiceId`. Max script length: **2000 characters**.

#### Storage

| Bucket | Access | Used for |
|--------|--------|----------|
| `voice-recordings` | Private (RLS + signed URL for server-side dispatch) | Uploaded audio files |
| `avm-scripts` | Public | TTS-generated campaign scripts (S3 upload) |

S3 uploads use `@aws-sdk/client-s3` + `PutObjectCommand` against Supabase’s S3-compatible endpoint:

```text
https://{project-ref}.storage.supabase.co/storage/v1/s3
```

(Auto-derived from `NEXT_PUBLIC_SUPABASE_URL` unless `AVM_SCRIPT_AUDIO_STORAGE_S3_ENDPOINT` is set.)

---

### Environment variables

#### Local development

Copy `.env.local.example` → `.env.local` (or use `.env`).

#### Production server

**Critical:** `.env` on your laptop is **not** deployed. Production reads `.env` at:

```text
/opt/docker/production/evra_avm/.env
```

The GitHub deploy workflow **rsyncs code** but **does not overwrite** server `.env`. After adding new features, **SSH to the server and add missing keys**, then:

```bash
cd /opt/docker/production/evra_avm
docker compose up -d --build
```

#### Required for TTS Generate

| Variable | Description |
|----------|-------------|
| `INWORLD_API_KEY` | Inworld Basic auth credential (**base64 only**, no `Basic ` prefix). Server-only. |

#### Required for TTS Save

| Variable | Description |
|----------|-------------|
| `AVM_SCRIPT_AUDIO_STORAGE_BUCKET` | e.g. `avm-scripts` |
| `AVM_SCRIPT_AUDIO_STORAGE_REGION` | e.g. `eu-north-1` |
| `AVM_SCRIPT_AUDIO_STORAGE_ACCESS_KEY` | Supabase S3 access key (Dashboard → Storage → S3) |
| `AVM_SCRIPT_AUDIO_STORAGE_SECRET` | Supabase S3 secret key |
| `AVM_SCRIPT_AUDIO_STORAGE_ENDPOINT` | **Public** URL base, e.g. `https://{ref}.supabase.co/storage/v1/object/public/avm-scripts` |
| `AVM_SCRIPT_AUDIO_STORAGE_PREFIX` | Default `script-` |
| `AVM_SCRIPT_AUDIO_STORAGE_S3_ENDPOINT` | Optional; S3 API URL if not using auto-derived endpoint |

`NEXT_PUBLIC_SUPABASE_URL` must be set for S3 endpoint derivation.

#### Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `POST /api/tts/generate` → **503** `{ "error": "TTS is not configured" }` | `INWORLD_API_KEY` missing on **production** server | Add to server `.env`, rebuild container |
| `POST /api/tts/save` → **503** | `AVM_SCRIPT_AUDIO_STORAGE_*` incomplete on server | Add S3 vars to server `.env`, rebuild |
| `POST /api/tts/generate` → **401** | Not logged in | Sign in via Supabase Auth |
| `POST /api/tts/generate` → **502** | Inworld API error or bad credential | Check server logs; verify `INWORLD_API_KEY` |
| Save disabled / error about campaign name | Step 1 name empty | Name the campaign before saving |
| Play voice sample silent | Missing MP3 in `public/voice-samples/` | Regenerate samples (see below) |

---

### Key files (for code navigation)

| Path | Role |
|------|------|
| `components/CampaignModal.tsx` | Wizard; Upload / Generate toggle; campaign create |
| `components/VoiceGenerator.tsx` | Voice cascade, generate, preview, save UI |
| `lib/inworld-voices.ts` | Voice catalog + cascade helpers (`genders`, `ethnicities`, `voices`) |
| `lib/avm-script-storage.ts` | S3 upload, slugify, filename + public URL builders |
| `lib/voice.ts` | Resolves playable URL for server-side dispatch (`voice_path` or `voice_recording_url`) |
| `app/api/tts/generate/route.ts` | Inworld TTS proxy |
| `app/api/tts/save/route.ts` | Campaign-labelled S3 save |
| `docs/voicelist.md` | Human-editable voice ID list |
| `public/voice-samples/*.mp3` | Static per-voice demo audio (17 files) |
| `scripts/generate-voice-samples.ts` | Regenerate demo MP3s via Inworld API |

#### Regenerating voice samples

```bash
# All voices
npx tsx scripts/generate-voice-samples.ts

# Specific voices only
npx tsx scripts/generate-voice-samples.ts male_rob_white female_kudi_african
```

Requires `INWORLD_API_KEY` in local `.env`.

#### Adding a new voice

1. Add full voice ID line to `docs/voicelist.md`
2. Add same ID to `VOICE_IDS` in `lib/inworld-voices.ts`
3. Generate sample: `npx tsx scripts/generate-voice-samples.ts {suffix}`  
   e.g. suffix = part after `__` → `male_rob_white`
4. Deploy (samples in `public/` are bundled with the app build)

---

### Out of scope (v1)

- TTS in **CampaignActionDialog** (edit/reuse campaigns) — upload/URL only there
- Persisting script **text** on the campaign row (only audio is stored)
- Exposing Inworld tuning params (speaking rate, temperature) in the UI
- `CampaignActionDialog` parity for Generate with AI

---

### Dependencies added

- `@aws-sdk/client-s3` — Supabase S3 PutObject for `avm-scripts` uploads

---

### Deployment checklist (when shipping TTS changes)

- [ ] Server `.env` includes `INWORLD_API_KEY`
- [ ] Server `.env` includes all `AVM_SCRIPT_AUDIO_STORAGE_*` vars
- [ ] `avm-scripts` bucket exists and is **public** in Supabase
- [ ] S3 access keys have upload permission to `avm-scripts`
- [ ] Merge to `production` branch (triggers deploy workflow)
- [ ] Verify: `curl -sf https://avm.evra-ai.com/api/health`
- [ ] Verify: logged-in UI → New Campaign → Generate (not 503)

---

