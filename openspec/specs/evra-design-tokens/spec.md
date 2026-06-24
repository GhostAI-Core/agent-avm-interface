# evra-design-tokens

EVRA design token layer: CSS custom properties in `app/globals.css` and TypeScript exports in `lib/tokens.ts`.

## Requirements

### Requirement: EVRA color tokens are defined as CSS custom properties

The application SHALL define the full EVRA color palette as `:root` CSS custom properties in `app/globals.css`, including brand greens (`--evra-green`, `--evra-green-bright`, `--evra-green-deep`, `--evra-green-ink`, `--evra-glow`), background surfaces (`--evra-bg-0` through `--evra-bg-4`), text levels (`--evra-fg-1` through `--evra-fg-4`), borders (`--evra-border-1` through `--evra-border-3`), and semantic colors (`--evra-positive`, `--evra-negative`, `--evra-warning`, `--evra-info`).

#### Scenario: Page canvas uses EVRA background

- **WHEN** the application renders any page
- **THEN** the `body` background color SHALL be `#1F1F1F` (`--evra-bg-0` / `--bg`)

#### Scenario: Semantic colors match EVRA spec

- **WHEN** a developer inspects `:root` CSS variables
- **THEN** `--evra-positive` SHALL equal `#37A660`, `--evra-negative` SHALL equal `#E0524F`, `--evra-warning` SHALL equal `#C99A2D`, and `--evra-info` SHALL equal `#6DC2FF`

### Requirement: EVRA typography tokens are defined

The application SHALL define font family CSS custom properties for display (`--font-display`), body (`--font-body`), and monospace (`--font-mono`) matching the EVRA spec stacks. The application SHALL define a type scale (`--t-xs` through `--t-6xl`) and line-height tokens (`--lh-tight`, `--lh-snug`, `--lh-body`).

#### Scenario: Body text uses system font stack

- **WHEN** default body text renders
- **THEN** `font-family` SHALL resolve to the `--font-body` stack starting with `-apple-system` / `BlinkMacSystemFont`
- **AND** `font-size` SHALL be `15px` with `line-height` of `1.5`

#### Scenario: Display font is available for wordmark

- **WHEN** Michroma is loaded via `next/font/google`
- **THEN** `--font-display` SHALL include `'Michroma'` as the first font family

### Requirement: EVRA shape and spacing tokens are defined

The application SHALL define radius tokens (`--r-xs` through `--r-pill`) and spacing tokens (`--s-1` through `--s-10`) as CSS custom properties, plus convenience aliases (`--radius-sm`, `--radius-md`, `--radius-lg`).

#### Scenario: Default card radius is small

- **WHEN** a `.card` or themed MUI Paper/Card renders
- **THEN** `border-radius` SHALL be `4px` (`--radius-sm` / `--r-sm`)

### Requirement: TypeScript token exports mirror CSS values

The application SHALL export a `lib/tokens.ts` module containing the EVRA color, typography, radius, and semantic values as typed constants for use in JavaScript/TypeScript (MUI theme, Chart.js, inline styles).

#### Scenario: Chart code imports token colors

- **WHEN** `Charts.tsx` needs a segment color
- **THEN** it SHALL import from `lib/tokens.ts` rather than hardcoding hex values

### Requirement: Global base styles follow EVRA starter CSS

The application SHALL apply EVRA base styles: antialiased text rendering, dark canvas background, white default text, and utility classes `.mono` (tabular-nums monospace) and `.logo-wordmark` (Michroma uppercase with mint glow).

#### Scenario: Monospace tabular numerals

- **WHEN** an element has the `.mono` class
- **THEN** `font-family` SHALL be the mono stack
- **AND** `font-variant-numeric` SHALL be `tabular-nums`

#### Scenario: Focus ring uses EVRA accent

- **WHEN** a focusable element receives keyboard focus (`:focus-visible`)
- **THEN** the outline color SHALL use the EVRA green accent family (not `#3b82f6`)

#### Scenario: Scrollbars match dark theme

- **WHEN** a scrollable area renders in WebKit browsers
- **THEN** scrollbar thumb color SHALL use a subtle light overlay on dark background consistent with `--evra-bg-3`
