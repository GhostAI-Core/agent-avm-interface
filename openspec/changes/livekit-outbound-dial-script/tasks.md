## 1. Schema sync

- [x] 1.1 Add migration `supabase/migrations/20260612140000_livekit_dialer_schema.sql` with `sip_trunks`, campaign dialer columns, `call_records` LiveKit columns, and expanded `contacts` statuses (idempotent)
- [x] 1.2 Enable RLS on `sip_trunks` with authenticated policy
- [x] 1.3 Update root `schema.sql` to reflect the same LiveKit dialer additions

## 2. Dependencies and configuration

- [x] 2.1 Add `livekit-server-sdk` to `package.json` dependencies
- [x] 2.2 Add `tsx` and `dotenv` as devDependencies
- [x] 2.3 Add `"dial": "tsx scripts/dial-outbound.ts"` npm script
- [x] 2.4 Extend `.env.example` with LiveKit vars (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_AGENT_NAME`, `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`) and `SUPABASE_SERVICE_ROLE_KEY`

## 3. Shared utilities

- [x] 3.1 Create `lib/phone.ts` with `normalizePhone(input: string): string` (strip quotes/whitespace, E.164 normalization)
- [x] 3.2 Add unit-less smoke test or inline validation examples in script comments for known malformed DB values

## 4. Dial script

- [x] 4.1 Create `scripts/dial-outbound.ts` with CLI args: `--campaign-id`, `--contact-id`, `--phone`
- [x] 4.2 Implement Supabase service-role client loading campaign, contact, and sip_trunk join
- [x] 4.3 Generate room name `avm-c{campaignId}-ct{contactId}-{ts}` and build dispatch metadata JSON
- [x] 4.4 Insert `call_records` (pending) and update `contacts` to `in_progress` before LiveKit calls
- [x] 4.5 Call `AgentDispatchClient.createDispatch(room, agentName, { metadata })`
- [x] 4.6 Call `SipClient.createSipParticipant(trunkId, phone, room, { waitUntilAnswered: true, participantIdentity: phone, krispEnabled: true })`
- [x] 4.7 On SIP `TwirpError`, map SIP status to `call_records.outcome` and log details
- [x] 4.8 Print summary: room, dispatch ID, trunk ID, phone, call_record ID

## 5. Dashboard polling

- [x] 5.1 Add `NEXT_PUBLIC_POLL_INTERVAL_MS` (default 15000) to `.env.example`
- [x] 5.2 Add polling `useEffect` in `app/page.tsx` that re-fetches campaigns, reports, logs, and intents on interval when `auth` is true
- [x] 5.3 Clear interval on logout and unmount; skip duplicate fetch at mount (initial fetch unchanged)

## 6. Verification

- [x] 6.1 Run migration against `evra_avm` (or confirm already-applied columns are no-ops)
- [x] 6.2 Dry-run script with missing env — verify clear error messages listing required vars
- [ ] 6.3 With valid LiveKit + Supabase config, dial a test contact and confirm `call_records` row appears in dashboard within one poll cycle
