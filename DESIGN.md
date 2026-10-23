---
name: Praetorium
description: Warhammer 40,000 army building and game tracking, from setup to final score.
colors:
  field-green: '#9bd0a9'
  field-green-ink: '#0c2014'
  side-a-red: '#f57a7a'
  side-b-blue: '#5fc8ea'
  map-green: '#7cc48a'
  signal-amber: '#e3ab52'
  rust: '#d0625a'
  chart-blue: '#9db6d4'
  admin-violet: '#b9a0df'
  supporter-gold: '#d9b76e'
  void: '#0e1316'
  panel: '#141a1e'
  raised: '#1b2328'
  sunken: '#090d0f'
  edge: '#28323a'
  edge-strong: '#3a4650'
  bone: '#e7ece9'
  dim: '#a6b0ae'
  faint: '#86918f'
typography:
  display:
    fontFamily: 'Chakra Petch, ui-sans-serif, system-ui, sans-serif'
    fontWeight: 700
    letterSpacing: '-0.01em'
  body:
    fontFamily: 'Sofia Sans Semi Condensed Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '18px'
  label:
    fontFamily: 'Sofia Sans Semi Condensed Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.6875rem'
    fontWeight: 600
    letterSpacing: '0.14em'
  figure:
    fontFamily: 'Martian Mono Variable, ui-monospace, SF Mono, Menlo, monospace'
    letterSpacing: '-0.02em'
    fontFeature: 'tnum'
rounded:
  sm: '0.15rem'
  md: '0.2rem'
  lg: '0.25rem'
  none: '0'
spacing:
  page-gutter: '0.75rem'
  page-gutter-wide: '1rem'
  page-max: '64rem'
components:
  button-primary:
    backgroundColor: '{colors.field-green}'
    textColor: '{colors.field-green-ink}'
    rounded: '{rounded.lg}'
    height: '2rem'
  button-primary-disabled:
    backgroundColor: '{colors.raised}'
    textColor: '{colors.faint}'
  button-outline:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.bone}'
    rounded: '{rounded.lg}'
  chip:
    textColor: '{colors.dim}'
    rounded: '{rounded.sm}'
    padding: '1px 0.375rem'
    typography: '{typography.label}'
  chip-playing:
    backgroundColor: '{colors.field-green}'
    textColor: '{colors.field-green-ink}'
  panel:
    backgroundColor: '{colors.panel}'
    rounded: '{rounded.none}'
  dialog:
    backgroundColor: '{colors.panel}'
    rounded: '{rounded.none}'
  dialog-footer:
    backgroundColor: '{colors.sunken}'
  tooltip:
    backgroundColor: '{colors.raised}'
    textColor: '{colors.bone}'
    rounded: '{rounded.none}'
---

# Design System: Praetorium

## Overview

**Creative North Star: "The Plotting Table"** — Praetorium looks like a slate map under acetate, marked in grease pencil.

Surfaces are dark slate in a few close tones, text is chalk, and the only saturated marks are the ones a player needs to act on: field green for the action and the selection, red and blue for whose number is whose. Headings are uppercase and squared like stencilled map labels, so a screen is recognisable from across a table.

It is dense on purpose. Rosters, datasheets and score lines are long, and the people reading them are often mid-game on a phone in a dim room, so the system spends its contrast on information and keeps chrome quiet. Dark is not a theme choice here; it is the table the product is used at.

**Key Characteristics:**

- Dark slate surfaces separated by tone and 1px hairlines, never by shadow.
- Uppercase stencilled headings, condensed body text, monospaced figures for scores.
- Green means act or selected; red and blue mean a side; amber means attention.
- Near-square shapes: 3–4px on controls, square panels and overlays.
- Controls are solid, touchable targets sized for use at the table.

## Colors

A slate-and-chalk neutral ramp carrying a small set of meaning-bearing marks, each with one job.

### Primary

- **Field Green** (`parchment` and `azure` in code, `primary` in the generated components): the primary action, the current selection, focus rings, the text caret and selection highlight. On green, text uses **Field Green Ink**.

### Secondary

- **Side A Red** and **Side B Blue**: the two players' sides, following the overlay convention of hostile red against friendly blue, which stays distinguishable with red-green colour blindness. Every number on screen belongs to one side or the other, and at arm's length the tint says whose it is before the name is read.

### Tertiary

- **Map Green** (`achieved` in code): achieved, won and success states, including the best result in a comparison.
- **Signal Amber** (`discarded` in code): attention, discarded or unavailable states, and warnings that are not errors.
- **Rust**: losses in records and results (wins read in Map Green), and a liked photo's heart.
- **Chart Blue** (`info` in code): navigation and informational accents such as rubric links and phase icons.
- **Admin Violet** and **Supporter Gold**: role marks for administrators and supporters only.

### Neutral

- **Void**: the page behind everything.
- **Panel**: cards, dialogs and menus. An overlay is a panel lifted off the page, not a lighter surface.
- **Raised**: a step up for tab lists, tooltips and disabled primary actions.
- **Sunken**: footers, table headers and the strip a dialog's actions stand on.
- **Edge** and **Edge Strong**: hairline borders and scrollbar thumbs.
- **Bone**: primary text. **Dim**: secondary text and labels. **Faint**: tertiary text and disabled content.

### Named Rules

**The One Job Rule.** Each saturated colour carries one meaning. Green never marks a side, red never decorates, and a colour is always paired with a short label so meaning never rests on hue alone.

