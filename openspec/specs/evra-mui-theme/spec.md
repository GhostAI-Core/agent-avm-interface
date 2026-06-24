# evra-mui-theme

MUI theme configuration mapping EVRA design tokens to palette, typography, shape, and component overrides.

## Requirements

### Requirement: MUI theme maps EVRA palette

The `buildTheme()` function in `lib/theme.ts` SHALL configure MUI palette values from EVRA tokens: background default `#1F1F1F`, paper `#292929`, primary `#37A660`, success `#37A660`, warning `#C99A2D`, error `#E0524F`, info `#6DC2FF`, text primary `#FFFFFF`, text secondary `#C8C8C8`.

#### Scenario: Primary actions use EVRA green

- **WHEN** a `variant="contained"` `color="primary"` Button renders
- **THEN** its background SHALL be `#37A660`
- **AND** its text color SHALL be `#0E2014`

#### Scenario: Page background is charcoal

- **WHEN** MUI `CssBaseline` applies
- **THEN** the default background color SHALL be `#1F1F1F`

### Requirement: MUI theme uses EVRA typography

The MUI theme SHALL set `typography.fontFamily` to the EVRA body stack, define `fontSize` of `15`, and provide a `typography` variant for display/headings that uses the Michroma CSS variable where appropriate.

#### Scenario: Default typography is 15px body

- **WHEN** `Typography` renders with `variant="body1"`
- **THEN** font size SHALL be `15px` and line height SHALL be `1.5`

### Requirement: MUI theme uses small border radius

The MUI theme `shape.borderRadius` SHALL be `4` (maps to 4px), matching EVRA `--r-sm`.

#### Scenario: Buttons have small radius

- **WHEN** any MUI Button renders
- **THEN** `border-radius` SHALL be `4px`

### Requirement: Paper and Card are flat EVRA surfaces

MUI `MuiPaper` and `MuiCard` style overrides SHALL remove `backdrop-filter`, `box-shadow`, and translucent backgrounds. They SHALL use solid `#292929` background with `1px solid #1A1A1A` border.

#### Scenario: No glassmorphism on cards

- **WHEN** a Paper or Card component renders
- **THEN** `backdrop-filter` SHALL NOT be applied
- **AND** `background` SHALL be an opaque surface color (not `rgba` with alpha < 1)

### Requirement: Form inputs use recessed EVRA surface

MUI `MuiTextField` / `MuiOutlinedInput` overrides SHALL use background `#141414`, border `#3A3A3A`, text `#FFFFFF`, and radius `4px`.

#### Scenario: Text field matches EVRA input style

- **WHEN** a TextField renders
- **THEN** its input background SHALL be `#141414`
- **AND** its border color SHALL be `#3A3A3A`

### Requirement: Navigation components use EVRA surfaces

MUI overrides for `MuiAppBar`, `MuiDrawer`, and `MuiListItemButton` SHALL use EVRA background and border tokens. Selected nav items SHALL use `#383838` hover/selected background with `#37A660` or `#60BC84` accent text (replacing blue `rgba(59,130,246,...)` highlights).

#### Scenario: Sidebar selected item uses green accent

- **WHEN** a navigation item is selected in the Sidebar
- **THEN** its highlight color SHALL use the EVRA green accent family
- **AND** SHALL NOT use `#3b82f6` blue

### Requirement: Secondary buttons use EVRA secondary style

MUI Button `color="inherit"` or secondary variant overrides SHALL use background `#5C5C5C`, white text, and border `#6E6E6E`.

#### Scenario: Secondary button appearance

- **WHEN** a secondary-styled Button renders
- **THEN** its background SHALL be `#5C5C5C`

### Requirement: Focus-visible uses EVRA accent

MUI `MuiButtonBase` focus-visible override SHALL use `#60BC84` outline (EVRA green bright), replacing the current `#3b82f6` blue focus ring.

#### Scenario: Keyboard focus on buttons

- **WHEN** a button receives keyboard focus
- **THEN** the focus outline color SHALL be from the EVRA green palette
