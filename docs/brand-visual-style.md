# EVRA Agent AVM — Brand & Visual Style Guide

**Purpose:** This document describes the look, feel, and visual language of the **Agent AVM Interface** frontend. It is written for creative tools (e.g. NotebookLM video generation) so that generated imagery, motion graphics, and UI mockups match the real product and EVRA brand — not generic corporate SaaS aesthetics.

**Product context:** Agent AVM is a dark-themed operations dashboard for outbound IVR/voice campaigns in South Africa. The audience is call-center engineers and administrators. The UI is branded **EVRA** and should feel like a serious, high-signal control room — not a consumer app, not a fintech startup, not a generic AI product.

---

## 1. Brand personality (read this first)

| Attribute | What it means visually |
|-----------|------------------------|
| **Operational** | Dense information, clear hierarchy, no decorative fluff. Think mission control, not marketing landing page. |
| **Dark & grounded** | Always dark backgrounds. Never white or light-gray page backgrounds. |
| **Green as signal** | EVRA green means *active, live, primary action*. It is not decorative wallpaper. |
| **Flat & precise** | Surfaces are flat panels with hairline borders. No drop shadows, no neumorphism, no frosted glass blur. |
| **Subtle glow only on brand** | Mint-green glow appears on the EVRA logo, chart highlights, and wizard headers — never on random UI chrome. |
| **South African ops** | Professional telecom/call-center tooling. Grounded, technical, trustworthy. |

### What to avoid in generated visuals

Do **not** use these — they will look wrong next to the real product:

- Bright white or pastel backgrounds
- Generic corporate blue (`#0066CC`, Material blue, etc.) as the primary accent
- Purple/violet gradients (common in AI-generated “tech” imagery)
- Rounded bubbly iOS-style cards with heavy drop shadows
- Glassmorphism / frosted blur panels (the codebase has a `GlassCard` component, but it is visually **flat** — no transparency blur)
- Stock photos of smiling headset agents in bright offices
- Cartoon mascots, 3D glossy icons, or playful illustration styles
- Neon cyberpunk / Tron grids (too sci-fi; EVRA is industrial-dark, not futuristic-neon)
- Over-animated swooshes, particle effects, or Ken Burns on unrelated stock imagery

---

## 2. Color palette

All colors below are exact values from the product. Use these hex codes in any generated graphics.

### Brand greens

| Name | Hex | Usage |
|------|-----|-------|
| EVRA Green (primary) | `#37A660` | Primary buttons, live indicators, main accent |
| EVRA Green Bright | `#60BC84` | Hover states, selected nav text, positive chip text |
| EVRA Green Deep | `#1F6F35` | Button borders, depth on primary actions |
| EVRA Green Ink | `#0E2014` | Text on green buttons (dark green-black) |
| EVRA Glow (mint) | `#5BE8BE` | Logo glow, qualified-state highlights, chart glow |

### Backgrounds & surfaces (layered dark grays)

| Name | Hex | Usage |
|------|-----|-------|
| BG-0 (page) | `#1F1F1F` | Main app background |
| BG-1 (surface) | `#292929` | Cards, sidebar, top bar, panels |
| BG-2 (surface deep) | `#141414` | Table headers, input fields, active monitor strip |
| BG-3 (hover) | `#383838` | Hover states, scrollbar thumb |
| BG-4 (secondary) | `#5C5C5C` | Secondary buttons |

Surfaces stack like physical layers: page (`#1F1F1F`) → card (`#292929`) → inset/deep (`#141414`). Each layer is only slightly lighter or darker than the next — not high contrast between adjacent surfaces.

### Text

| Name | Hex | Usage |
|------|-----|-------|
| FG-1 | `#FFFFFF` | Primary text, headings |
| FG-2 | `#C8C8C8` | Secondary / muted text |
| FG-3 | `#909090` | Soft labels, captions |
| FG-4 | `#606060` | Disabled text, nav group labels |

### Borders

| Name | Hex |
|------|-----|
| Border subtle | `#1A1A1A` |
| Border default | `#3A3A3A` |
| Border strong | `#4A4A4A` |

Borders are **1px hairlines**, not thick outlines. They define panel edges quietly.

### Semantic status colors

| Meaning | Hex | Notes |
|---------|-----|-------|
| Positive / success | `#37A660` | Same as brand green |
| Negative / error | `#E0524F` | Muted red, not bright candy red |
| Warning | `#C99A2D` | Warm amber/gold |
| Info | `#6DC2FF` | Cool blue — used sparingly for info states (voicemail, callback, auto-paused) |

