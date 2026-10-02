import { useEffect, useState } from 'react'
import type { CombatResult } from '../../../core/combat'
import type { CombatCarrier } from '../../../core/combatLoadout'
import {
  changedChoices,
  compareOutcomes,
  loadoutChanges,
  loadoutPick,
  materiallyBetter,
  type LoadoutAssignment,
  type LoadoutRow,
  type LoadoutScore,
  type LoadoutScoring,
  type LoadoutSearch,
  type LoadoutSpace,
  type ProfileOdds,
} from '../../../core/combatLoadouts'
import type { RosterPick } from '../../../core/roster'
import type { CombatRequest } from './CombatMatchup'

type Phase = 'ranged' | 'melee'
const PHASES = ['ranged', 'melee'] as const
export type LoadoutMessage =
  | { kind: 'search'; space: LoadoutSpace; scoring: LoadoutScoring; expected: CombatRequest; keep: number }
  | { kind: 'rows'; base: LoadoutAssignment }
  | { kind: 'score'; carriers: CombatCarrier[][] }
export type LoadoutAnswer =
  | {
      kind: 'searched'
      search: LoadoutSearch
      current: LoadoutAssignment
      comparable: Record<Phase, boolean>
      profiles: [string, ProfileOdds][]
    }
  | { kind: 'rows'; rows: LoadoutRow[] }
  | { kind: 'scored'; scores: LoadoutScore[] }
export type LoadoutContext = { catalogueId: string; detachmentIds: readonly string[]; picks: readonly RosterPick[]; pickIndex: number }
/** Builds candidate picks the way the roster will; null when the unit data is unavailable. */
export type CheckLoadouts = (
  context: LoadoutContext,
  candidates: readonly RosterPick[],
) => Promise<{ legal: boolean; points: number; carriers: CombatCarrier[] }[] | null>

/** What one option of the loadout editor does to the attack: taken outright (0), or given to one more (1) or one fewer (−1) model. */
export type OptionEstimate = { step: LoadoutRow['step']; phases: Partial<Record<Phase, { result: CombatResult; best: boolean }>> }
/** A stronger legal loadout, for one phase or for both when one loadout is strongest in each. */
export type LoadoutSuggestion = {
  phases: Phase[]
  pick: RosterPick
  changes: string[]
  gains: Partial<Record<Phase, { from: CombatResult; to: CombatResult }>>
  points: number
}
export type Loadouts =
  | { status: 'searching' }
  | { status: 'failed'; retry: () => void }
  | {
      status: 'ready'
      /** A unit with no weapon choices still has odds for each weapon profile. */
      choices: boolean
      suggestions: LoadoutSuggestion[]
      complete: boolean
      estimates: ReadonlyMap<string, OptionEstimate>
      profiles: ReadonlyMap<string, ProfileOdds>
    }

/** The editor names an option by its group and catalogue entry. */
export const estimateKey = (group: string, entry: string) => `${group}|${entry}`

/** Each server check builds at most this many loadouts; rankings are checked in batches until one is legal. */
const CHECKED = 32
const RANKED = 40
const BATCH = 8
const ROUNDS = 4

const keyOf = (assignment: LoadoutAssignment) => JSON.stringify(assignment)
type Verified = { assignment: LoadoutAssignment; pick: RosterPick; points: number; score: LoadoutScore }

/**
 * Searches the attacker's weapon choices against the current target in a worker, then estimates
 * each option the loadout editor offers. The server builds every candidate first, so only legal
 * loadouts with their real carriers are suggested or estimated.
 */
