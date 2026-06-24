## ADDED Requirements

### Requirement: Centralised chart colour tokens

The system SHALL expose a centralised chart colour module (`lib/chartTheme.ts`) containing data colours, UI colours, glow colours, and per-chart colour mappings. Chart components MUST NOT hardcode hex or rgba colour values for data series.

#### Scenario: Chart component imports palette

- **WHEN** a dashboard chart component needs a series colour
- **THEN** it imports the colour from `lib/chartTheme.ts` rather than inline literals

### Requirement: Chart UI styling consistency

All dashboard charts SHALL use grid colour `rgba(255,255,255,0.06)`, axis label colour `#A8A8A8`, chart text colour `#EDEDED`, and muted label colour `#7E7E7E`. Gridlines MUST NOT use pure white.

#### Scenario: Axis and grid rendering

- **WHEN** any dashboard chart renders
- **THEN** gridlines use the standardised low-opacity white and axis ticks use `#A8A8A8`

### Requirement: Outcome Donut colour mapping

The Call Outcome Breakdown donut chart SHALL use the following segment colours: Connected `#47D16A`, Voicemail `#E0B13F`, No Speech `#A3A3A3`, Hangup `#F25F5C`, NI `#72D6A5`, DNQ `#67B7FF`, Callback `#2FAE5F`, NA+Busy+Failed `#3F3F3F`. Segments MUST have a subtle brighter stroke border. The legend MUST NOT have glow effects.

#### Scenario: Donut segment colours

- **WHEN** the Outcome Donut chart renders with outcome data
- **THEN** each segment uses the specified mapping colour with a subtle segment border

### Requirement: Campaign Comparison distinct series colours

The Campaign Comparison chart SHALL render Connected as `#47D16A` (green) and Qualified as `#5BE8BE` (mint/aqua). The two series MUST be visually distinct. Bar fills MAY use vertical gradients: Connected top `#59E07B` bottom `#2FAE5F`, Qualified top `#78F2CB` bottom `#41C9A0`. A soft bar glow MAY be applied to data elements only.

#### Scenario: Connected vs Qualified distinction

- **WHEN** the Campaign Comparison chart displays Connected and Qualified bars
- **THEN** Connected appears green and Qualified appears mint/aqua, clearly distinguishable

### Requirement: Spend and CPL colour mapping

The Spend & CPL chart SHALL use Spent `#C85A5A` and CPL `#4FD17B`. The left Y-axis (Spend) label colour MUST align with muted red; the right Y-axis (CPL) label colour MUST align with green.

#### Scenario: Dual-axis colour alignment

- **WHEN** the Spend & CPL chart renders with dual axes
- **THEN** Spend series and left axis use warm red tones and CPL series and right axis use green tones

### Requirement: Dialling Funnel stage colours

The Dialling Funnel chart SHALL use: Dialed `#47D16A`, Connected `#E0B13F`, Voicemail `#A3A3A3`, No Speech `#F25F5C`, Hangup `#72D6A5`, Qualified `#5BE8BE`. Dialed MUST remain visually dominant. Subtle glow MAY apply only to positive stages (Dialed, Qualified).

#### Scenario: Funnel stage rendering

- **WHEN** the Dialling Funnel chart renders funnel stages
- **THEN** each bar uses the specified stage colour with Dialed visually dominant

### Requirement: Subtle glow on data elements only

Glow effects SHALL use opacity between 0.15 and 0.22. Glow MUST be applied to chart data elements only, not gridlines, legends, axis labels, or card containers.

#### Scenario: Glow restraint

- **WHEN** glow is applied to a chart data element
- **THEN** the glow opacity is between 0.15 and 0.22 and legend/grid/axis elements have no glow

### Requirement: No data logic changes

Chart styling changes MUST NOT alter data calculations, API contracts, chart labels, or data mappings.

#### Scenario: Data integrity preserved

- **WHEN** chart colours are updated
- **THEN** chart data values, labels, and calculations remain identical to before the change
