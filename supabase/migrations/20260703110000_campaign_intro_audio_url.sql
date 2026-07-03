-- Lead-gen intro flow (lead-gen-intro-flow): per-campaign short "branded intro" clip that
-- plays BEFORE the main pitch in routing_mode='lead'. Intro toggle ON (this URL set) =
-- Phase 1 intro (press 1 to accept -> records single_opt_in) then Phase 2 main script
-- (press 1 again = lead). Intro empty = current single-script double-opt-in, unchanged.
--
-- Dashboard-owned Supabase column (the dashboard writes it on campaign create/edit; CallOps
-- dispatch reads it into CallJobMetadata.intro_audio_url). Nullable, additive, no backfill.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS intro_audio_url TEXT;
