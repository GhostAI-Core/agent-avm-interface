## ADDED Requirements

### Requirement: Authenticated TTS generation endpoint

The system SHALL expose `POST /api/tts/generate` that proxies text-to-speech requests to the Inworld TTS API. The endpoint MUST require an authenticated Supabase session and MUST NOT expose Inworld credentials to the client.

#### Scenario: Successful generation

- **WHEN** an authenticated user sends `{ "text": "<non-empty script>", "voiceId": "<valid inworld voice id>" }`
- **THEN** the server calls `https://api.inworld.ai/tts/v1/voice` with `Authorization: Basic` using `INWORLD_API_KEY`
- **AND** returns `{ "audioBase64": "<base64>", "contentType": "audio/mpeg" }`

#### Scenario: Unauthenticated request rejected

- **WHEN** a request arrives without a valid Supabase session
- **THEN** the server returns HTTP 401

#### Scenario: Missing or empty text rejected

- **WHEN** an authenticated user sends a request with missing or whitespace-only `text`
- **THEN** the server returns HTTP 400 with an error message

#### Scenario: Missing voiceId rejected

- **WHEN** an authenticated user sends a request without `voiceId`
- **THEN** the server returns HTTP 400 with an error message

#### Scenario: Unknown voiceId rejected

- **WHEN** an authenticated user sends a `voiceId` not present in the voice catalog
- **THEN** the server returns HTTP 400 with an error message

#### Scenario: Inworld not configured

- **WHEN** `INWORLD_API_KEY` is unset and an authenticated user requests generation
- **THEN** the server returns HTTP 503 with a generic configuration error
- **AND** does not forward the request to Inworld

#### Scenario: Inworld API failure

- **WHEN** Inworld returns a non-success response
- **THEN** the server returns an appropriate HTTP error (4xx/5xx) with a safe error message
- **AND** does not include credentials or raw Inworld response bodies in the client payload

### Requirement: Fixed synthesis parameters

The server SHALL apply fixed Inworld synthesis parameters for all requests: `modelId` = `inworld-tts-1.5-max`, `timestampType` = `WORD`, `audioConfig.speakingRate` = `1.2`, `temperature` = `1.4`. Only `text` and `voiceId` SHALL be accepted from the client in v1.

#### Scenario: Server sends full Inworld payload

- **WHEN** the server proxies a valid generation request
- **THEN** the outbound Inworld request body includes the fixed parameters above plus the client-supplied `text` and `voiceId`

### Requirement: Script length limit

The server SHALL reject requests where `text` exceeds a configured maximum length (default 2000 characters).

#### Scenario: Script too long

- **WHEN** an authenticated user sends `text` longer than the maximum length
- **THEN** the server returns HTTP 400 with an error indicating the limit was exceeded
