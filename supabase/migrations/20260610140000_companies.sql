-- Companies dimension: a company owns many campaigns.
-- Idempotent; authenticated-only RLS (matches the app's real-login model).

CREATE TABLE IF NOT EXISTS companies (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS company_id INT REFERENCES companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_company ON campaigns (company_id);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_companies" ON companies;
CREATE POLICY "auth_all_companies" ON companies FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed the client companies
INSERT INTO companies (name)
SELECT v.name FROM (VALUES ('1Life'), ('Miway'), ('Old Mutual'), ('Metropolitan')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.name = v.name);

-- Map existing campaigns to their company by name pattern (only where unset)
UPDATE campaigns SET company_id = (SELECT id FROM companies WHERE name = '1Life')
  WHERE company_id IS NULL AND name ILIKE '1Life%';
UPDATE campaigns SET company_id = (SELECT id FROM companies WHERE name = 'Miway')
  WHERE company_id IS NULL AND name ILIKE '%Miway%';
UPDATE campaigns SET company_id = (SELECT id FROM companies WHERE name = 'Old Mutual')
  WHERE company_id IS NULL AND (name ILIKE '%Old Mutual%' OR name ILIKE 'Ivyze%');
UPDATE campaigns SET company_id = (SELECT id FROM companies WHERE name = 'Metropolitan')
  WHERE company_id IS NULL AND name ILIKE 'Metropolitan%';
