# Database Schema

> Auto-generated from Supabase project `ytozpjohaphinlsqrxlc` on 2026-06-24.
> [Dashboard](https://supabase.com/dashboard/project/ytozpjohaphinlsqrxlc)

## Summary

| Schema | Tables |
|--------|--------|
| `public` | 20 |
| `cron` | 2 |
| `functions` | 2 |
| `storage` | 8 |
| **Total** | **32** |

## Table of Contents

### `public`

- [`public.call_events`](#public-call_events)
- [`public.call_logs`](#public-call_logs)
- [`public.call_records`](#public-call_records)
- [`public.call_session_events`](#public-call_session_events)
- [`public.call_sessions`](#public-call_sessions)
- [`public.campaign_contacts`](#public-campaign_contacts)
- [`public.campaigns`](#public-campaigns)
- [`public.companies`](#public-companies)
- [`public.compliance_events`](#public-compliance_events)
- [`public.contacts`](#public-contacts)
- [`public.dashboard_templates`](#public-dashboard_templates)
- [`public.dial_number_state`](#public-dial_number_state)
- [`public.intent_stats`](#public-intent_stats)
- [`public.product_consent`](#public-product_consent)
- [`public.profiles`](#public-profiles)
- [`public.security_logs`](#public-security_logs)
- [`public.sip_trunks`](#public-sip_trunks)
- [`public.suppression_list`](#public-suppression_list)
- [`public.system_settings`](#public-system_settings)
- [`public.voip_providers`](#public-voip_providers)

### `cron`

- [`cron.job`](#cron-job)
- [`cron.job_run_details`](#cron-job_run_details)

### `functions`

- [`supabase_functions.hooks`](#supabase_functions-hooks)
- [`supabase_functions.migrations`](#supabase_functions-migrations)

### `storage`

- [`storage.buckets`](#storage-buckets)
- [`storage.buckets_analytics`](#storage-buckets_analytics)
- [`storage.buckets_vectors`](#storage-buckets_vectors)
- [`storage.migrations`](#storage-migrations)
- [`storage.objects`](#storage-objects)
- [`storage.s3_multipart_uploads`](#storage-s3_multipart_uploads)
- [`storage.s3_multipart_uploads_parts`](#storage-s3_multipart_uploads_parts)
- [`storage.vector_indexes`](#storage-vector_indexes)

## Schema: `public`

### `public.call_events` {#public-call_events}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | bigint | updatable, NOT NULL | default: `nextval('call_events_id_seq'::regclass)` | — |
| `room` | text | updatable, NOT NULL | — | — |
| `campaign_id` | integer | updatable, nullable | — | — |
| `contact_id` | integer | updatable, nullable | — | — |
| `phone` | text | updatable, nullable | — | — |
| `event_type` | text | updatable, NOT NULL | — | — |
| `payload` | jsonb | updatable, NOT NULL | default: `'{}'::jsonb` | — |
| `processed` | boolean | updatable, NOT NULL | default: `false` | — |
| `created_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |

### `public.call_logs` {#public-call_logs}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`
- **Foreign keys:**
  - `public.call_logs.campaign_id` → `public.campaigns.id` (`call_logs_campaign_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | integer | updatable, NOT NULL | default: `nextval('call_logs_id_seq'::regclass)` | — |
| `campaign_id` | integer | updatable, nullable | — | — |
| `phone_number` | character varying | updatable, NOT NULL | — | — |
| `status` | character varying | updatable, nullable | default: `'pending'::character varying` | — |
| `dialed` | integer | updatable, nullable | default: `0` | — |
| `connected` | integer | updatable, nullable | default: `0` | — |
| `qualified` | integer | updatable, nullable | default: `0` | — |
| `voicemail` | integer | updatable, nullable | default: `0` | — |
| `no_speech` | integer | updatable, nullable | default: `0` | — |
| `hangup` | integer | updatable, nullable | default: `0` | — |
| `ni` | integer | updatable, nullable | default: `0` | — |
| `dnq` | integer | updatable, nullable | default: `0` | — |
| `callback` | integer | updatable, nullable | default: `0` | — |
| `no_answer` | integer | updatable, nullable | default: `0` | — |
| `busy_line` | integer | updatable, nullable | default: `0` | — |
| `failed` | integer | updatable, nullable | default: `0` | — |
| `duration` | interval | updatable, nullable | default: `'00:00:00'::interval` | — |
| `cpl` | numeric | updatable, nullable | default: `0.00` | — |
| `total_spent` | numeric | updatable, nullable | default: `0.00` | — |
| `called_at` | timestamp with time zone | updatable, nullable | — | — |
| `created_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |
| `updated_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |

### `public.call_records` {#public-call_records}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`
- **Foreign keys:**
  - `public.call_records.contact_id` → `public.contacts.id` (`call_records_contact_id_fkey`)
  - `public.call_records.campaign_id` → `public.campaigns.id` (`call_records_campaign_id_fkey`)
  - `public.call_sessions.call_record_id` → `public.call_records.id` (`call_sessions_call_record_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | bigint | updatable, NOT NULL, IDENTITY | — | — |
| `campaign_id` | integer | updatable, NOT NULL | — | — |
| `phone` | character varying | updatable, NOT NULL | — | — |
| `outcome` | character varying | updatable, NOT NULL | default: `'pending'::character varying` | — |
| `talk_seconds` | integer | updatable, NOT NULL | default: `0` | — |
| `cost` | numeric | updatable, NOT NULL | default: `0.00` | — |
| `transferred` | boolean | updatable, NOT NULL | default: `false` | — |
| `recording_url` | text | updatable, nullable | — | — |
| `called_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |
| `created_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |
| `room` | character varying | updatable, nullable | — | — |
| `contact_id` | integer | updatable, nullable | — | — |
| `egress_id` | character varying | updatable, nullable | — | — |
| `recording_consent` | boolean | updatable, nullable | — | — |
| `recording_disclosed` | boolean | updatable, NOT NULL | default: `false` | — |
| `scored` | boolean | updatable, NOT NULL | default: `false` | — |
| `script_path` | text | updatable, nullable | — | — |

### `public.call_session_events` {#public-call_session_events}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`
- **Foreign keys:**
  - `public.call_session_events.session_id` → `public.call_sessions.id` (`call_session_events_session_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | bigint | updatable, NOT NULL | default: `nextval('call_session_events_id_seq'::regclass)` | — |
| `session_id` | uuid | updatable, NOT NULL | — | — |
| `source` | text | updatable, NOT NULL | — | — |
| `event_type` | text | updatable, NOT NULL | — | — |
| `payload` | jsonb | updatable, NOT NULL | default: `'{}'::jsonb` | — |
| `occurred_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |
| `external_id` | text | updatable, nullable, UNIQUE | — | — |
| `created_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |

### `public.call_sessions` {#public-call_sessions}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`
- **Foreign keys:**
  - `public.call_session_events.session_id` → `public.call_sessions.id` (`call_session_events_session_id_fkey`)
  - `public.call_sessions.call_record_id` → `public.call_records.id` (`call_sessions_call_record_id_fkey`)
  - `public.call_sessions.campaign_id` → `public.campaigns.id` (`call_sessions_campaign_id_fkey`)
  - `public.call_sessions.contact_id` → `public.contacts.id` (`call_sessions_contact_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | uuid | updatable, NOT NULL | default: `gen_random_uuid()` | — |
| `call_record_id` | bigint | updatable, nullable | — | — |
| `campaign_id` | integer | updatable, NOT NULL | — | — |
| `contact_id` | integer | updatable, nullable | — | — |
| `room` | text | updatable, NOT NULL, UNIQUE | — | — |
| `attempt` | integer | updatable, NOT NULL | default: `1` | — |
| `room_id` | text | updatable, nullable | — | — |
| `job_id` | text | updatable, nullable | — | — |
| `livekit_session_id` | text | updatable, nullable | — | — |
| `sip_call_id` | text | updatable, nullable | — | — |
| `started_at` | timestamp with time zone | updatable, nullable | — | — |
| `ended_at` | timestamp with time zone | updatable, nullable | — | — |
| `disconnect_reason` | text | updatable, nullable | — | — |
| `sip_call_status` | text | updatable, nullable | — | — |
| `session_report` | jsonb | updatable, nullable | — | — |
| `sip_attributes` | jsonb | updatable, nullable | — | — |
| `egress` | jsonb | updatable, nullable | — | — |
| `analytics_detail` | jsonb | updatable, nullable | — | — |
| `sdk_version` | text | updatable, nullable | — | — |
| `audio_recording_path` | text | updatable, nullable | — | — |
| `recording_url` | text | updatable, nullable | — | — |
| `created_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |
| `updated_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |

### `public.campaign_contacts` {#public-campaign_contacts}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`
- **Foreign keys:**
  - `public.campaign_contacts.campaign_id` → `public.campaigns.id` (`campaign_contacts_campaign_id_fkey`)
  - `public.campaign_contacts.contact_id` → `public.contacts.id` (`campaign_contacts_contact_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | bigint | updatable, NOT NULL | default: `nextval('campaign_contacts_id_seq'::regclass)` | — |
| `campaign_id` | integer | updatable, NOT NULL | — | — |
| `contact_id` | integer | updatable, NOT NULL | — | — |
| `status` | character varying | updatable, NOT NULL | default: `'pending'::character varying` | — |
| `retry_count` | integer | updatable, NOT NULL | default: `0` | — |
| `last_attempted_at` | timestamp with time zone | updatable, nullable | — | — |
| `created_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |

### `public.campaigns` {#public-campaigns}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`
- **Foreign keys:**
  - `public.call_logs.campaign_id` → `public.campaigns.id` (`call_logs_campaign_id_fkey`)
  - `public.contacts.campaign_id` → `public.campaigns.id` (`contacts_campaign_id_fkey`)
  - `public.call_records.campaign_id` → `public.campaigns.id` (`call_records_campaign_id_fkey`)
  - `public.intent_stats.campaign_id` → `public.campaigns.id` (`intent_stats_campaign_id_fkey`)
  - `public.campaigns.sip_trunk_id` → `public.sip_trunks.id` (`campaigns_sip_trunk_id_fkey`)
  - `public.call_sessions.campaign_id` → `public.campaigns.id` (`call_sessions_campaign_id_fkey`)
  - `public.campaign_contacts.campaign_id` → `public.campaigns.id` (`campaign_contacts_campaign_id_fkey`)
  - `public.compliance_events.campaign_id` → `public.campaigns.id` (`compliance_events_campaign_id_fkey`)
  - `public.campaigns.company_id` → `public.companies.id` (`campaigns_company_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | integer | updatable, NOT NULL | default: `nextval('campaigns_id_seq'::regclass)` | — |
| `name` | character varying | updatable, NOT NULL | — | — |
| `agent` | character varying | updatable, nullable | — | — |
| `status` | character varying | updatable, NOT NULL | default: `'draft'::character varying` | — |
| `dialing_speed` | integer | updatable, nullable | default: `1` | — |
| `time_window_start` | time without time zone | updatable, nullable | — | — |
| `time_window_end` | time without time zone | updatable, nullable | — | — |
| `voice_recording_url` | text | updatable, nullable | — | — |
| `transfer_key` | character varying | updatable, nullable | — | — |
| `transfer_target` | character varying | updatable, nullable | — | — |
| `created_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |
| `updated_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |
| `company_id` | integer | updatable, nullable | — | — |
| `sip_trunk_id` | integer | updatable, nullable | — | FK to sip_trunks.id; callops resolves it to sip_trunks.livekit_trunk_id for dialing. NULL = no trunk configured. |
| `max_retries` | integer | updatable, NOT NULL | default: `2` | — |
| `retry_cooldown_seconds` | integer | updatable, NOT NULL | default: `3600` | — |
| `max_concurrent` | integer | updatable, NOT NULL | default: `10` | — |
| `auto_paused` | boolean | updatable, NOT NULL | default: `false` | — |
| `voice_path` | text | updatable, nullable | — | Object key in the private voice-recordings bucket; signed at dial time |
| `agent_name` | character varying | updatable, nullable | — | LiveKit agent dispatch name; NULL = use LIVEKIT_AGENT_NAME env default |
| `region` | text | updatable, NOT NULL | default: `'ZA'::text` | — |
| `require_consent` | boolean | updatable, NOT NULL | default: `false` | — |
| `max_attempts_per_day` | integer | updatable, NOT NULL | default: `3` | — |
| `retry_jitter_seconds` | integer | updatable, NOT NULL | default: `2700` | — |
| `disclosure_text` | text | updatable, nullable | — | — |
| `answer_delay_sec` | integer | updatable, NOT NULL | default: `2` | — |
| `silence_timeout_sec` | integer | updatable, NOT NULL | default: `4` | — |
| `amd_enabled` | boolean | updatable, NOT NULL | default: `true` | — |
| `voicemail_action` | text | updatable, NOT NULL | default: `'hangup'::text` | — |
| `audio_path` | text | updatable, nullable | — | — |
| `start_date` | date | updatable, nullable | — | — |
| `end_date` | date | updatable, nullable | — | — |
| `routing_mode` | character varying | updatable, nullable | default: `'script'::character varying` | Agent call flow: script (play audio + DTMF) or agent (conversational). Sent to LiveKit as metadata.mode. |
| `opt_out_key` | character varying | updatable, nullable | default: `'9'::character varying` | DTMF digit that ends the call as opt_out. Sent to LiveKit as metadata.opt_out_key |

### `public.companies` {#public-companies}

- **RLS enabled:** yes
- **Rows (approx):** 2
- **Primary key:** `id`
- **Foreign keys:**
  - `public.sip_trunks.company_id` → `public.companies.id` (`sip_trunks_company_id_fkey`)
  - `public.suppression_list.company_id` → `public.companies.id` (`suppression_list_company_id_fkey`)
  - `public.campaigns.company_id` → `public.companies.id` (`campaigns_company_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | integer | updatable, NOT NULL | default: `nextval('companies_id_seq'::regclass)` | — |
| `name` | character varying | updatable, NOT NULL, UNIQUE | — | — |
| `created_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |
| `contact_name` | character varying | updatable, nullable | — | — |
| `contact_email` | character varying | updatable, nullable | — | — |
| `contact_phone` | character varying | updatable, nullable | — | — |

### `public.compliance_events` {#public-compliance_events}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`
- **Foreign keys:**
  - `public.compliance_events.campaign_id` → `public.campaigns.id` (`compliance_events_campaign_id_fkey`)
  - `public.compliance_events.contact_id` → `public.contacts.id` (`compliance_events_contact_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | bigint | updatable, NOT NULL | default: `nextval('compliance_events_id_seq'::regclass)` | — |
| `contact_id` | integer | updatable, nullable | — | — |
| `campaign_id` | integer | updatable, nullable | — | — |
| `event_type` | text | updatable, NOT NULL | — | — |
| `reason` | text | updatable, nullable | — | — |
| `phone_masked` | text | updatable, nullable | — | — |
| `created_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |

### `public.contacts` {#public-contacts}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`
- **Foreign keys:**
  - `public.contacts.campaign_id` → `public.campaigns.id` (`contacts_campaign_id_fkey`)
  - `public.call_sessions.contact_id` → `public.contacts.id` (`call_sessions_contact_id_fkey`)
  - `public.compliance_events.contact_id` → `public.contacts.id` (`compliance_events_contact_id_fkey`)
  - `public.product_consent.contact_id` → `public.contacts.id` (`product_consent_contact_id_fkey`)
  - `public.campaign_contacts.contact_id` → `public.contacts.id` (`campaign_contacts_contact_id_fkey`)
  - `public.call_records.contact_id` → `public.contacts.id` (`call_records_contact_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | integer | updatable, NOT NULL | default: `nextval('contacts_id_seq'::regclass)` | — |
| `campaign_id` | integer | updatable, nullable | — | — |
| `phone` | character varying | updatable, NOT NULL | — | — |
| `first_name` | character varying | updatable, nullable | — | — |
| `last_name` | character varying | updatable, nullable | — | — |
| `status` | character varying | updatable, nullable | default: `'pending'::character varying` | — |
| `created_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |
| `retry_count` | integer | updatable, NOT NULL | default: `0` | — |
| `last_attempted_at` | timestamp with time zone | updatable, nullable | — | — |
| `person_id` | numeric | updatable, nullable, UNIQUE | — | The persons National Identity Number |
| `timezone` | text | updatable, NOT NULL | default: `'Africa/Johannesburg'::text` | — |
| `score` | integer | updatable, NOT NULL | default: `0` | — |

### `public.dashboard_templates` {#public-dashboard_templates}

- **RLS enabled:** yes
- **Rows (approx):** 2
- **Primary key:** `id`
- **Foreign keys:**
  - `public.dashboard_templates.created_by` → `auth.users.id` (`dashboard_templates_created_by_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | uuid | updatable, NOT NULL | default: `gen_random_uuid()` | — |
| `name` | character varying | updatable, NOT NULL | — | — |
| `layout` | jsonb | updatable, NOT NULL | — | — |
| `created_by` | uuid | updatable, nullable | — | — |
| `created_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |

### `public.dial_number_state` {#public-dial_number_state}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `phone`

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `phone` | text | updatable, NOT NULL | — | — |
| `state_date` | date | updatable, NOT NULL | — | — |
| `reached` | boolean | updatable, NOT NULL | default: `false` | — |
| `attempts` | integer | updatable, NOT NULL | default: `0` | — |
| `next_eligible_at` | timestamp with time zone | updatable, nullable | — | — |
| `updated_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |

### `public.intent_stats` {#public-intent_stats}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`
- **Foreign keys:**
  - `public.intent_stats.campaign_id` → `public.campaigns.id` (`intent_stats_campaign_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | bigint | updatable, NOT NULL, IDENTITY | — | — |
| `campaign_id` | integer | updatable, NOT NULL | — | — |
| `day` | date | updatable, NOT NULL | — | — |
| `intent_name` | character varying | updatable, NOT NULL | — | — |
| `step` | integer | updatable, NOT NULL | default: `0` | — |
| `reached` | integer | updatable, NOT NULL | default: `0` | — |

### `public.product_consent` {#public-product_consent}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`
- **Foreign keys:**
  - `public.product_consent.contact_id` → `public.contacts.id` (`product_consent_contact_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | bigint | updatable, NOT NULL | default: `nextval('product_consent_id_seq'::regclass)` | — |
| `contact_id` | integer | updatable, NOT NULL | — | — |
| `product` | text | updatable, NOT NULL | — | — |
| `consent_status` | text | updatable, NOT NULL | default: `'unknown'::text` | — |
| `consent_source` | text | updatable, nullable | — | — |
| `consent_at` | timestamp with time zone | updatable, nullable | — | — |
| `updated_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |

### `public.profiles` {#public-profiles}

- **RLS enabled:** yes
- **Rows (approx):** 3
- **Primary key:** `id`
- **Foreign keys:**
  - `public.profiles.id` → `auth.users.id` (`profiles_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | uuid | updatable, NOT NULL | — | — |
| `full_name` | text | updatable, nullable | — | — |
| `role` | text | updatable, nullable | default: `'engineer'::text` | — |
| `face_signature` | text | updatable, nullable | — | — |
| `passkey_credential` | jsonb | updatable, nullable | — | — |
| `created_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |
| `updated_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |

### `public.security_logs` {#public-security_logs}

- **RLS enabled:** yes
- **Rows (approx):** 9
- **Primary key:** `id`

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | uuid | updatable, NOT NULL | default: `gen_random_uuid()` | — |
| `event_type` | text | updatable, NOT NULL | — | — |
| `agent_name` | text | updatable, nullable | — | — |
| `ip_address` | text | updatable, nullable | — | — |
| `details` | text | updatable, nullable | — | — |
| `created_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |

### `public.sip_trunks` {#public-sip_trunks}

- **RLS enabled:** yes
- **Rows (approx):** 2
- **Primary key:** `id`
- **Foreign keys:**
  - `public.campaigns.sip_trunk_id` → `public.sip_trunks.id` (`campaigns_sip_trunk_id_fkey`)
  - `public.sip_trunks.company_id` → `public.companies.id` (`sip_trunks_company_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | integer | updatable, NOT NULL | default: `nextval('sip_trunks_id_seq'::regclass)` | — |
| `name` | character varying | updatable, NOT NULL | — | — |
| `livekit_trunk_id` | character varying | updatable, NOT NULL | — | — |
| `from_number` | character varying | updatable, NOT NULL | — | — |
| `company_id` | integer | updatable, nullable | — | — |
| `created_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |
| `campaign` | character varying | updatable, nullable | — | — |

### `public.suppression_list` {#public-suppression_list}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`
- **Foreign keys:**
  - `public.suppression_list.company_id` → `public.companies.id` (`suppression_list_company_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | bigint | updatable, NOT NULL | default: `nextval('suppression_list_id_seq'::regclass)` | — |
| `phone` | text | updatable, NOT NULL | — | — |
| `reason` | text | updatable, NOT NULL | — | — |
| `company_id` | integer | updatable, nullable | — | — |
| `created_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |

### `public.system_settings` {#public-system_settings}

- **RLS enabled:** yes
- **Rows (approx):** 1
- **Primary key:** `id`

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | text | updatable, NOT NULL | — | — |
| `whitelisted_ips` | ARRAY | updatable, nullable | — | — |
| `environment` | text | updatable, nullable | default: `'staging'::text` | — |
| `updated_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |

### `public.voip_providers` {#public-voip_providers}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | integer | updatable, NOT NULL | default: `nextval('voip_providers_id_seq'::regclass)` | — |
| `name` | character varying | updatable, NOT NULL | — | — |
| `api_key` | character varying | updatable, nullable | — | — |
| `api_secret` | character varying | updatable, nullable | — | — |
| `created_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |

## Schema: `cron`

### `cron.job` {#cron-job}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `jobid`

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `jobid` | bigint | updatable, NOT NULL | default: `nextval('cron.jobid_seq'::regclass)` | — |
| `schedule` | text | updatable, NOT NULL | — | — |
| `command` | text | updatable, NOT NULL | — | — |
| `nodename` | text | updatable, NOT NULL | default: `'localhost'::text` | — |
| `nodeport` | integer | updatable, NOT NULL | default: `inet_server_port()` | — |
| `database` | text | updatable, NOT NULL | default: `current_database()` | — |
| `username` | text | updatable, NOT NULL | default: `CURRENT_USER` | — |
| `active` | boolean | updatable, NOT NULL | default: `true` | — |
| `jobname` | text | updatable, nullable | — | — |

### `cron.job_run_details` {#cron-job_run_details}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `runid`

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `jobid` | bigint | updatable, nullable | — | — |
| `runid` | bigint | updatable, NOT NULL | default: `nextval('cron.runid_seq'::regclass)` | — |
| `job_pid` | integer | updatable, nullable | — | — |
| `database` | text | updatable, nullable | — | — |
| `username` | text | updatable, nullable | — | — |
| `command` | text | updatable, nullable | — | — |
| `status` | text | updatable, nullable | — | — |
| `return_message` | text | updatable, nullable | — | — |
| `start_time` | timestamp with time zone | updatable, nullable | — | — |
| `end_time` | timestamp with time zone | updatable, nullable | — | — |

## Schema: `functions`

### `supabase_functions.hooks` {#supabase_functions-hooks}

Supabase Functions Hooks: Audit trail for triggered hooks.

- **RLS enabled:** no
- **Rows (approx):** 0
- **Primary key:** `id`

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | bigint | updatable, NOT NULL | default: `nextval('supabase_functions.hooks_id_seq'::regclass)` | — |
| `hook_table_id` | integer | updatable, NOT NULL | — | — |
| `hook_name` | text | updatable, NOT NULL | — | — |
| `created_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |
| `request_id` | bigint | updatable, nullable | — | — |

### `supabase_functions.migrations` {#supabase_functions-migrations}

- **RLS enabled:** no
- **Rows (approx):** 2
- **Primary key:** `version`

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `version` | text | updatable, NOT NULL | — | — |
| `inserted_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |

## Schema: `storage`

### `storage.buckets` {#storage-buckets}

- **RLS enabled:** yes
- **Rows (approx):** 3
- **Primary key:** `id`
- **Foreign keys:**
  - `storage.s3_multipart_uploads.bucket_id` → `storage.buckets.id` (`s3_multipart_uploads_bucket_id_fkey`)
  - `storage.objects.bucket_id` → `storage.buckets.id` (`objects_bucketId_fkey`)
  - `storage.s3_multipart_uploads_parts.bucket_id` → `storage.buckets.id` (`s3_multipart_uploads_parts_bucket_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | text | updatable, NOT NULL | — | — |
| `name` | text | updatable, NOT NULL | — | — |
| `owner` | uuid | updatable, nullable | — | Field is deprecated, use owner_id instead |
| `created_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |
| `updated_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |
| `public` | boolean | updatable, nullable | default: `false` | — |
| `avif_autodetection` | boolean | updatable, nullable | default: `false` | — |
| `file_size_limit` | bigint | updatable, nullable | — | — |
| `allowed_mime_types` | ARRAY | updatable, nullable | — | — |
| `owner_id` | text | updatable, nullable | — | — |
| `type` | USER-DEFINED (STANDARD | ANALYTICS | VECTOR) | updatable, NOT NULL | default: `'STANDARD'::storage.buckettype` | — |

### `storage.buckets_analytics` {#storage-buckets_analytics}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `name` | text | updatable, NOT NULL | — | — |
| `type` | USER-DEFINED (STANDARD | ANALYTICS | VECTOR) | updatable, NOT NULL | default: `'ANALYTICS'::storage.buckettype` | — |
| `format` | text | updatable, NOT NULL | default: `'ICEBERG'::text` | — |
| `created_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |
| `updated_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |
| `id` | uuid | updatable, NOT NULL | default: `gen_random_uuid()` | — |
| `deleted_at` | timestamp with time zone | updatable, nullable | — | — |

### `storage.buckets_vectors` {#storage-buckets_vectors}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`
- **Foreign keys:**
  - `storage.vector_indexes.bucket_id` → `storage.buckets_vectors.id` (`vector_indexes_bucket_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | text | updatable, NOT NULL | — | — |
| `type` | USER-DEFINED (STANDARD | ANALYTICS | VECTOR) | updatable, NOT NULL | default: `'VECTOR'::storage.buckettype` | — |
| `created_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |
| `updated_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |

### `storage.migrations` {#storage-migrations}

- **RLS enabled:** yes
- **Rows (approx):** 61
- **Primary key:** `id`

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | integer | updatable, NOT NULL | — | — |
| `name` | character varying | updatable, NOT NULL, UNIQUE | — | — |
| `hash` | character varying | updatable, NOT NULL | — | — |
| `executed_at` | timestamp without time zone | updatable, nullable | default: `CURRENT_TIMESTAMP` | — |

### `storage.objects` {#storage-objects}

- **RLS enabled:** yes
- **Rows (approx):** 25
- **Primary key:** `id`
- **Foreign keys:**
  - `storage.objects.bucket_id` → `storage.buckets.id` (`objects_bucketId_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | uuid | updatable, NOT NULL | default: `gen_random_uuid()` | — |
| `bucket_id` | text | updatable, nullable | — | — |
| `name` | text | updatable, nullable | — | — |
| `owner` | uuid | updatable, nullable | — | Field is deprecated, use owner_id instead |
| `created_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |
| `updated_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |
| `last_accessed_at` | timestamp with time zone | updatable, nullable | default: `now()` | — |
| `metadata` | jsonb | updatable, nullable | — | — |
| `path_tokens` | ARRAY | updatable, nullable, GENERATED | default: `string_to_array(name, '/'::text)` | — |
| `version` | text | updatable, nullable | — | — |
| `owner_id` | text | updatable, nullable | — | — |
| `user_metadata` | jsonb | updatable, nullable | — | — |

### `storage.s3_multipart_uploads` {#storage-s3_multipart_uploads}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`
- **Foreign keys:**
  - `storage.s3_multipart_uploads.bucket_id` → `storage.buckets.id` (`s3_multipart_uploads_bucket_id_fkey`)
  - `storage.s3_multipart_uploads_parts.upload_id` → `storage.s3_multipart_uploads.id` (`s3_multipart_uploads_parts_upload_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | text | updatable, NOT NULL | — | — |
| `in_progress_size` | bigint | updatable, NOT NULL | default: `0` | — |
| `upload_signature` | text | updatable, NOT NULL | — | — |
| `bucket_id` | text | updatable, NOT NULL | — | — |
| `key` | text | updatable, NOT NULL | — | — |
| `version` | text | updatable, NOT NULL | — | — |
| `owner_id` | text | updatable, nullable | — | — |
| `created_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |
| `user_metadata` | jsonb | updatable, nullable | — | — |
| `metadata` | jsonb | updatable, nullable | — | — |

### `storage.s3_multipart_uploads_parts` {#storage-s3_multipart_uploads_parts}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`
- **Foreign keys:**
  - `storage.s3_multipart_uploads_parts.upload_id` → `storage.s3_multipart_uploads.id` (`s3_multipart_uploads_parts_upload_id_fkey`)
  - `storage.s3_multipart_uploads_parts.bucket_id` → `storage.buckets.id` (`s3_multipart_uploads_parts_bucket_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | uuid | updatable, NOT NULL | default: `gen_random_uuid()` | — |
| `upload_id` | text | updatable, NOT NULL | — | — |
| `size` | bigint | updatable, NOT NULL | default: `0` | — |
| `part_number` | integer | updatable, NOT NULL | — | — |
| `bucket_id` | text | updatable, NOT NULL | — | — |
| `key` | text | updatable, NOT NULL | — | — |
| `etag` | text | updatable, NOT NULL | — | — |
| `owner_id` | text | updatable, nullable | — | — |
| `version` | text | updatable, NOT NULL | — | — |
| `created_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |

### `storage.vector_indexes` {#storage-vector_indexes}

- **RLS enabled:** yes
- **Rows (approx):** 0
- **Primary key:** `id`
- **Foreign keys:**
  - `storage.vector_indexes.bucket_id` → `storage.buckets_vectors.id` (`vector_indexes_bucket_id_fkey`)

| Column | Type | Constraints | Default | Comment |
|--------|------|-------------|---------|--------|
| `id` | text | updatable, NOT NULL | default: `gen_random_uuid()` | — |
| `name` | text | updatable, NOT NULL | — | — |
| `bucket_id` | text | updatable, NOT NULL | — | — |
| `data_type` | text | updatable, NOT NULL | — | — |
| `dimension` | integer | updatable, NOT NULL | — | — |
| `distance_metric` | text | updatable, NOT NULL | — | — |
| `metadata_configuration` | jsonb | updatable, nullable | — | — |
| `created_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |
| `updated_at` | timestamp with time zone | updatable, NOT NULL | default: `now()` | — |