**The Disabled Is Slate Rule.** A disabled primary action drops its green for Raised and Faint; faded green on slate reads as a smudge, not as unavailable.

## Typography

**Display Font:** Chakra Petch 600/700 (with the system sans fallback)
**Body Font:** Sofia Sans Semi Condensed Variable (with the system sans fallback)
**Figure Font:** Martian Mono Variable, narrowed, for scores and totals

**Character:** Chakra Petch is squared with cut corners like stencilled map labels and gives every heading its identity; Sofia Sans Semi Condensed keeps long rosters and rules readable at density; Martian Mono sets the figures a player reads across the table.

### Hierarchy

- **Display / headings** (Chakra Petch 700, uppercase, -0.01em, balanced): every h1–h3, page titles and section headings.
- **Body** (Sofia Sans Semi Condensed, 18px root): all running text, rules text and controls. Players can choose a larger reading size (20px or 22px), and every rem scales with it.
- **Rubric** (0.9375rem bold, 0.06em tracking, uppercase, Dim): a section heading with a count beside it, as every list carries.
- **Eyebrow / label** (0.6875rem semibold, 0.14em tracking, uppercase, Dim): small tracked labels and chips; `text-3xs` (0.625rem) is the only smaller step.
- **Figure** (Martian Mono, 75% width, -0.02em, tabular): scores and totals read from across the table.

### Named Rules

**The Steady Number Rule.** Any number that changes during a game uses tabular figures, so it never jitters as it updates.

**The Two Small Sizes Rule.** Every label below `text-xs` is one of the two named steps with its named tracking; a new small label has nothing to invent.

## Layout

Content sits in a single centred column (max 64rem) with 0.75rem gutters, widening to 1rem from the small breakpoint. Page openings carry a faint map grid that fades out before the content. Below about 860px the app turns into its phone form: a fixed bottom tab bar, a compact header, and dialogs that become full screens unless they are short enough to fit their content. Builder screens are immersive and use the full viewport.

Wide data (unit matchups, setup rails) scrolls sideways inside its own region rather than squeezing; sticky first columns and header rows keep the reader oriented. Touch fields never drop below 16px so iOS does not zoom.

## Elevation & Depth

The system is flat. Depth comes from tone (Void → Panel → Raised, with Sunken for footers and headers) and 1px Edge hairlines. The only shadow is the floating tooltip (`0 12px 32px rgb(0 0 0 / 0.45)`), which genuinely floats above content.

### Named Rules

**The Tonal Depth Rule.** Separate surfaces with a tone step or a hairline, never with a shadow. Overlays are square panels with one hairline edge, not soft-shadowed cards.

## Shapes

Almost nothing is rounded: buttons and tab lists take about 4px, chips about 3px, and panels, dialogs, menus, popovers, tooltips and skeletons are square. Avatars are the one round shape. Borders are 1px; emphasis comes from tone or an inset outline, not from thick borders.

## Components

Controls are tactile and confident: solid, touchable targets sized for use at the table, with uppercase tracked labels where they name a category.

### Buttons

- **Shape:** near-square (about 4px).
- **Primary:** Field Green with Field Green Ink text; used for the one main action on a surface.
- **Hover / Focus:** primary softens slightly on hover; focus shows a 2px Field Green outline offset 2px; pressing nudges the button down by a pixel.
- **Outline / Ghost:** Panel or transparent with Bone text for secondary actions and icon buttons.
- **Disabled:** primary drops to Raised with Faint text and an Edge Strong border.

### Chips

- **Style:** the bordered points chip that follows every datasheet name: Edge Strong border, Dim uppercase tracked label, tabular figures.
- **State:** a playing battle fills the chip with Field Green.

### Cards / Containers

- **Corner Style:** square.
- **Background:** Panel on Void, with Sunken headers and footers.
- **Border:** 1px Edge.
- **Internal Padding:** 0.75rem on phones, 1rem from the small breakpoint.

### Inputs / Fields

- **Style:** dark field with an Edge Strong border and Bone text.
- **Focus:** Field Green ring.
- **Error:** Side A Red border and a short message naming the problem and the fix.

### Navigation

- **Desktop:** a header of uppercase tracked links with icons, the current section in Field Green, and a second row for the reference sections.
- **Phone:** a fixed bottom tab bar of at most five tabs, with everything else under More.

### Tabs

- **Style:** a Raised track with a hairline edge; the active tab lifts to Panel with Field Green text. Used for mode and phase switches such as Units / Rosters and Shooting / Melee.

### Matchup table (signature)

Attackers in rows, targets in columns, sticky row and column headers. Cells shade brighter with the result's share of the largest one, the best matchups carry a 2px Map Green inset outline, and units from different players are grouped under their name.

## Do's and Don'ts

### Do

- **Do** keep headings uppercase Chakra Petch with balanced wrapping.
- **Do** pair every colour with a short label, and keep side colours for sides only.
- **Do** set changing numbers with tabular figures and scores with the Figure style.
- **Do** separate surfaces with tone and 1px hairlines.
- **Do** theme browser surfaces: thin Edge Strong scrollbars, a Field Green caret and selection.
- **Do** size anything used during a game for a thumb and a glance.

### Don't

- **Don't** add a light theme; the interface is dark only.
- **Don't** use shadows for depth, except on floating tooltips.
- **Don't** round panels, dialogs, menus or popovers.
- **Don't** use green for anything but action, selection and success, or red and blue for anything but sides and danger.
- **Don't** let a disabled primary action keep a faded green.
