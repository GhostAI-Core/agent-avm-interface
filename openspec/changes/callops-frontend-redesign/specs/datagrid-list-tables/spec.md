## ADDED Requirements

### Requirement: Shared DataGrid list table

The dashboard SHALL provide a single reusable list-table component (`components/ui/DataTable.tsx`) built on MUI X DataGrid, used by every list view, exposing a toolbar with Columns, Filters, and CSV Export controls plus a quick-filter Search, checkbox row selection, pagination, and optional per-row Actions, themed to the dark-glass design tokens.

#### Scenario: Toolbar controls present
- **WHEN** a list table renders
- **THEN** the toolbar shows Columns, Filters, and Export controls and a Search quick-filter input

#### Scenario: Pagination defaults
- **WHEN** a list table renders more rows than one page
- **THEN** rows are paginated with a default page size of 10 and a page-size selector

#### Scenario: Row click vs selection vs action
- **WHEN** the user clicks a row's selection checkbox or an Actions-column button
- **THEN** the row's navigation `onRowClick` does NOT fire; clicking elsewhere on the row DOES fire it

### Requirement: Table is the default list view

List views that offer a cards/table toggle (Companies, Campaigns) SHALL default to the table view on first load, while still honoring a user's previously persisted view preference.

#### Scenario: First-load default
- **WHEN** a user with no saved view preference opens Companies or Campaigns
- **THEN** the table view is shown

#### Scenario: Saved preference respected
- **WHEN** a user has previously selected the cards view
- **THEN** that preference is restored on next load

### Requirement: List views adopt the shared table

The Companies, Campaigns, Campaign Report, Call Quality, and Telephony SIP Providers and Outbound Trunks views SHALL render their tabular data through the shared DataTable, preserving each view's existing columns, row-click destinations, value formatting, and (for Campaigns) the play/pause/stop/edit/reuse/archive row actions.

#### Scenario: Campaign actions preserved
- **WHEN** the Campaigns table renders
- **THEN** each row exposes the existing play/pause, stop, edit, reuse, and archive actions wired to their handlers

#### Scenario: Report drill-down preserved
- **WHEN** the user clicks a Campaign Report row
- **THEN** the existing detailed campaign report view opens for that campaign
