-- Contacts ↔ campaigns become many-to-many (confirmed 2026-06-18).
-- A contact can belong to many campaigns; a campaign can hold a contact at most once.
-- Per-campaign dialing state (status/retry) moves to the join — a contact has a different
-- status in each campaign.
--
-- STAGED on purpose:
--   • THIS migration is ADDITIVE + non-destructive: it creates the join and backfills it from
--     the existing contacts.campaign_id links. contacts.campaign_id is kept (deprecated) so the
--     current dial path keeps working until the code is switched over.
--   • Canonicalization (merge duplicate-phone rows into one contact, add UNIQUE(phone), drop
--     contacts.campaign_id) is a SEPARATE reviewed migration — it deletes rows and depends on
--     real phone formats, so it must be run against the real DB with eyes on it.

CREATE TABLE IF NOT EXISTS campaign_contacts (
  id                BIGSERIAL PRIMARY KEY,
  campaign_id       INT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id        INT NOT NULL REFERENCES contacts(id)  ON DELETE CASCADE,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','dialed','failed','retry')),
  retry_count       INT NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, contact_id)          -- a contact appears at most once per campaign
);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign ON campaign_contacts (campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_contact  ON campaign_contacts (contact_id);

ALTER TABLE campaign_contacts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "auth_all_campaign_contacts" ON campaign_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: every existing contact→campaign assignment becomes a join row (carrying its
-- current per-campaign status). Safe to re-run (ON CONFLICT no-ops).
INSERT INTO campaign_contacts (campaign_id, contact_id, status, retry_count, last_attempted_at, created_at)
SELECT c.campaign_id, c.id,
       CASE WHEN c.status IN ('pending','in_progress','dialed','failed','retry') THEN c.status ELSE 'pending' END,
       COALESCE(c.retry_count, 0), c.last_attempted_at, COALESCE(c.created_at, NOW())
FROM contacts c
WHERE c.campaign_id IS NOT NULL
ON CONFLICT (campaign_id, contact_id) DO NOTHING;