Status chips use **translucent tinted backgrounds** (roughly 18% opacity of the semantic color) with brighter text on top — not solid saturated pills.

### Voice agent persona colors

Three AI voice agents appear in the UI as colored dots and chips:

| Agent | Color | Hex |
|-------|-------|-----|
| Seeker | Brand green | `#37A660` |
| Grace | Bright green / mint | `#60BC84` |
| Sangoma | Warning gold | `#C99A2D` |

---

## 3. Typography

### Display / wordmark — Michroma

- **Font:** Michroma (Google Font), with fallbacks Eurostile, Bahnschrift
- **Usage:** EVRA wordmark only — logo subtitles like `AGENT AVM | SOUTH AFRICA`, `SECURE IDENTITY PORTAL`
- **Style:** UPPERCASE, wide letter-spacing (`0.02em`–`0.1em`), white text
- **Effect:** Subtle mint text-shadow glow:
  - `0 0 10px rgba(91, 232, 190, 0.55)`
  - `0 0 28px rgba(91, 232, 190, 0.22)`

Michroma is geometric and slightly sci-fi — use it **only** for brand labels, never for body paragraphs or table data.

### Body — system sans-serif

- **Stack:** SF Pro, DM Sans, Segoe UI, system-ui, sans-serif
- **Base size:** 15px, line-height 1.5
- **Weights:** 500 for nav items, 600 for buttons and section titles, 700 for table headers and chip labels

### Monospace — numbers & metrics

- **Stack:** SF Mono, JetBrains Mono, Menlo, monospace
- **Usage:** Tabular numeric data (call counts, costs, durations, percentages)
- **Class in app:** `.mono` with `font-variant-numeric: tabular-nums`

### Type scale (for titles in video overlays)

| Token | Size | Use |
|-------|------|-----|
| Caption | 11px | Chip labels, axis ticks, nav group headers |
| Small | 13px | Secondary body, table cells |
| Medium | 15px | Default body |
| Large | 18px | Section headings (h6) |
| XL | 22px | Dialog titles |
| 2XL | 28px | Dashboard hero metrics |
| 3XL+ | 40–120px | Large KPI numbers only |

Headings are **snug** (line-height 1.05–1.2). Body text is **relaxed** (1.5).

---

## 4. Layout & spatial design

### Overall shell

```
┌──────────────┬─────────────────────────────────────────┐
│              │  Top Bar (sticky)                        │
│   Sidebar    │  — page title, Live dot, logout         │
│   260px      ├─────────────────────────────────────────┤
│              │  Active Monitor strip (when campaigns   │
│   EVRA logo  │  are running)                           │
│   Nav groups ├─────────────────────────────────────────┤
│              │                                          │
│              │  Main content area                       │
│              │  (cards, tables, charts)                 │
│              │                                          │
└──────────────┴─────────────────────────────────────────┘
```

- **Sidebar:** Fixed 260px, dark surface `#292929`, EVRA logo centered at top with mint drop-shadow
- **Top bar:** Same surface color, hairline bottom border, no elevation shadow
- **Content:** Padding with breathable but not wasteful whitespace; grids of flat cards
- **Mobile:** Sidebar becomes drawer; bottom-right FAB for radial quick-nav (green circle, dark satellite buttons)

### Corner radius

The UI uses **tight** radii — not pill-shaped cards:

| Token | Value |
|-------|-------|
| XS | 2px |
| SM (default) | 4px |
| MD | 6px |
| LG | 10px |
| Pill | 999px (chips, live dot, FAB only) |

Default cards and buttons: **4px** radius.

### Spacing rhythm

Based on a 4px grid: 4, 8, 12, 16, 20, 24, 32, 40, 56, 80px. Card internal padding is typically 16–24px.

### Elevation & depth

**There is no Material Design elevation.** Cards, dialogs, and papers have:

- `background: #292929`
- `border: 1px solid #1A1A1A`
- `box-shadow: none`

The only depth cues are:

1. Layered background shades (page vs card vs inset)
2. Hairline borders
3. Chart panels use a subtle inset highlight: `inset 0 1px 0 rgba(255,255,255,0.03)` plus soft outer shadow `0 8px 20px rgba(0,0,0,0.18)` — this is the **only** place shadows appear

---

## 5. Component visual language

### Buttons

