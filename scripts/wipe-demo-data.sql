-- Wipe demo / transactional data for a clean start.
--
-- Clears:  campaigns, contacts, call_logs, call_records, intent_stats,
--          security_logs, companies  (+ anything FK-referencing them, via CASCADE)
-- Keeps:   profiles (logins), system_settings, sip_trunks, voip_providers,
--          dashboard_templates (user dashboard layouts)
--
-- NOT covered here (clear separately if you want a total reset):
--   * the private "voice-recordings" Supabase Storage bucket (campaign audio)
--   * the browser's localStorage key "voxi.telephony.mock.v1" (mock Telephony config)
--
-- Run in the Supabase SQL editor, or:  psql "$DATABASE_URL" -f scripts/wipe-demo-data.sql
-- Idempotent and safe to re-run; missing tables are skipped, not errors.

BEGIN;

DO $$
DECLARE
  t       text;
  targets text[] := ARRAY[
    'campaigns',
    'contacts',
    'call_logs',
    'call_records',
    'intent_stats',
    'security_logs',
    'companies'
  ];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
      RAISE NOTICE 'truncated %', t;
    ELSE
      RAISE NOTICE 'skipped (table not found): %', t;
    END IF;
  END LOOP;
END $$;

COMMIT;
