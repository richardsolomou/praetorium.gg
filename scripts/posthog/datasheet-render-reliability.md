---
name: signals-scout-datasheet-render-reliability
description: Detect a material drop from faction datasheet loading to successful rendering, including recurrence of hydration or client-render failures.
allowed_tools:
  - emit_report
  - edit_report
---

# Datasheet render reliability

## Purpose and discriminator

Watch whether faction datasheets that begin loading reach a successful rendered state. The discriminator is a **sustained drop in `roster_datasheet_rendered` relative to `roster_datasheet_loaded`**, corroborated by relevant `$exception` or friction evidence.

## Quick close-out

Verify the schemas for `roster_datasheet_loaded` and `roster_datasheet_rendered`, including whether a session, roster, or datasheet identifier can join them. If there are fewer than 10 loaded datasheets in both the current 24-hour window and the preceding 7-day comparison window, record insufficient traffic and close without a report.

## Explore

1. Verify that loads and renders share non-empty session IDs in both windows. Restrict browser events to production `praetorium.gg` and exclude the project's internal/test cohort and owner. Preserve production server loads, including those classified as Automation; apply browser bot classifications only to browser events. Restrict each session to the flow that initiated the load: a faction-datasheet pageview for that flow, or the corresponding roster-unit pane for a roster load. Exclude background prefetches, sessions with no matching browser flow, and navigation exits before calculating completion. Pair a load only with a later render in the same compatible session or entity. Without a datasheet key, label the result a session-level proxy, never per-datasheet completion; if session propagation or flow scope cannot be established, close as inconclusive rather than substituting a distinct-person funnel.
   Before calculating any completion rate, show the exact eligibility predicate and verify it independently of whether a render exists. A render is an outcome, never evidence that its own load was eligible. A union of pageview sessions and rendered sessions is invalid. Do not relax a matching-flow join because it lowers completion or disagrees with scratchpad history. When initiating flow, navigation exits, internal/owner exclusions, or browser traffic classification cannot be verified, stop as inconclusive and do not save a healthy or failing completion baseline. A missing SQL value for `$virt_traffic_type` does not mean Regular; inspect the supported virtual field instead of accepting unknown traffic. For session proxies, use existence of a later compatible render, not only the earliest render of the whole session.
2. Compare the latest 24 hours with the preceding non-overlapping seven-day baseline, using the same flow filters, aggregation timezone, and complete observation windows. Apply thresholds only after session and flow validation. Investigate when completion is below 85% with at least 10 eligible load sessions, or falls by 20 percentage points or more from baseline with at least 10 eligible load sessions. Keep `datacard_join` outcome monitoring separate: a missing source match does not establish a failed render.
3. Inspect `$exception` events around faction/datasheet routes for hydration mismatch, React error #418, or rendering errors, and check `$rageclick` only as corroboration.
4. Break a candidate down by route, browser, device type, and release timing when those properties exist. Check the prior hydration-mismatch report before deciding whether the finding is new.

## Disqualifiers

Ignore missing-render events caused by a user navigating away, bot traffic, local development, isolated single-user incidents, and low-traffic windows. Do not report the previously fixed hydration mismatch unless fresh data shows a sustained post-fix regression with an adequate load denominator.

## Decide and report

Emit one report only if the conversion threshold is met and the evidence suggests users cannot view datasheets or are forced into a broken render. Include loads, renders, completion rate, baseline, affected people, relevant exception/friction evidence, and the most concentrated segment. For a known incident with materially new impact, edit its existing report rather than duplicating it.

## Dedupe and memory

Search existing inbox reports, prior runs, and scratchpad keys beginning `pattern:datasheet-render:` and `watch:datasheet-render:` before emitting. Classify each candidate as net-new, material update, already covered, or addressed/noise. Save the current baseline, failing segment, and last-seen signature after every investigated anomaly; suppress unchanged signatures for 7 days unless affected people or the completion deficit doubles.
