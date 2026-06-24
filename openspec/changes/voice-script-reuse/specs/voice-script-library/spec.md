## ADDED Requirements

### Requirement: Saved scripts persist their source text

When a generated script is saved, the system SHALL persist the script text together with the voice it was generated with and the saved audio URL, so the script can be retrieved and reused later. Persistence MUST be best-effort relative to the audio save: a failure to write the library row MUST NOT fail the audio save.

#### Scenario: Save persists text and voice

- **WHEN** the operator saves a generated recording
- **THEN** a `voice_scripts` row is written with the script `text`, the `voice_id` used, the public `audio_url`, and the `campaign_name`
- **AND** the audio upload succeeds regardless of whether the row write succeeds

#### Scenario: Library write failure does not block save

- **WHEN** the `voice_scripts` insert fails
- **THEN** the audio is still saved and the save action reports success
- **AND** the failure is logged server-side

### Requirement: Previously-used scripts are retrievable

The system SHALL expose previously-saved scripts via `GET /api/voice-scripts`, returning recent scripts newest-first, global across campaigns, for authenticated users.

#### Scenario: List recent scripts

- **WHEN** an authenticated client requests `GET /api/voice-scripts`
- **THEN** it receives recent `voice_scripts` (id, text, voice_id, audio_url, campaign_name, created_at), newest first
- **AND** an empty list when none exist (the feature degrades to no bubbles)

### Requirement: Reuse bubbles in the voice generator

The voice generator SHALL show previously-used scripts as bubbles above the Script field. Each bubble shows a text snippet; an audio-play affordance plays the saved clip; activating the bubble loads the full text and restores the voice selection into the editor for further editing.

#### Scenario: Listen to a saved script

- **WHEN** the operator activates the play affordance on a bubble that has an `audio_url`
- **THEN** the saved clip plays without changing the editor state

#### Scenario: Bubble without audio

- **WHEN** a saved script has no `audio_url`
- **THEN** its bubble shows no play affordance
- **AND** the bubble can still load the text

#### Scenario: Load a script into the editor

- **WHEN** the operator activates a bubble
- **THEN** the Script field is populated with that script's text
- **AND** the gender/ethnicity/voice selectors are set to the voice it was generated with (resolved from `voice_id`)
- **AND** both the text and voice remain editable

#### Scenario: Just-saved script appears

- **WHEN** the operator saves a new recording
- **THEN** the bubble list refreshes so the just-saved script is available for reuse

#### Scenario: No saved scripts

- **WHEN** there are no previously-saved scripts
- **THEN** the reuse-bubbles row is not shown and generation/save are unaffected