| Variant | Look |
|---------|------|
| **Primary** | Fill `#37A660`, text `#0E2014`, border `#1F6F35`, weight 600, no uppercase |
| **Secondary** | Fill `#5C5C5C`, white text, border `#6E6E6E` |
| **Outlined** | Transparent, border `#3A3A3A`, hover adds faint green tint `rgba(55,166,96,0.08)` |

No pill-shaped buttons. No gradient fills on buttons.

### Inputs & forms

- Background: `#141414` (deep surface)
- Border: `#3A3A3A`, focused border: `#37A660`
- Radius: 4px
- Labels: MUI standard, muted secondary color

### Navigation

- **Group labels:** 11px, bold, uppercase, letter-spaced, color `#606060`
- **Items:** 15px, weight 500
- **Selected item:** Background `rgba(55,166,96,0.12)`, text `#60BC84`
- **Hover:** Background `#383838`

### Tables

- Header row: `#141414` background, 11px uppercase bold muted text
- Body rows: `#292929` with `#1A1A1A` row dividers
- Numeric columns: monospace, right-aligned

### Status chips

Small (22px tall), uppercase, bold, 11px:

- Translucent tinted background (~18% opacity)
- Brighter text color
- 1px border at ~38% opacity of the base color
- 4px border radius (not fully round)

Examples:
- **Running:** green tint, text `#60BC84`
- **Paused:** amber tint, text `#E0C078`
- **Failed / Hangup:** red tint, text `#F08A88`
- **Voicemail / Callback:** blue tint, text `#9DD4FF`

### Cards (insight widgets, dashboard panels)

- Flat `#292929` panel, 1px `#1A1A1A` border, 4px radius
- Title: 11px uppercase bold, letter-spaced, muted color
- Drag handle icon on the left (subtle, disabled color)
- Pin / close icon buttons on the right

### Dialogs & wizards

Modal headers use a **diagonal green wash** — the one approved gradient in the system:

```
linear-gradient(135deg, rgba(55,166,96,0.16) 0%, rgba(55,166,96,0.03) 48%, transparent 100%)
```

Below the header, a 1px accent line fades from green to dark border:

```
linear-gradient(90deg, #37A660 0%, rgba(55,166,96,0.15) 40%, #1A1A1A 100%)
```

Wizard step icons sit in a 42×42px square with green tint background and subtle mint glow shadow.

### Login screen

- Full-viewport dark background `#1F1F1F`
- Faint radial green bloom top-right: `rgba(55,166,96,0.12)` fading to transparent over ~500px
- Centered EVRA logo (`evra_trans.png`) with mint drop-shadow glow
- Michroma subtitle: `SECURE IDENTITY PORTAL`
- Login card: flat paper surface, no shadow

---

## 6. Charts & data visualization

Charts live on slightly darker plot backgrounds than cards:

| Element | Color |
|---------|-------|
| Chart panel BG | `#252525` |
| Plot area BG | `#202020` |
| Grid lines | `rgba(255,255,255,0.06)` — very faint |
| Axis ticks | `#A8A8A8`, 10px |
| Legend text | `#EDEDED`, 10px |

### Data series colors (use exactly)

| Metric | Hex |
|--------|-----|
| Connected / Dialed | `#47D16A` |
| Qualified | `#5BE8BE` |
| Voicemail | `#E0B13F` |
| No Speech | `#A3A3A3` |
| Hangup | `#F25F5C` |
| NI (Not Interested) | `#72D6A5` |
| DNQ | `#67B7FF` |
| Callback | `#2FAE5F` |
| Failed / NA+Busy | `#3F3F3F`–`#4A4A4A` |
| Spend | `#C85A5A` |
| CPL | `#4FD17B` |

Bar charts use **vertical green gradients** on positive bars (e.g. connected: `#59E07B` → `#2FAE5F`) with a soft colored glow shadow beneath bars. Donut charts use flat segment fills with slightly brightened stroke edges — no 3D pie charts.

---

## 7. Motion & animation

The product animation language is **minimal and functional**. Match this in video transitions:

| Animation | Behavior | Use in video |
|-----------|----------|--------------|
| **Live pulse** | Green dot opacity oscillates 1 → 0.25 → 1 over 1.4s | For "live monitoring" scenes |
| **Drag feedback** | Card opacity drops to 35%, mint dashed outline `rgba(91,232,190,0.8)` | When showing dashboard customization |
| **FAB expand** | Circular nav items fan out with slight bounce easing `cubic-bezier(.34,1.56,.64,1)`, staggered 30ms | Mobile navigation only |
| **Spinner** | Simple CSS rotate | Loading states |
| **Focus ring** | 2px `#60BC84` outline, 2px offset | Accessibility — rarely needed in video |

