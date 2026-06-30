# responsive-ui

## ADDED Requirements

### Requirement: Mobile navigation is reachable on-screen
On viewports below `sm`, the user MUST be able to reach every primary view using on-screen controls
without horizontal page scrolling. The hamburger drawer is the primary mobile nav; any radial/FAB
shortcut MUST render fully within the viewport.

#### Scenario: Radial/FAB opens within the viewport
- **WHEN** a user opens the floating nav on a 360px-wide screen
- **THEN** every nav item is fully visible on-screen (no item clipped or off the right/bottom edge)
- **AND** tapping the backdrop or pressing Escape closes it

#### Scenario: Drawer covers all views
- **WHEN** a user opens the hamburger drawer on mobile
- **THEN** every sidebar view (incl. Contacts) is listed and navigable

### Requirement: Data tables are readable on phones
Below `sm`, tabular data MUST be readable without pinch-zoom or precise horizontal swiping. A table
MUST present each row as a stacked, labeled card OR provide momentum horizontal scrolling; it MUST
NOT force the page itself to scroll horizontally.

#### Scenario: Table renders as stacked cards on mobile
- **WHEN** a `DataTable` is shown below `sm`
- **THEN** each row renders as a full-width card of `label: value` pairs (from the same columns)
- **AND** the row's tap action still fires, and any Actions render as a button row

#### Scenario: No horizontal page overflow
- **WHEN** any view is shown at 360–414px
- **THEN** the page body does not scroll horizontally (only opted-in inner scroll containers do)

### Requirement: Dialogs fit the screen on mobile
Every modal/dialog MUST be `fullScreen` below `sm` so its content and actions are fully reachable.

#### Scenario: Wizard fits a phone
- **WHEN** the New Campaign wizard (or any dialog) opens below `sm`
- **THEN** it fills the screen, its content scrolls within the sheet, and its action buttons are reachable

### Requirement: Touch targets and spacing
Interactive controls MUST be at least 44×44px on touch viewports, and content padding MUST adapt so
controls are not crowded or clipped on small screens.

#### Scenario: Tap targets are adequate
- **WHEN** a user interacts with buttons, nav items, or row actions on mobile
- **THEN** each tap target is ≥44×44px and does not overlap adjacent targets
