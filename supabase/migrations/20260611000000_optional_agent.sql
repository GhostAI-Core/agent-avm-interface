-- Make campaign agent optional for the fast-dial flow.
-- A campaign can now be created from just an MP4 + dial list, with no agent persona.
-- Idempotent.

-- Allow NULL agent
ALTER TABLE campaigns ALTER COLUMN agent DROP NOT NULL;

-- Replace the old CHECK (agent IN ('seeker','grace','sangoma')) so NULL is allowed
-- and 'sangoma' is retired from new writes.
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_agent_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_agent_check
  CHECK (agent IS NULL OR agent IN ('seeker', 'grace', 'sangoma'));
