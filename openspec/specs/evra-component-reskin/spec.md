# evra-component-reskin

Component-level styling updates to consume EVRA tokens and remove legacy glass/blue styling.

## Requirements

### Requirement: Layout shell uses EVRA styling

`Sidebar.tsx`, `TopBar.tsx`, and `FloatingNav.tsx` SHALL be updated to use MUI theme tokens or `lib/tokens.ts` values instead of hardcoded slate/blue rgba colors. Glass effects (blur, translucent backgrounds) SHALL be removed.

#### Scenario: TopBar is flat dark panel

- **WHEN** the TopBar renders
- **THEN** it SHALL NOT use `backdropFilter: blur(...)`
- **AND** its background SHALL be an opaque EVRA surface color

#### Scenario: Sidebar logo wordmark uses Michroma glow

- **WHEN** the Sidebar brand area renders
- **THEN** the tagline text SHALL use uppercase styling with wide letter spacing
- **AND** the wordmark (if text-based) SHALL use Michroma with the EVRA mint glow text-shadow

### Requirement: SurfaceCard replaces glass card pattern

`components/ui/GlassCard.tsx` SHALL be restyled (and optionally renamed to `SurfaceCard`) to render flat EVRA panels: `#292929` background, `#1A1A1A` border, `4px` radius, no shadow, no blur.

#### Scenario: KPI cards are flat

- **WHEN** `KpiStrip` renders metric cards via the shared card component
- **THEN** cards SHALL appear as flat EVRA panels without glass blur

### Requirement: KPI and metric values use monospace tabular numerals

`KpiStrip.tsx` and numeric displays in `app/page.tsx` tables SHALL render metric values, currency amounts, and counts with the monospace font stack and `font-variant-numeric: tabular-nums`.

#### Scenario: KPI values are tabular mono

- **WHEN** a KPI value such as "12 345" or "R1 234,56" displays
- **THEN** it SHALL use the mono font family
- **AND** digits SHALL align in tabular format

### Requirement: Phone numbers and IDs use monospace

Phone numbers (including masked values via `maskPhone`) and campaign/record IDs in tables SHALL render with monospace tabular styling.

#### Scenario: Campaign table phone column

- **WHEN** the campaigns table displays a phone number
- **THEN** the cell SHALL use monospace tabular numerals

### Requirement: Status and agent chips use EVRA semantic colors

`StatusChip.tsx` and `AgentChip.tsx` SHALL remap their color dictionaries to EVRA semantic palette values while maintaining visual distinction between statuses.

#### Scenario: Running status uses positive green

- **WHEN** a StatusChip displays status "running"
- **THEN** its colors SHALL derive from `--evra-positive` / `#37A660` family

#### Scenario: Error statuses use EVRA negative

- **WHEN** a StatusChip displays status "hangup" or "failed"
- **THEN** its colors SHALL derive from `--evra-negative` / `#E0524F` family

### Requirement: Charts use EVRA harmonized palette

`Charts.tsx` SHALL import colors from `lib/tokens.ts` and replace the current blue/green/slate chart palette. Grid lines, tick labels, and legend text SHALL use EVRA muted text colors (`#909090`, `#C8C8C8`).

#### Scenario: Donut chart has no blue segments

- **WHEN** the OutcomeDonut chart renders
- **THEN** no segment color SHALL be `#3b82f6`

#### Scenario: Chart axes use muted EVRA text

- **WHEN** any chart renders axis ticks
- **THEN** tick label color SHALL be `#909090` or softer EVRA foreground token

### Requirement: Auth view matches EVRA theme

`AuthView.tsx` SHALL use the MUI theme for Paper, TextField, and Button styling without local overrides that reintroduce glass or blue accent colors.

#### Scenario: Login form uses EVRA inputs

- **WHEN** the auth login form renders
- **THEN** input fields SHALL have recessed `#141414` backgrounds per the EVRA input style

### Requirement: All views are migrated from legacy color constants

`app/page.tsx`, `CampaignModal.tsx`, `SettingsView.tsx`, `SecurityView.tsx`, `STSDashboard.tsx`, and `ProfileView.tsx` SHALL remove local `C`, `glass`, and hardcoded hex color objects, replacing them with theme palette references or `lib/tokens.ts` imports.

#### Scenario: No legacy blue accent in page.tsx

- **WHEN** the main dashboard page renders
- **THEN** no inline style or constant SHALL reference `#3b82f6` as the primary accent

#### Scenario: No glass blur in page styles

- **WHEN** any view component renders
- **THEN** no `backdropFilter` or `blur(14px)` glass styles SHALL remain

### Requirement: Semantic tone colors map to EVRA

Positive, negative, and neutral tone colors used for KPI deltas, live indicators, and alerts SHALL map to `--evra-positive` (`#37A660`), `--evra-negative` (`#E0524F`), and `--evra-fg-3` (`#909090`) respectively.

#### Scenario: Live indicator uses EVRA positive green

- **WHEN** the TopBar "Live" pulse indicator renders
- **THEN** its color SHALL be `#37A660` (not `#10b981`)
