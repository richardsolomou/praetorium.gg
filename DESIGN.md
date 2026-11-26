---
name: Praetorium
description: Warhammer 40,000 army building and game tracking, from setup to final score.
colors:
  field-green: '#9bd0a9'
  field-green-ink: '#0c2014'
  side-a-red: '#f57a7a'
  side-a-ink: '#0f1113'
  side-b-blue: '#5fc8ea'
  side-b-ink: '#0f1113'
  signal-amber: '#e3ab52'
  map-green: '#4fbf6a'
  rust: '#d0625a'
  chart-blue: '#9db6d4'
  admin-violet: '#b9a0df'
  supporter-gold: '#e8cf86'
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
    fontFamily: 'Barlow, ui-sans-serif, system-ui, sans-serif'
    fontWeight: 700
    letterSpacing: '0'
  rubric:
    fontFamily: 'Barlow, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.125rem'
    fontWeight: 600
    letterSpacing: '0'
  body:
    fontFamily: 'Sofia Sans Semi Condensed Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '18px'
  label:
    fontFamily: 'Sofia Sans Semi Condensed Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.8125rem'
  chip:
    fontFamily: 'Sofia Sans Semi Condensed Variable, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.75rem'
    fontWeight: 500
    fontFeature: 'tnum'
  figure:
    fontFamily: 'Barlow, ui-sans-serif, system-ui, sans-serif'
    fontWeight: 700
    fontFeature: 'tnum'
  code:
    fontFamily: 'Martian Mono Variable, ui-monospace, SF Mono, Menlo, monospace'
rounded:
  sm: '0.3rem'
  md: '0.4rem'
  lg: '0.5rem'
  xl: '0.7rem'
  full: '9999px'
spacing:
  page-gutter: '0.75rem'
  page-gutter-wide: '1rem'
  page-max: '64rem'
  rail-width: '12.25rem'
  rail-folded: '4.25rem'
  phone-header: '3rem'
  tab-bar: '4rem'
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
  chip:
    textColor: '{colors.dim}'
    rounded: '{rounded.md}'
    padding: '1px 0.375rem'
    typography: '{typography.chip}'
  chip-playing:
    backgroundColor: '{colors.field-green}'
    textColor: '{colors.field-green-ink}'
  outline-tag:
    rounded: '{rounded.sm}'
    padding: '0 0.375rem'
    typography: '{typography.chip}'
  rail-item-current:
    backgroundColor: '{colors.raised}'
    textColor: '{colors.bone}'
    rounded: '{rounded.md}'
    height: '2rem'
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

**Creative North Star:** "The Table Reference"

- A dense reference read mid-game on a phone in dim light: contrast goes to information, chrome stays quiet. Dark only.
- Lists are hairline rows on the page, not a card per item; a raised panel is the exception that marks something apart.
- Sentence case and moderate weights throughout; the display face is kept for real headings and figures.

**Key Characteristics:**

- Slate ground, chalk ink, one field-green accent.
- Rounded corners, flat edges: no bevels, corner brackets or dashed rails.
- State reads by weight and words as well as colour: a full green bar or outline for current, a hairline for what is ahead, a strike for discarded.

## Colors

