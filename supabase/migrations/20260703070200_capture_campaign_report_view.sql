-- Capture-migration (db-schema-cleanup, 2026-07-03): `campaign_report` is a live reporting
-- VIEW (NOT a table) — one row per campaign that has call_records, all count columns BIGINT,
-- FK campaign_id -> campaigns.id. Created directly in the Supabase SQL editor (0 graph nodes),
-- so it had no repo DDL. Captured here so supabase/migrations/* is authoritative.
--
-- Body below is the EXACT live definition, extracted 2026-07-03 via
--   SELECT pg_get_viewdef('campaign_report'::regclass, true);
-- CREATE OR REPLACE VIEW with this identical body is a no-op against live (idempotent).
--
-- KEEP decision: the dashboard's own reports/leads aggregates read raw call_records directly
-- (reads-from-raw model, ratified 2026-07-02), so nothing in this repo depends on this view.
-- It's cheap and harmless, so KEEP + capture rather than supersede/drop. It MAY be dropped
-- later if confirmed unused by any external consumer (Cale/CallOps/ad-hoc SQL).
--
-- KNOWN QUIRK — cpl is wrong for lead-gen campaigns. The view divides total_spent by the
-- `qualified` count, but lead-gen conversions are outcome='lead' (never 'qualified'), so
-- campaign_report.cpl is always 0 for lead-gen. Do NOT read cpl from this view for lead-gen;
-- the dashboard already computes CPL from raw call_records counting subscribed OR lead.
CREATE OR REPLACE VIEW campaign_report AS
 SELECT cr.campaign_id,
    c.name AS campaign_name,
    c.agent,
    count(*) AS dialed,
    count(*) FILTER (WHERE cr.outcome::text = 'connected'::text) AS connected,
    count(*) FILTER (WHERE cr.outcome::text = 'qualified'::text) AS qualified,
    count(*) FILTER (WHERE cr.outcome::text = 'voicemail'::text) AS voicemail,
    count(*) FILTER (WHERE cr.outcome::text = 'no_speech'::text) AS no_speech,
    count(*) FILTER (WHERE cr.outcome::text = 'hangup'::text) AS hangup,
    count(*) FILTER (WHERE cr.outcome::text = 'ni'::text) AS ni,
    count(*) FILTER (WHERE cr.outcome::text = 'dnq'::text) AS dnq,
    count(*) FILTER (WHERE cr.outcome::text = 'callback'::text) AS callback,
    count(*) FILTER (WHERE cr.outcome::text = 'no_answer'::text) AS no_answer,
    count(*) FILTER (WHERE cr.outcome::text = 'busy'::text) AS busy_line,
    count(*) FILTER (WHERE cr.outcome::text = 'failed'::text) AS failed,
    count(*) FILTER (WHERE cr.transferred) AS transfers,
    round(avg(cr.talk_seconds)) AS avg_talk_seconds,
    sum(cr.cost) AS total_spent,
        CASE
            WHEN count(*) FILTER (WHERE cr.outcome::text = 'qualified'::text) > 0 THEN round(sum(cr.cost) / count(*) FILTER (WHERE cr.outcome::text = 'qualified'::text)::numeric, 2)
            ELSE 0::numeric
        END AS cpl
   FROM call_records cr
     JOIN campaigns c ON c.id = cr.campaign_id
  GROUP BY cr.campaign_id, c.name, c.agent;