export function useLoadoutSearch({
  context,
  space,
  check,
  scoring,
  expected,
}: {
  context: LoadoutContext | null
  space: LoadoutSpace | null | undefined
  check: CheckLoadouts | null
  scoring: LoadoutScoring | null
  expected: CombatRequest
}): Loadouts | null {
  const request = context && space && check && scoring ? JSON.stringify({ context, space, scoring, expected }) : null
  const [attempt, setAttempt] = useState(0)
  const [found, setFound] = useState<{ key: string; loadouts: Loadouts | null } | null>(null)
  const key = `${attempt}:${request}`
  useEffect(() => {
    if (!request || !check) return
    const parsed = JSON.parse(request) as { context: LoadoutContext; space: LoadoutSpace; scoring: LoadoutScoring; expected: CombatRequest }
    const { axes } = parsed.space
    const pick = parsed.context.picks[parsed.context.pickIndex]!
    let active = true
    let worker: Worker
    try {
      worker = new Worker(new URL('./combat.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      queueMicrotask(() => active && setFound({ key, loadouts: null }))
      return () => {
        active = false
      }
    }
    const waiting: { resolve: (answer: LoadoutAnswer) => void; reject: (error: Error) => void }[] = []
    worker.onmessage = (event: MessageEvent<LoadoutAnswer>) => waiting.shift()?.resolve(event.data)
    worker.onerror = () => waiting.splice(0).forEach(({ reject }) => reject(new Error('The loadout search failed.')))
    const ask = <K extends LoadoutAnswer['kind']>(message: LoadoutMessage) =>
      new Promise<Extract<LoadoutAnswer, { kind: K }>>((resolve, reject) => {
        waiting.push({ resolve: resolve as (answer: LoadoutAnswer) => void, reject })
        worker.postMessage(message)
      })
    const verified = new Map<string, Verified | null>()
    const verify = async (assignments: readonly LoadoutAssignment[]) => {
      const fresh = [...new Map(assignments.map((assignment) => [keyOf(assignment), assignment])).values()].filter(
        (assignment) => !verified.has(keyOf(assignment)),
      )
      for (let at = 0; at < fresh.length; at += CHECKED) {
        const batch = fresh.slice(at, at + CHECKED)
        const picks = batch.map((assignment) => loadoutPick(pick, axes, assignment))
        const checked = await check(parsed.context, picks)
        if (!checked) throw new Error('Loadouts could not be checked.')
        const legal = batch.flatMap((assignment, index) =>
          checked[index]?.legal ? [{ assignment, pick: picks[index]!, ...checked[index] }] : [],
        )
        const scores = legal.length ? (await ask<'scored'>({ kind: 'score', carriers: legal.map((entry) => entry.carriers) })).scores : []
        batch.forEach((assignment) => verified.set(keyOf(assignment), null))
        legal.forEach((entry, index) => verified.set(keyOf(entry.assignment), { ...entry, score: scores[index]! }))
      }
    }
    const run = async () => {
      const { search, current, comparable, profiles } = await ask<'searched'>({
        kind: 'search',
        space: parsed.space,
        scoring: parsed.scoring,
        expected: parsed.expected,
        keep: RANKED,
      })
      const now = { ranged: comparable.ranged ? search.ranged.current : null, melee: comparable.melee ? search.melee.current : null }
      // The first legal loadout down each ranking is that phase's best, so check in batches until one appears.
      for (let round = 0; round < ROUNDS; round++) {
        const next = PHASES.filter((phase) => now[phase] && !search[phase].ranked.some((entry) => verified.get(keyOf(entry.assignment))))
          .flatMap((phase) =>
            search[phase].ranked
              .filter((entry) => !verified.has(keyOf(entry.assignment)))
              .slice(0, BATCH)
              .map((entry) => entry.assignment),
          )
          .slice(0, CHECKED)
        if (!next.length) break
        await verify(next)
      }
      const strongest = (phase: Phase) => {
        const before = now[phase]
        const best = [...verified.values()]
          .filter((entry): entry is Verified => Boolean(entry?.score[phase]))
          .toSorted(
            (left, right) =>
              compareOutcomes(right.score[phase]!, left.score[phase]!) ||
              changedChoices(current, left.assignment) - changedChoices(current, right.assignment),
          )[0]
        return before && best && materiallyBetter(best.score[phase]!, before) ? best : null
      }
      const separate = { ranged: strongest('ranged'), melee: strongest('melee') }
      const suggestion = (entry: Verified, phases: Phase[]): LoadoutSuggestion => ({
        phases,
        pick: entry.pick,
        changes: loadoutChanges(axes, entry.assignment),
        gains: Object.fromEntries(phases.map((phase) => [phase, { from: now[phase]!, to: entry.score[phase]! }])),
        points: entry.points,
      })
      let suggestions = PHASES.flatMap((phase) => (separate[phase] ? [suggestion(separate[phase], [phase])] : []))
      // Shooting and melee bests that change different choices combine into one loadout for both.
      if (separate.ranged && separate.melee && keyOf(separate.ranged.assignment) !== keyOf(separate.melee.assignment)) {
        const ranged = separate.ranged.assignment
        const melee = separate.melee.assignment
        const changed = (assignment: LoadoutAssignment, at: number) => JSON.stringify(assignment[at]) !== JSON.stringify(current[at])
        if (!current.some((_, at) => changed(ranged, at) && changed(melee, at))) {
          const merged = current.map((value, at) => (changed(ranged, at) ? ranged[at]! : changed(melee, at) ? melee[at]! : value))
          await verify([merged])
          const entry = verified.get(keyOf(merged))
          if (entry && PHASES.every((phase) => entry.score[phase] && !materiallyBetter(separate[phase]!.score[phase]!, entry.score[phase])))
            suggestions = [suggestion(entry, [...PHASES])]
        }
      } else if (separate.ranged && separate.melee) suggestions = [suggestion(separate.ranged, [...PHASES])]
      const { rows } = await ask<'rows'>({ kind: 'rows', base: current })
      await verify(rows.flatMap((row) => (keyOf(row.assignment) === keyOf(current) ? [] : [row.assignment])))
      if (active)
        setFound({
          key,
          loadouts: {
            status: 'ready',
            choices: axes.length > 0,
            suggestions,
            complete: search.ranged.complete,
            estimates: optionEstimates(axes, rows, verified, current, now),
            profiles: new Map(profiles),
          },
        })
    }
    run().catch(() => active && setFound({ key, loadouts: null }))
    return () => {
      active = false
      worker.terminate()
    }
  }, [key, request, check])
  if (!request) return null
  if (found?.key !== key) return { status: 'searching' }
  return found.loadouts ?? { status: 'failed', retry: () => setAttempt((value) => value + 1) }
}

/**
 * Each option's result for the phases its choice affects. A choice whose options all resolve alike
 * in a phase, such as a melee weapon when shooting, says nothing about that phase.
 */
export function optionEstimates(
  axes: LoadoutSpace['axes'],
  rows: readonly LoadoutRow[],
  verified: ReadonlyMap<string, Verified | null>,
  current: LoadoutAssignment,
  now: Record<Phase, CombatResult | null>,
) {
  const found = new Map<string, OptionEstimate>()
  const scoreOf = (assignment: LoadoutAssignment) => (keyOf(assignment) === keyOf(current) ? now : verified.get(keyOf(assignment))?.score)
  axes.forEach((axis, at) => {
    const entries = rows.flatMap((row) => {
      const score = row.axis === at ? scoreOf(row.assignment) : undefined
      const option = axis.options.find((candidate) => candidate.id === row.option)
      return score && option ? [{ option, step: row.step, score }] : []
    })
    for (const { option, step, score } of entries) {
      const phases: OptionEstimate['phases'] = {}
      for (const phase of PHASES) {
        const result = score[phase]
        const before = now[phase]
        if (!result || !before || !entries.some((other) => other.score[phase] && compareOutcomes(other.score[phase], before) !== 0))
          continue
        const top = entries
          .flatMap((other) => (other.score[phase] ? [other.score[phase]] : []))
          .reduce((best, candidate) => (compareOutcomes(candidate, best) > 0 ? candidate : best))
        phases[phase] = { result, best: compareOutcomes(result, top) === 0 && materiallyBetter(top, before) }
      }
      if (Object.keys(phases).length) found.set(estimateKey(option.group, option.entry), { step, phases })
    }
  })
  return found
}
