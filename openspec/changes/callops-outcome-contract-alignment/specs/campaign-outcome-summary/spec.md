## ADDED Requirements

### Requirement: Campaign view surfaces callops summary aggregates

The campaign view SHALL read the `summary` block returned by callops `GET /campaigns/{id}` and surface the aggregates the dashboard currently ignores — `connected`, `opt_out`, and `calls_total` — alongside the contact-status counts it already shows. These values MUST be displayed from the callops summary rather than re-derived by summing client-side report rows.

#### Scenario: Connected and opt-out are visible per campaign

- **WHEN** an operator views a campaign that has connected calls and at least one opt-out
- **THEN** the campaign view shows the `connected` count and the `opt_out` count from the callops summary
- **AND** shows `calls_total` as the placed-call total

#### Scenario: Opt-out is never silently dropped

- **WHEN** a campaign summary reports `opt_out` greater than zero
- **THEN** the dashboard surfaces that opt-out count
- **AND** does not omit it from the campaign view

#### Scenario: Aggregates come from callops, not client roll-up

- **WHEN** the campaign view renders connect/opt-out/total figures
- **THEN** the figures are sourced from the callops `GET /campaigns/{id}` summary
- **AND** are not computed by summing per-call rows in the browser