**Do not** use: bouncy logo intros, particle explosions, morphing gradients, parallax stock footage, or fast whip-pan transitions. Prefer clean cuts, subtle fades (200–300ms), and slow pans across UI mockups.

---

## 8. Logo & imagery

### EVRA logo

- Asset: transparent PNG wordmark (`evra_trans.png`)
- Always on **dark** backgrounds
- Apply mint glow via drop-shadow: `drop-shadow(0 0 12px rgba(91, 232, 190, 0.45))` to `drop-shadow(0 0 20px rgba(91, 232, 190, 0.53))`
- Sidebar size: ~96px tall; login screen: 80–110px tall
- Never place the logo on white, never distort aspect ratio, never add extra effects beyond the approved glow

### Screenshots & UI mockups for video

When showing the product:

1. Use **dark frames** — the UI itself provides the color; don't add bright borders around screenshots
2. Show real UI patterns: sidebar + top bar + card grid, or data tables with status chips
3. Include recognizable elements: "Live" green dot, "Control Room" title, campaign status chips, donut/bar charts on dark plot backgrounds
4. Crop tightly on relevant panels — this is a dense ops tool, not a hero landing page

### B-roll & illustrative imagery (if needed)

If the video needs non-UI visuals:

- **Do:** Dark server/operations room ambiance, abstract network topology on dark bg, waveform/audio visualizations in green-on-black, South African telecom context (subtle, professional)
- **Don't:** Bright call centers, generic "AI brain" imagery, robots, holograms, people in suits pointing at screens

---

## 9. Mood board summary (one paragraph for AI prompts)

> Dark operational dashboard on charcoal gray (`#1F1F1F`). Flat rectangular panels with hairline borders, no drop shadows. EVRA brand green (`#37A660`) for primary actions and live status. Mint glow accent (`#5BE8BE`) on logo and chart highlights only. Michroma uppercase wordmark with subtle green text-shadow. System sans-serif body text in white and muted gray. Tight 4px corner radius. Dense data tables, status chips with translucent tinted backgrounds, bar and donut charts on near-black plot areas with faint grid lines. Professional South African call-center engineering tool — mission control, not consumer app. No blue-purple gradients, no white backgrounds, no glassmorphism, no 3D icons.

---

## 10. Scene-by-scene visual cues (for video storyboards)

Use these when generating or selecting visuals per topic:

| Topic | Visual treatment |
|-------|------------------|
| **Product intro** | EVRA logo centered on `#1F1F1F` with mint glow; Michroma subtitle; faint green radial bloom |
| **Login / security** | Centered card on dark bg; "SECURE IDENTITY PORTAL" in Michroma; green primary button |
| **Control Room** | Wide shot of card grid dashboard; uppercase widget titles; green "Live" dot in top bar |
| **Campaign management** | Table with status chips (Running=green, Paused=amber); action buttons green/gray |
| **Live monitoring** | Top bar "Active Monitor" strip on `#141414`; pulsing green dot; agent color legend |
| **Reports & charts** | Donut chart on `#202020` plot; segment colors from chart palette; monospace KPI numbers |
| **Call quality** | Funnel bar chart with green gradient bars and soft glow |
| **Voice agents** | Three colored dots: Seeker green, Grace mint, Sangoma gold |
| **New campaign wizard** | Dialog with green gradient header band; step rail; flat form fields |
| **Mobile** | Dark UI with green FAB bottom-right; radial nav fan-out |

---

## 11. Quick reference — copy-paste palette

```
Background:     #1F1F1F
Surface:        #292929
Surface deep:   #141414
Border:         #1A1A1A / #3A3A3A
Text primary:   #FFFFFF
Text muted:     #C8C8C8
Brand green:    #37A660
Green bright:   #60BC84
Green deep:     #1F6F35
Mint glow:      #5BE8BE
Error:          #E0524F
Warning:        #C99A2D
Info:           #6DC2FF
Chart plot:     #202020
Radius default: 4px
Display font:   Michroma
Body font:      SF Pro / DM Sans / system-ui
```

---

*Source of truth in codebase: `lib/tokens.ts`, `lib/theme.ts`, `lib/chartTheme.ts`, `app/globals.css`.*
