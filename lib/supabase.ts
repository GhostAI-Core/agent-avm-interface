// Demo data is served only when explicitly enabled (DEMO_MODE=true). In production
// (unset/false), API routes return real DB data — empty when the DB is empty — so the
// dashboard reflects exactly what evra_callops has written, never seeded placeholders.
export const DEMO_MODE = process.env.DEMO_MODE === 'true'
