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
  measure-terrain: '#c39bff'
  measure-lines: '#f57fd8'
  measure-edges: '#f4e25c'
  measure-published: '#8b97ff'
  measure-mat: '#b4e85a'
  void: '#0f1113'
  masthead: '#0e1316'
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

- Dense, read mid-game on a phone in dim light: contrast goes to information, chrome stays quiet. Dark only.

## Colors

- Code names: Field Green is `parchment`/`azure` (`primary` in generated components), Map Green `achieved`, Signal Amber `discarded`, Chart Blue `info`, Admin Violet `admin`, Supporter Gold `supporter`.
- One job per colour, always paired with a label: green action, selection, focus; Side A/B red and blue the sides (red also danger); Map Green achieved or best; Amber warnings and discarded; Rust losses; violet and gold role marks; `measure-*` the terrain board's distances, one per thing measured from, in hues the board itself never uses.
- Neutrals: Void page; Masthead the gridded band that opens a page; Panel cards, dialogs, menus; Raised tab lists, tooltips, disabled primary; Sunken footers, table headers, dialog action strips.

## Typography

- Display: h1–h3, uppercase.
- Players may raise the 18px root to 20px or 22px; every rem scales.
- `text-3xs` is the only step below label.
- Any number that changes during a game uses tabular figures.

## Layout

- One centred column. Below about 860px: bottom tab bar, compact header, full-screen dialogs unless short.
- Wide data scrolls sideways in its own region, first column and header sticky.
- Touch fields stay at least 16px, or iOS zooms.

## Elevation & Depth

- Flat: tone steps or 1px hairlines; the tooltip is the only shadow.

## Shapes

- Panels, dialogs, menus, popovers, tooltips and skeletons are square; avatars are the only round shape.

## Components

- One Field Green primary per surface; focus is a 2px Field Green outline offset 2px.
- Every datasheet name is followed by its points chip.
- Input errors: Side A Red border plus a message naming the problem and fix.
- Matchup table: best cells get a 2px Map Green inset outline.

## Do's and Don'ts

- Do theme scrollbars (Edge Strong), caret and selection (green).
- Don't add a light theme.
- Don't use green beyond action, selection and success, or red and blue beyond sides and danger.
