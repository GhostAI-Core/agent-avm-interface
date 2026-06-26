## ADDED Requirements

### Requirement: Campaign script generation persists voice_id

When an operator generates or selects TTS script audio for a campaign, the dashboard SHALL persist the full Inworld `voice_id` on the campaign (`campaigns.voice_id`) alongside the script audio URL. callops uses `voice_id` at dial time to select the voice-matched two-step-consent confirm audio; a consent campaign missing `voice_id` fails closed at callops.

#### Scenario: Generated voice is saved to the campaign

- **WHEN** an operator generates script audio with a chosen Inworld voice and saves the campaign
- **THEN** the campaign persists that voice's `voice_id`
- **AND** the value is the full Inworld voice id callops expects to match a confirm-audio asset

#### Scenario: Editing a campaign preserves or updates voice_id

- **WHEN** an operator edits a campaign and regenerates the script with a different voice
- **THEN** the campaign's `voice_id` updates to the new voice
- **AND** an edit that does not change the script leaves `voice_id` unchanged

### Requirement: voice_id is included in the campaign PUT whitelist

`campaigns.voice_id` exists in the (single, shared) Supabase as of 2026-06-26. The campaign update route SHALL include `voice_id` in its allowed-fields whitelist so the value persists on save/edit, consistent with how other campaign fields are whitelisted.

#### Scenario: voice_id persists through the campaign PUT

- **WHEN** a campaign save carries a `voice_id`
- **THEN** the PUT route accepts `voice_id` (it is on the whitelist) and stores it
- **AND** a save that omits `voice_id` leaves the existing value unchanged
