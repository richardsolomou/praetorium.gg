---
name: Praetorium
description: Warhammer 40,000 army building and game tracking, from setup to final score.
colors:
  field-green: '#9bd0a9'
  field-green-ink: '#0c2014'
  side-a-red: '#f57a7a'
  side-a-ink: '#2b0505'
  side-b-blue: '#5fc8ea'
  side-b-ink: '#021c27'
  danger-ink: '#2a0d0d'
  signal-amber: '#e3ab52'
  map-green: '#7cc48a'
  rust: '#d0625a'
  chart-blue: '#9db6d4'
  admin-violet: '#b9a0df'
  supporter-gold: '#d9b76e'
  measure-terrain: '#c39bff'
  measure-lines: '#f57fd8'
  measure-edges: '#f4e25c'
  measure-published: '#8b97ff'
  measure-mat: '#b4e85a'
  void: '#0f1113'
  masthead: '#0f1113'
  panel: '#141a1e'
  raised: '#1b2328'
  sunken: '#090d0f'
  edge: '#28323a'
  runner: '#3a4650'
  runner-hi: '#55636e'
  bone: '#e7ece9'
  dim: '#a6b0ae'
  faint: '#86918f'
typography:
  display:
    fontFamily: 'Chakra Petch, ui-sans-serif, system-ui, sans-serif'
    fontWeight: 700
    letterSpacing: '-0.01em'
  step-number:
    fontFamily: 'Chakra Petch, ui-sans-serif, system-ui, sans-serif'
    fontWeight: 700
    lineHeight: 1
    letterSpacing: '-0.04em'
  body:
    fontFamily: 'Sofia Sans Semi Condensed Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '18px'
  rubric:
    fontFamily: 'Chakra Petch, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 700
    letterSpacing: '-0.01em'
  label:
    fontFamily: 'Sofia Sans Semi Condensed Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.6875rem'
    fontWeight: 600
    letterSpacing: '0.06em'
  figure:
    fontFamily: 'Martian Mono Variable, ui-monospace, SF Mono, Menlo, monospace'
    letterSpacing: '-0.02em'
    fontFeature: 'tnum'
    fontVariation: 'wdth 75'
rounded:
  sm: '0.3rem'
  md: '0.4rem'
  lg: '0.5rem'
  xl: '0.7rem'
  2xl: '1rem'
  full: '9999px'
spacing:
  page-gutter: '0.75rem'
  page-gutter-wide: '1rem'
  page-max: '64rem'
  rail-width: '12.25rem'
  phone-header: '3rem'
  tab-bar: '4rem'
  gate-x: '1.5rem'
  grid-cell: '8px'
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
  part:
    backgroundColor: '{colors.panel}'
    rounded: '{rounded.xl}'
  part-tag:
    backgroundColor: '{colors.bone}'
    textColor: '{colors.void}'
    rounded: '{rounded.full}'
    height: '1.25rem'
    typography: '{typography.label}'
  chip:
    textColor: '{colors.dim}'
    rounded: '{rounded.md}'
    padding: '1px 0.375rem'
    typography: '{typography.label}'
  chip-playing:
    backgroundColor: '{colors.field-green}'
    textColor: '{colors.field-green-ink}'
  rail-item-current:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.bone}'
    rounded: '{rounded.lg}'
    height: '2.25rem'
  dialog:
    backgroundColor: '{colors.panel}'
    rounded: '{rounded.xl}'
  dialog-footer:
    backgroundColor: '{colors.sunken}'
  tooltip:
    backgroundColor: '{colors.raised}'
    textColor: '{colors.bone}'
    rounded: '{rounded.md}'
---

# Design System: Praetorium

## Overview

**Creative North Star:** "The Sprue"

- A kit frame and its assembly booklet: parts on slate plastic hang off runners by gates, multi-step flows read as numbered assembly steps.
- Dense, read mid-game on a phone in dim light: contrast goes to information, chrome stays quiet. Dark only.
- State reads by line form as well as colour: solid live, doubled current, dashed pending, struck discarded.

**Key Characteristics:**

- Slate ground, chalk ink, one field-green accent.
- Soft-cornered raised parts with a soft drop, never square slate panels or a uniform card grid.
- Runners and gates carry lists, navigation and progress.

## Colors

- Code names: Field Green is `parchment` and `azure` (`primary` and `ring` in generated components), Side A Red also `destructive`, Map Green `achieved`, Signal Amber `discarded`, Chart Blue `info`, Admin Violet `admin`, Supporter Gold `supporter`; Void is the page, Panel `panel`, Runner `runner` (and `edge-strong`).
- One job per colour, always paired with a label or line form: Field Green action, selection, focus, current and success; Side A/B red and blue the two sides (red also danger, destructive actions and input errors); Map Green achieved or best; Amber warnings and discarded; Rust losses; violet and gold role marks; `measure-*` the terrain board's distances, one per thing measured from, in hues the board itself never uses.
- Achievement medals carry their own bronze, silver, gold and platinum metals (`AchievementBadge.tsx`), used nowhere else; a medal not yet earned is the same medal in grey.
- Neutrals: Void page; Masthead the page's opening band; Panel cards, parts, dialogs, menus; Raised tooltips, popovers, tab lists, disabled primary; Sunken dialog action strips and phone bars; Edge hairlines; Runner rails, gates, chip borders and scrollbars, Runner Hi pending gates and hovered scrollbars.

**The One Green Rule.** Field Green marks only what acts or is current: the primary action, selection, focus, the current gate. Never decoration.

