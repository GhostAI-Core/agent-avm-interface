# campaign-voice-generation Specification

## Purpose
TBD - created by archiving change inworld-tts-voice-generation. Update Purpose after archive.
## Requirements
### Requirement: Voice source mode toggle

The New Campaign wizard Step 3 (Voice & Contacts) SHALL provide a toggle between **Upload** and **Generate** voice source modes. The modes MUST be mutually exclusive; switching modes SHALL clear the other mode's selection and any unsaved generated audio state.

#### Scenario: Default upload mode

- **WHEN** the operator opens Step 3
- **THEN** Upload mode is selected by default
- **AND** the existing file upload field is visible

#### Scenario: Switch to generate mode

- **WHEN** the operator selects Generate mode
- **THEN** the voice generator UI is shown
- **AND** any selected upload file is cleared

#### Scenario: Switch back to upload mode

- **WHEN** the operator selects Upload mode after using Generate
- **THEN** the file upload field is shown
- **AND** generated preview audio and unsaved `voicePath` state are cleared

### Requirement: Cascading voice picker

In Generate mode, the system SHALL present three dependent dropdowns: **Gender** (Male, Female), **Ethnicity** (White, African), and **Voice** (display name). Options MUST be derived from `docs/voicelist.md` voice IDs by parsing the suffix after `__` as `{gender}_{name}_{ethnicity}` or `{gender}_{name}_{ethnicity}_soft` for soft variants.

#### Scenario: Filter ethnicity by gender

- **WHEN** the operator selects a gender
- **THEN** the ethnicity dropdown shows only ethnicities available for that gender
- **AND** prior ethnicity/voice selections reset if invalid

#### Scenario: Filter voice by gender and ethnicity

- **WHEN** the operator selects gender and ethnicity
- **THEN** the voice dropdown lists matching voices with capitalized display names
- **AND** soft variants display as `Name (Soft)` (e.g. Jennifer (Soft))

#### Scenario: Voice selection resolves voiceId

- **WHEN** the operator selects a voice from the dropdown
- **THEN** the system holds the full Inworld `voiceId` for API calls and sample playback

### Requirement: Static voice sample preview

The system SHALL allow the operator to preview a static sample of the selected voice from `/voice-samples/{suffix}.mp3`, where `{suffix}` is the voice ID portion after `__` (e.g. `male_abulele_african`).

#### Scenario: Play voice sample

- **WHEN** the operator activates sample playback for a selected voice
- **THEN** the browser plays the corresponding static MP3 from `public/voice-samples/`

#### Scenario: Sample file missing

- **WHEN** the sample file does not exist
- **THEN** playback fails gracefully without blocking script generation

### Requirement: Script input and generation

In Generate mode, the system SHALL provide a multiline script text field and a **Generate** button. Generate MUST be disabled when the script is empty or a generation request is in progress.

#### Scenario: Successful generation preview

- **WHEN** the operator enters script text, selects a voice, and clicks Generate
- **THEN** the client calls `POST /api/tts/generate` with `{ text, voiceId }`
- **AND** on success decodes the returned audio and shows a hidden-until-ready audio player for listen-back

#### Scenario: Generation error displayed

- **WHEN** generation fails
- **THEN** an error message is shown to the operator
- **AND** no save action is available

#### Scenario: Voice change clears stale generation

- **WHEN** the operator changes gender, ethnicity, or voice after a successful generation
- **THEN** the generated preview and any unsaved `voicePath` are cleared

### Requirement: Save generated recording

After a successful generation, the system SHALL show a **Save recording** action that uploads the generated MP3 to the `voice-recordings` Supabase bucket and sets the campaign's `voice_path` for submission.

#### Scenario: Save uploads and attaches voice path

- **WHEN** the operator clicks Save recording after a successful generation
- **THEN** the client uploads the audio as `{uuid}.mp3` to the `voice-recordings` bucket
- **AND** stores the object path in component state as `voicePath`
- **AND** shows confirmation that the recording is saved

#### Scenario: Save disabled without generation

- **WHEN** no successful generation exists
- **THEN** Save recording is disabled

#### Scenario: Campaign create uses saved voice path

- **WHEN** the operator completes the wizard with a saved `voicePath` and no upload file
- **THEN** the campaign POST includes `voice_path` set to the uploaded object key
- **AND** no `voice_file` upload is performed

### Requirement: Voice recording remains optional

Campaign creation SHALL succeed without a voice recording whether the operator uses Upload, Generate, or neither.

#### Scenario: Create campaign without voice

- **WHEN** the operator submits the wizard without an upload file and without a saved generated recording
- **THEN** the campaign is created with `voice_path` null
- **AND** no voice upload occurs

### Requirement: Scope limited to new campaign wizard

The Generate voice UI SHALL appear only in `CampaignModal` (new campaign flow). `CampaignActionDialog` SHALL NOT include TTS generation in v1.

#### Scenario: Edit campaign dialog unchanged

- **WHEN** the operator opens CampaignActionDialog to edit or reuse a campaign
- **THEN** the existing voice URL / upload behavior is unchanged
- **AND** no TTS generator is shown

