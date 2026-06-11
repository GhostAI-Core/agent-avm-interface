-- Shared dashboard layout templates + company contact details.
-- Idempotent; authenticated-only RLS (matches the app's real-login model).

CREATE TABLE IF NOT EXISTS dashboard_templates (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(80)  NOT NULL,
    layout     JSONB        NOT NULL,
    created_by UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE dashboard_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_dashboard_templates" ON dashboard_templates;
CREATE POLICY "auth_all_dashboard_templates" ON dashboard_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Company contact details (captured by the New Company form)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_name  VARCHAR(120);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_email VARCHAR(160);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(40);
