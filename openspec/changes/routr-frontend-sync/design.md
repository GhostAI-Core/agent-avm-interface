## Context

M1 (`routr-outbound-v1`) deployed Routr on the production host, bootstrap applies **Peer** (LiveKit) + **Credentials** + **Trunk** (Twilio) from `.env`, and `campaigns.routing_mode` branches dial-time LiveKit trunk selection. The frontend **Settings → VoIP Provider** screen still stores `{ name, api_key, api_secret }` with no Routr mapping. Routr’s API uses flattened SDK objects (`@routr/sdk`) with strict DB limits (e.g. `contactAddr` ≤ 20 chars, `transport` enum `UDP`).

**Deployed Routr shape (reference):**

| Resource | Stable ref (requested) | Typical fields |
|----------|------------------------|----------------|
| Peer | `peer-livekit` | `username`, `aor`, `contactAddr`, `extended.evraRole` |
| Credentials | `cred-carrier` | `name`, `username`, `password` |
| Trunk | `trunk-carrier-default` | `inboundUri`, `outboundCredentialsRef`, `uris[]`, `sendRegister` |

Routr may persist **UUID refs** after create; link rows via `extended.evraProviderId`.

## Goals / Non-Goals

**Goals:**

- Extend `voip_providers` to carrier SIP fields and Routr ref columns
- On provider save, upsert Routr Credentials + Trunk (reuse bootstrap logic patterns)
- Admin Settings UI for carrier trunks with validation and sync status
- Platform settings for LiveKit Peer (SIP host, optional ACL, optional password)
- Campaign UI toggle for `routing_mode` (`legacy` | `routr`)
- Read-only Routr status for admins (list peer + trunks from SDK)
- Idempotent upsert (handle UUID refs, `ALREADY_EXISTS`, transport casing)

**Non-Goals:**

- Per-campaign Routr trunk selection (all routr-mode campaigns use default carrier trunk for M2)
- Inbound Routr **Number** resources / DID management UI
- Replacing env-based bootstrap (bootstrap remains deploy fallback)
- LiveKit trunk CRUD in UI (`sip_trunks` / `ST_…` still env + manual LiveKit Cloud for Routr-facing trunk)
- Multi-Routr HA or regional routing

## Decisions

### 1. Supabase as source of truth; Routr as runtime config

**Decision:** Admin edits `voip_providers` → API syncs to Routr on save.  
**Rationale:** Matches EVRA data model; Routr has no UI.  
**Alternative:** Edit Routr only via rctl — rejected (no operator UX).

### 2. Reuse bootstrap apply logic in shared module

**Decision:** Extract `lib/routr/sync-carrier.ts` and `lib/routr/sync-livekit-peer.ts` from `infrastructure/routr/bootstrap-apply.cjs` (contactAddr DNS resolve, upsert helpers, `UDP` transport). Bootstrap script imports or duplicates thin wrapper.  
**Rationale:** Single source of truth for Routr field shapes and limits.

### 3. `voip_providers` schema extension

**Decision:** Add columns:

```sql
slug VARCHAR(32) NOT NULL DEFAULT '',          -- trunk inboundUri = {slug}.evra.local
provider_type VARCHAR(20) DEFAULT 'twilio',  -- twilio | telnyx | sangoma
sip_host VARCHAR(255),
sip_port INT DEFAULT 5060,
sip_username VARCHAR(60),
sip_password VARCHAR(255),                   -- encrypt at rest if Supabase vault available; else app-only
send_register BOOLEAN DEFAULT false,
routr_trunk_ref VARCHAR(64),
routr_credentials_ref VARCHAR(64),
sync_status VARCHAR(20) DEFAULT 'pending',     -- pending | synced | error
sync_error TEXT,
last_synced_at TIMESTAMPTZ
```

Deprecate `api_key` / `api_secret` in UI (keep columns nullable for migration).  
**Alternative:** New `carrier_trunks` table — rejected (unnecessary split for M2).

### 4. API surface

| Route | Method | Role | Purpose |
|-------|--------|------|---------|
| `/api/providers` | GET/POST/PATCH | admin | CRUD + trigger sync |
| `/api/routr/status` | GET | admin | Peer + trunks summary from SDK |
| `/api/routr/livekit-peer` | GET/PUT | admin | Platform LiveKit peer settings |

Web container uses `ROUTR_API_ENDPOINT` (`insecure://agent-avm-sip-routr:51908` on `shared` network). Add `@routr/sdk` to main `package.json`.

### 5. Frontend mapping (Settings)

Replace “API Key / Secret” with:

- Provider name, type (Twilio/Telnyx/Sangoma)
- Slug (auto from name, editable)
- SIP host, port, username, password
- Send register (checkbox)
- Sync status chip + last error

Separate **Platform → LiveKit SIP** card:

- SIP host (`host:port`, no `sip:` prefix)
- Optional allowed CIDRs
- Optional peer password

### 6. Campaign UI

Add **Routing** select on campaign form: `Direct carrier (legacy)` | `Via Routr`. Maps to `routing_mode`. Show helper text: routr mode uses server `LIVEKIT_SIP_ROUTR_TRUNK_ID`.

### 7. Routr `extended` metadata convention

```json
{
  "evraProviderId": 1,
  "evraProviderType": "twilio",
  "syncedAt": "2026-06-15T12:00:00Z"
}
```

Peer: `{ "evraRole": "livekit-sip-gateway" }`.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Web container cannot reach Routr API | Health check on `/api/routr/status`; compose `depends_on` routr; clear 503 errors |
| Password in Supabase plaintext | Admin-only RLS; document rotation; future vault column |
| UUID refs vs stable refs | Upsert by `extended.evraProviderId` + list-by-name fallback (bootstrap pattern) |
| `contactAddr` 20-char limit | Shared `resolveContactAddr()`; UI warns on long hostnames |
| Breaking `/api/providers` POST shape | Version POST body; migrate existing rows with `sync_status = pending` |

## Migration Plan

1. Ship Supabase migration (additive columns, backfill `slug` from `name`)
2. Deploy web with SDK sync; bootstrap unchanged as fallback
3. Admin re-saves Twilio provider in UI → Routr trunk updated
4. Set test campaign `routing_mode = routr` via UI
5. Rollback: set campaign to legacy; Routr resources remain harmless

## Open Questions

- Store platform LiveKit peer settings in `system_settings` JSON vs new `routr_platform_config` table? **Recommend:** `system_settings` key `routr_livekit_peer`.
- Encrypt `sip_password` with Supabase pgsodium? **Defer** unless already in project.
- Show Routr refs as read-only UUIDs in UI? **Yes** for support/debug.
