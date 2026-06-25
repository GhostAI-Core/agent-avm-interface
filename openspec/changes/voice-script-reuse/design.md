## Context

The voice generator already does gender/ethnicity/voice selection, Inworld TTS generation, listen-back, and save-to-storage (`inworld-tts-voice-generation`, complete). Saving uploads the MP3 to the S3 `avm_scripts` bucket via `lib/avm-script-storage.ts` and attaches a URL to the campaign; the typed script text is discarded. Operators asked for previously-used scripts to come back as clickable bubbles they can audition and load. This is additive — it extends the generator without changing the existing generate/save flow.

## Goals / Non-Goals

**Goals:**
- Keep the script text so a past script can be reloaded and edited.
- Let operators audition a saved script (play its audio) before committing.
- Restore the exact voice a script was generated with on reuse.
- Never let the new persistence weaken the existing audio-save path.

**Non-Goals:**
- Backfilling text for scripts saved before this change (they simply have no bubble).
- Editing/deleting saved scripts, tagging, or per-campaign scoping (global list, newest-first, is enough for v1).
- Changing the storage bucket or the campaign's audio attachment.

## Decisions

- **New `voice_scripts` table rather than S3 metadata or sidecar files.** A table is queryable, has no metadata size limit, and lists cleanly newest-first. This is dashboard authoring content, so it lives in Supabase with the standard authenticated-all RLS, not in callops.
- **Best-effort row write inside `tts/save`.** The audio upload is the primary action and must not regress; the `voice_scripts` insert is attempted after a successful upload and only logged on failure.
- **Restore voice from `voice_id`.** `findVoice(voice_id)` yields `{ gender, ethnicity, voiceId }`, so loading a bubble can set all three selectors deterministically; no extra columns needed.
- **Global, newest-first list capped at a recent window.** Simple and matches the "reuse a good pitch anywhere" intent; per-campaign scoping can come later if the list grows noisy.

## Risks / Trade-offs

- **Schema must exist before the feature works.** The table is applied via the Supabase SQL editor (like other migrations here); until then the GET 500s and the component degrades to no bubbles (handled — the fetch failure is swallowed). PostgREST schema-cache lag after table creation is a known gotcha (reload schema cache / wait).
- **Unbounded growth.** `voice_scripts` grows with every save; the list is capped on read but the table isn't pruned. Acceptable for now; revisit if volume warrants retention rules.
- **Snippet labels can collide.** Bubbles show a text snippet; very similar scripts look alike. Full text is available on hover/title; acceptable for v1.