- Code names: Field Green is `parchment` (`primary` and `ring` in generated components), Side A Red also `destructive`, Map Green `achieved`, Signal Amber `discarded`, Chart Blue `info`, Admin Violet `admin`, Supporter Gold `supporter`; Void is the page, Panel `panel`, Runner `runner`.
- One job per colour, always paired with a label or form: Field Green action, selection, focus and current; Side A/B red and blue the two sides (red also danger, destructive actions and input errors), which a battle and its battle-list card repaint in each side's first player's colour, with every name in its own player's colour (`PlayerTint`) and a side's score and top rule in a blend through all its players' colours, the same colour every player's name wears outside battles through `nameColour` (`src/core/playerColours.ts`: a fixed palette whose neighbours differ in lightness or chroma as well as hue, kept clear of amber, gold and Bone; each colour has a text form readable on Panel and a fill, deep under Bone ink where the text form is too light to carry it, through `side-a-fill` and `side-a-ink`; the player's choice or one from their id, with any player moved off a colour whose family someone seated earlier already holds, or that protanopia, deuteranopia or tritanopia would make look the same as one); Map Green achieved, best and success, deeper and more saturated than Field Green so a result never reads as a control; Amber warnings and discarded, never a step still to do (Bone says what comes next); Rust losses, which red-green colour blindness pulls close to Map Green, so a won, drawn or lost mark also carries its letter, word or form; Chart Blue links and secondary information; violet and gold role marks; `measure-*` the terrain board's distances, one per thing measured from, in hues the board itself never uses.
- Force dispositions each wear one colour wherever they appear, chosen or tagged (`dispositionTone` in `src/client/components/rosterSetup.ts`): Take and Hold Map Green, Purge the Foe Side A Red, Disruption Side B Blue, Reconnaissance violet, Priority Assets amber.
- Unit keywords are Field Green text on a faint green chip (`Keyword.tsx`).
- What's new tints each app area with its own muted hue (`area-*`), on the area's icon and filter only, used nowhere else.
- Achievement medals carry their own bronze, silver, gold and platinum metals (`AchievementBadge.tsx`), used elsewhere only for the unit picker's top-four trophy, bronze, silver or gold by how many of a faction's top-four lists take the unit; a medal not yet earned is the same medal in grey.
- Neutrals: Void page; Masthead the page header band; Panel parts, dialogs, menus; Raised tooltips, popovers, tab lists, hover and current nav items, disabled primary; Sunken dialog action strips and phone bars; Edge hairlines and row dividers; Runner input, chip and tooltip borders and scrollbars, Runner Hi hovered scrollbars and pending line segments.

**The One Green Rule.** Field Green marks only what acts or is current: the primary action, selection, focus, the current tab or phase, unit keywords. Never decoration. A player's green side colour is not Field Green: its fill is deep under Bone ink or a saturated lime, never the pale green of an action.

**The Labelled Red Rule.** Red is Side A, Purge the Foe and danger, so a danger state always carries its words or icon, never colour alone.

## Typography

**Display Font:** Barlow 600/700 (with ui-sans-serif)
**Body Font:** Sofia Sans Semi Condensed Variable (with ui-sans-serif)
**Code Font:** Martian Mono Variable, for pasted list text, codes and keys only

- Display: h1–h3 in Barlow 700, sentence case, untracked, balanced. Page titles 1.875rem, 2.25rem from `sm`; a battle side's player name 1.25rem.
- Rubric: a section heading, Barlow 600 at 1.125rem in Bone, with its count beside it in Faint (`SectionHeading`).
- Below body size a heading or rubric drops to Sofia Sans 600, because Barlow reads heavy small (`text-sm` and under).
- Label: a field, fact or group name is a muted sentence-case line, `text-xs` Dim (`Fact`), not tracked capitals.
- Figure: scores, CP and totals read across the table, Barlow 700 with tabular figures; any number that changes during a game uses tabular figures (`readout`).
- Small sizes: `text-xs` 0.8125rem, `text-2xs` 0.75rem (chips and tags), `text-3xs` 0.7222rem; nothing smaller.
- Players may raise the 18px root to 20px or 22px; every rem scales.

## Layout

- Desktop from 860px: a sticky navigation rail (12.25rem, folding to 4.25rem) on the left with section names over plain links, the current link on a Raised fill with its icon in Field Green; content in one centred column (64rem max, 0.75rem gutter, 1rem from `sm`).
- Below 860px: a compact 3rem header and a solid 4rem bottom tab bar (Home, Rosters, Battles, Factions, More) whose open tab carries a 3px Field Green bar along its top edge; dialogs go full screen unless they fit their content.
- The native app stands its tabs as a 5rem column from 1024px, the open tab on a Raised plate.
- Every top-level page opens with `PageHeader`: a Masthead band with an Edge bottom rule, title and description with actions beside them.
- Lists are rows divided by Edge hairlines (`divide-y divide-edge`, `border-y border-edge`) on the page itself; a group of rows may sit in one part when it needs to stand apart, never one part per row and never a part inside a part.
- Battle: from `lg` the two sides stand as columns beside the scoreboard, each under a 2px top rule in its side's colour. The playing side leads with its stratagems outside the command phase and with its missions in it; CP sits in the "Stratagems" heading beside them. The other side's column is compact, names and totals only. Below `lg` the turn bar is pinned above the tab bar and the page ends with its height to spare.
- Wide data scrolls sideways in its own region, first column and header sticky.
- Touch fields stay at least 16px, or iOS zooms.

## Elevation & Depth

- Mostly flat: tone steps and 1px hairlines carry structure. Parts lift by a soft drop; overlays lift further.

- **Part** (`inset 0 1px 0 rgb(255 255 255 / 0.03), 0 10px 28px -12px rgb(0 0 0 / 0.7)`): a raised panel at rest.
- **Lifted** (`0 28px 70px -20px rgb(0 0 0 / 0.8), 0 2px 8px rgb(0 0 0 / 0.35)`): dialogs, menus, selects, popovers.
- **Tooltip** (`0 12px 32px rgb(0 0 0 / 0.45)`): tooltips only.

## Shapes

- Corners are soft and edges plain: tags 5.4px, chips and tooltips 7.2px, controls 9px, parts and overlays 12.6px.
- Round shapes are reserved: part tags, avatars, status dots, scrollbar thumbs.
- Full-screen phone dialogs are square.

## Motion

- Motion settles: `--ease-settle`, fast in, no overshoot, exits faster than entrances.
- A line that becomes current (a tab's underline, the open phone tab's bar, a `now` line segment) draws out from its start, 280ms; a setup step's line draws down.
- A discarded mission card's strike inks in.
- A score, command point or roster points figure that changes rises into place, 260ms, keyed on its value.
- Battle events that arrive while the log is open slide in at its top; the ones it opened with stay still.
- A medal, in the message that it was earned, is crossed once by light, clipped to its frame.
- Overlays fade and lift 160ms, dialogs 220ms; a full-screen phone dialog rises from below instead of scaling. Disclosures fade their content in, 160ms.
- A new page crossfades 180ms; a filter or search that rewrites the address swaps in place.
- No loops, no load choreography, no bounce. Reduced motion removes all of it.

## Components

- **Buttons:** one Field Green primary per surface, 2rem high, `lg` corners; disabled primary drops to Raised and Faint, never faded field green. Focus is a 2px Field Green outline offset 2px.
- **Links:** look like links: underlined, in Chart Blue or the surrounding text. Breadcrumbs and back links take `quiet-link`, a faint bottom rule in the text's colour that firms up on hover.
- **Section headings:** `SectionHeading`, a rubric with its count, an optional detail or action at the right.
- **Page states:** `PageState` for every loading, empty and unavailable screen or panel: a Faint icon, a heading, one Dim line, an optional action.
- **Disclosures:** every `<details>` and Collapsible opens with `DisclosureChevron` before its label, pointing right while shut and turned 90° once open.
- **Parts:** the `part` utility (Panel fill, Edge hairline, `xl` corners, part shadow) for the few raised things: a home feature panel, an organiser section, a framed group of rows.
- **Page tabs:** `PageTabsList` and `PageLinkTabs`: Dim labels with counts on an Edge baseline, the current tab in Bone over a 3px Field Green underline.
- **Line segments:** rails of phases, rounds and readiness: `done` a full bar, `now` a full bar in Field Green (or `--line-colour`), `todo` a hairline, `off` a faded hairline; `--line-blend` runs a team side's colours through them.
- **Chips:** every datasheet name is followed by its points chip: Runner border, Dim sentence-case label, tabular figures; a game in play is a filled Field Green chip.
- **Outline tags:** `OUTLINE_TAG`, a small `sm`-cornered outlined tag for a state or rule a list carries; `dispositionTag` colours it for its force disposition.
- **Part tags:** a small Bone lozenge for a rank, a round or a table, ghost-ringed when not yet placed. Seats carry no tag; their side's colour says whose they are.
- **Inputs:** Runner border; Field Green ring on focus; errors take a Side A Red border plus a message naming the problem and fix.
- **Dialogs:** a lifted part with a Sunken action strip; may tint its edge for the side it belongs to.
- **Page header:** a faction page may carry its colour as a 3px top edge.
- **Mission cards:** each scoring window and each action is a row, timing as the heading, VP as a figure with no box; battle and setup reuse the same card.
- **Matchup table:** best cells get a 2px Achieved Green inset outline.

## Do's and Don'ts

### Do

- **Do** carry state by weight and words as well as colour.
- **Do** give a list's rows hairline dividers and let the page be their ground.
- **Do** theme scrollbars (Runner), caret and selection (Field Green).

### Don't

- **Don't** add a light theme.
- **Don't** use Field Green beyond action, selection, focus, current, keywords and success, or side colours beyond the sides and their dispositions.
- **Don't** set headings or labels in tracked capitals, or put an eyebrow label above a heading; a label names a field or group in muted sentence case, or is itself the heading.
- **Don't** wrap each list item in its own card, or nest a part inside a part.
- **Don't** draw bevels, corner brackets, dashed or doubled rules, or runner rails with gates.
- **Don't** mark a part's side or state with a coloured side stripe; a side column takes its colour as a top rule.
