## ADDED Requirements

### Requirement: CallRecord carries the 2-tier result fields

The dashboard's `CallRecord` type SHALL include the fields callops now returns for a call: `outcome` (telephony), `business_disposition` (business result), `talk_seconds`, `cost`, `transferred`, `room`, `called_at`, `started_at`, `ended_at`. `business_disposition` MAY be null/empty (calls with no business result, or recorded before the contract) and consumers MUST tolerate its absence.

#### Scenario: Record exposes outcome and business_disposition separately

- **WHEN** the dashboard loads a call sourced from callops
- **THEN** the record carries `outcome` and `business_disposition` as separate values
- **AND** neither is derived from or overwritten by the other

#### Scenario: Legacy call with no business_disposition

- **WHEN** a call record has no `business_disposition`
- **THEN** the UI renders the record without error
- **AND** the disposition displays as a neutral placeholder (e.g. "—"), not a fabricated value

### Requirement: Deprecated agent_outcome is not used for breakdowns

The dashboard SHALL NOT use `agent_outcome` as the source for outcome/disposition breakdowns, counts, or filters. `business_disposition` is the authoritative business-result field. Any existing read of `agent_outcome` for display MUST be migrated to `business_disposition`.

#### Scenario: Opt-out count comes from business_disposition

- **WHEN** the dashboard computes an opt-out count
- **THEN** it counts `business_disposition = opt_out`
- **AND** does not rely on `agent_outcome` (which callops no longer writes)

### Requirement: Result tiers render as distinct fields with full disposition vocabulary

The call log and campaign-detail call table SHALL render `outcome` and `business_disposition` as distinct, separately-labelled columns/fields, and MUST support the full disposition vocabulary `subscribe`, `opt_out`, `callback`, and `interested`. The UI MUST NOT collapse `business_disposition` into the `outcome` column.

#### Scenario: Connected call that opted out

- **WHEN** a call has `outcome = connected` and `business_disposition = opt_out`
- **THEN** the table shows `connected` in the outcome column and `opt_out` in the disposition column

#### Scenario: Interested disposition is shown

- **WHEN** a call has `business_disposition = interested` (pressed 1 once, did not confirm)
- **THEN** the dashboard displays "interested" as a first-class disposition, distinct from `subscribe`

#### Scenario: CSV export includes both tiers

- **WHEN** the operator exports the call table to CSV
- **THEN** the export contains separate `outcome` and `business_disposition` columns

### Requirement: Legacy non-callops outcome vocabulary is retired

The dashboard SHALL NOT present outcome categories absent from callops' `/lookups/call-outcomes`. The legacy report keys `no_speech`, `hangup`, `ni`, `dnq`, and `busy_line` MUST be removed from the report/chart vocabulary.

#### Scenario: Reports use only callops call-outcome vocabulary

- **WHEN** the reports view aggregates telephony outcomes
- **THEN** every bucket maps to a value from `/lookups/call-outcomes`
- **AND** no bucket labelled `no_speech`, `hangup`, `ni`, `dnq`, or `busy_line` is shown