**The Labelled Red Rule.** Red is Side A and danger both, so a danger state always carries its words or icon, never colour alone.

## Typography

**Display Font:** Chakra Petch (with ui-sans-serif)
**Body Font:** Sofia Sans Semi Condensed Variable (with ui-sans-serif)
**Label/Mono Font:** Martian Mono Variable at 75% width, for figures

- Display: every h1–h3 uppercase Chakra Petch 700, tracked slightly tight, balanced, like an assembly booklet's step titles. Page titles 1.875rem, 2.25rem from `sm`.
- Rubric: a section heading with its count beside it.
- Step number: big Chakra Petch figure beside the step it opens, Faint until current (Field Green) or done (Dim).
- Label: the small uppercase label of chips, field and group names; `text-3xs` (0.625rem) is the only step below it.
- Figure: scores and totals read across the table; any number that changes during a game uses tabular figures.
- Players may raise the 18px root to 20px or 22px; every rem scales.

## Layout

- Desktop from 860px: a sticky runner rail (12.25rem) on the left, nav items hung on gates inside a rounded 2px Runner frame, the current item gated in Field Green; content in one centred column (64rem max, 0.75rem gutter, 1rem from `sm`).
- Below 860px: a compact 3rem header and a solid 4rem bottom tab bar (Home, Rosters, Battles, Factions, More) whose top edge is the runner, with the open tab marked by a doubled Field Green segment; dialogs go full screen unless they fit their content.
- The native app stands its tabs as a 5rem column from 1024px, dropping the runner and gates.
- Every top-level page opens with a Masthead band on the construction grid (8px cells, 64px majors, fading downward).
- Wide data scrolls sideways in its own region, first column and header sticky.
- Touch fields stay at least 16px, or iOS zooms.

## Elevation & Depth

- Parts lift off the plastic by a soft drop; overlays lift further. Tone steps and 1px hairlines do the rest.

- **Part** (`inset 0 1px 0 rgb(255 255 255 / 0.03), 0 10px 28px -12px rgb(0 0 0 / 0.7)`): every part at rest, and the current rail item and tab.
- **Lifted** (`0 28px 70px -20px rgb(0 0 0 / 0.8), 0 2px 8px rgb(0 0 0 / 0.35)`): dialogs, menus, selects, popovers.
- **Tooltip** (`0 12px 32px rgb(0 0 0 / 0.45)`): tooltips only.

## Shapes

- Moulded, so corners are soft: controls 9px, parts and overlays 12.6px, the rail frame 1rem.
- Round shapes are reserved: part tags, avatars, status dots.
- Full-screen phone dialogs are square.

## Motion

- Motion settles like a part pressed onto its gate: `--ease-settle`, fast in, no overshoot, exits faster than entrances.
- A line that becomes current (a runner gate, a `now` line segment, a tab's underline) draws out from where it joins, 280ms; a setup step's runner draws down, and its tick presses in once settled.
- A discarded mission card's strike inks in.
- A score, command point or roster points figure that changes rises into place, 260ms, keyed on its value.
- Battle events that arrive while the log is open slide in at its top; the ones it opened with stay still.
- A medal, in the message that it was earned, is crossed once by light, clipped to its frame.
- Overlays fade and lift 160ms, dialogs 220ms; a full-screen phone dialog rises from below instead of scaling.
- A new page crossfades 180ms; a filter or search that rewrites the address swaps in place.
- No loops, no load choreography, no bounce. Reduced motion removes all of it.

## Components

- **Buttons:** one Field Green primary per surface; disabled primary drops to Raised and Faint, never faded field green. Focus is a 2px Field Green outline offset 2px.
- **Parts:** the one container every list item, panel and card is: Part fill, Edge hairline, `xl` corners, part shadow.
- **Runners:** a 2px rail a list hangs off, each child joined by a gate nub; the child's gate says its state: `current` doubled in Field Green, `pending` dashed, `cut` shortened with the part faded, `none` detached.
- **Line segments:** rails of phases, rounds and readiness: `done` solid, `now` doubled, `todo` dashed, `off` struck; `--line-colour` tints them for a side.
- **Part tags:** a small bone lozenge for a rank, a round or a table, ghost-ringed when not yet placed. Seats carry no tag; their side's colour says whose they are.
- **Chips:** every datasheet name is followed by its points chip: Runner border, Dim label; a game in play is a filled Field Green chip.
- **Inputs:** Runner border; Field Green ring on focus; errors take a Side A Red border plus a message naming the problem and fix.
- **Dialogs:** a lifted part with a Sunken action strip; may tint its edge for the side it belongs to.
- **Page header:** Masthead band on the construction grid, title and description with actions beside them; a faction page may carry its colour as a 3px top edge.
- **Mission cards:** each scoring window and each action is a part hung off one runner, timing as the heading, VP as a figure with no box; battle and setup reuse the same card.
- **Assembly steps:** multi-step flows number each step with a step number and join steps with runner lines.
- **Matchup table:** best cells get a 2px Achieved Green inset outline.

## Do's and Don'ts

### Do

- **Do** carry state by line form as well as colour.
- **Do** theme scrollbars (Runner), caret and selection (Field Green).

### Don't

- **Don't** add a light theme.
- **Don't** use Field Green beyond action, selection, focus, current and success, or side colours beyond the sides.
- **Don't** put an eyebrow label above a heading; a label names a field or group, or is itself the heading.
- **Don't** mark a part's side or state with a coloured side stripe; use its part tag or gate.
- **Don't** return to square slate panels or a uniform card grid.
