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
} from '../../../core/combatLoadouts'
import type { RosterPick } from '../../../core/roster'
import type { CombatRequest } from './CombatMatchup'

type Phase = 'ranged' | 'melee'
const PHASES = ['ranged', 'melee'] as const
export type LoadoutMessage =
  | { kind: 'search'; space: LoadoutSpace; scoring: LoadoutScoring; expected: CombatRequest; keep: number }
  | { kind: 'rows'; bases: Record<Phase, LoadoutAssignment | null> }
  | { kind: 'score'; carriers: CombatCarrier[][] }
export type LoadoutAnswer =
  | { kind: 'searched'; search: LoadoutSearch; current: LoadoutAssignment; comparable: Record<Phase, boolean> }
  | { kind: 'rows'; rows: Record<Phase, LoadoutRow[]> }
  | { kind: 'scored'; scores: LoadoutScore[] }
export type LoadoutContext = { catalogueId: string; detachmentIds: readonly string[]; picks: readonly RosterPick[]; pickIndex: number }
/** Builds candidate picks the way the roster will; null when the unit data is unavailable. */
export type CheckLoadouts = (
  context: LoadoutContext,
  candidates: readonly RosterPick[],
) => Promise<{ legal: boolean; points: number; carriers: CombatCarrier[] }[] | null>

/** The strongest legal loadout for one phase, and the alternatives a player can compare it with. */
export type PhaseLoadouts = {
  current: CombatResult
  best: { pick: RosterPick; changes: string[]; result: CombatResult; points: number } | null
  rows: { axis: string; label: string; result: CombatResult; best: boolean; current: boolean }[]
  complete: boolean
}
export type Loadouts =
  | { status: 'searching' }
  | { status: 'failed'; retry: () => void }
  | { status: 'ready'; phases: Record<Phase, PhaseLoadouts | null> }

/** Each server check builds at most this many loadouts; rankings are checked in batches until a legal one appears. */
const CHECKED = 32
const RANKED = 40
const BATCH = 8
const ROUNDS = 4

const keyOf = (assignment: LoadoutAssignment) => JSON.stringify(assignment)
type Verified = { assignment: LoadoutAssignment; pick: RosterPick; points: number; score: LoadoutScore }

/**
 * Searches the attacker's weapon choices against the current target in a worker. The server
 * builds the strongest candidates, so only legal loadouts with their real carriers are suggested,
 * and the comparison rows are built and checked around that legal best.
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
  const request = context && space?.axes.length && check && scoring ? JSON.stringify({ context, space, scoring, expected }) : null
  const [attempt, setAttempt] = useState(0)
  const [found, setFound] = useState<{ key: string; phases: Record<Phase, PhaseLoadouts | null> | null } | null>(null)
  const key = `${attempt}:${request}`
  useEffect(() => {
    if (!request || !check) return
    const parsed = JSON.parse(request) as { context: LoadoutContext; space: LoadoutSpace; scoring: LoadoutScoring; expected: CombatRequest }
    const pick = parsed.context.picks[parsed.context.pickIndex]!
    let active = true
    let worker: Worker
    try {
      worker = new Worker(new URL('./combat.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      queueMicrotask(() => active && setFound({ key, phases: null }))
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
      const fresh = [...new Map(assignments.map((assignment) => [keyOf(assignment), assignment])).values()]
        .filter((assignment) => !verified.has(keyOf(assignment)))
        .slice(0, CHECKED)
      if (!fresh.length) return
      const picks = fresh.map((assignment) => loadoutPick(pick, parsed.space.axes, assignment))
      const checked = await check(parsed.context, picks)
      if (!checked) throw new Error('Loadouts could not be checked.')
      const legal = fresh.flatMap((assignment, at) => (checked[at]?.legal ? [{ assignment, pick: picks[at]!, ...checked[at] }] : []))
      const scores = legal.length ? (await ask<'scored'>({ kind: 'score', carriers: legal.map((entry) => entry.carriers) })).scores : []
      fresh.forEach((assignment) => verified.set(keyOf(assignment), null))
      legal.forEach((entry, at) => verified.set(keyOf(entry.assignment), { ...entry, score: scores[at]! }))
    }
    const run = async () => {
      const { search, current, comparable } = await ask<'searched'>({
        kind: 'search',
        space: parsed.space,
        scoring: parsed.scoring,
        expected: parsed.expected,
        keep: RANKED,
      })
      // The first legal loadout down each ranking is that phase's best, so check in batches until one appears.
      for (let round = 0; round < ROUNDS; round++) {
        const open = PHASES.filter((phase) => !search[phase].ranked.some((entry) => verified.get(keyOf(entry.assignment))))
        const next = open.flatMap((phase) =>
          search[phase].ranked
            .filter((entry) => !verified.has(keyOf(entry.assignment)))
            .slice(0, BATCH)
            .map((entry) => entry.assignment),
        )
        if (!next.length) break
        await verify(next)
      }
      const strongest = (phase: Phase) => {
        const now = search[phase].current
        const best = [...verified.values()]
          .filter((entry): entry is Verified => Boolean(entry?.score[phase]))
          .toSorted(
            (left, right) =>
              compareOutcomes(right.score[phase]!, left.score[phase]!) ||
              changedChoices(current, left.assignment) - changedChoices(current, right.assignment),
          )[0]
        return now && best && materiallyBetter(best.score[phase]!, now) ? best : null
      }
      // Shooting and melee bests that change different choices combine into one loadout for both.
      const separate = { ranged: strongest('ranged'), melee: strongest('melee') }
      let shared: Verified | null = null
      if (separate.ranged && separate.melee && keyOf(separate.ranged.assignment) !== keyOf(separate.melee.assignment)) {
        const ranged = separate.ranged.assignment
        const melee = separate.melee.assignment
        const changed = (assignment: LoadoutAssignment, at: number) => JSON.stringify(assignment[at]) !== JSON.stringify(current[at])
        if (!current.some((_, at) => changed(ranged, at) && changed(melee, at))) {
          const merged = current.map((value, at) => (changed(ranged, at) ? ranged[at]! : changed(melee, at) ? melee[at]! : value))
          await verify([merged])
          const entry = verified.get(keyOf(merged))
          if (entry && PHASES.every((name) => entry.score[name] && !materiallyBetter(separate[name]!.score[name]!, entry.score[name])))
            shared = entry
        }
      }
      const chosen = (phase: Phase) => shared ?? separate[phase]
      const bases = {
        ranged: comparable.ranged && search.ranged.current ? (chosen('ranged')?.assignment ?? current) : null,
        melee: comparable.melee && search.melee.current ? (chosen('melee')?.assignment ?? current) : null,
      }
      const { rows } = await ask<'rows'>({ kind: 'rows', bases })
      // Either-or choices are what a player compares; squad splits are many and often over a limit.
      await verify(
        [true, false].flatMap((single) =>
          PHASES.flatMap((phase) =>
            rows[phase].flatMap((row) => ((parsed.space.axes[row.axis]!.kind === 'single') === single ? [row.assignment] : [])),
          ),
        ),
      )
      const phase = (name: Phase): PhaseLoadouts | null => {
        const now = search[name].current
        const base = bases[name]
        if (!now || !base) return null
        const best = chosen(name)
        const baseKey = keyOf(base)
        const currentKey = keyOf(current)
        return {
          current: now,
          best: best
            ? {
                pick: best.pick,
                changes: loadoutChanges(parsed.space.axes, best.assignment),
                result: best.score[name]!,
                points: best.points,
              }
            : null,
          rows: rows[name]
            // A choice whose options all resolve alike, such as a melee weapon when shooting, has nothing to compare.
            .filter((row) => rows[name].some((other) => other.axis === row.axis && compareOutcomes(other.result, row.result) !== 0))
            .flatMap((row) => {
              const rowKey = keyOf(row.assignment)
              const result = rowKey === currentKey ? now : verified.get(rowKey)?.score[name]
              if (!result) return []
              const axis = parsed.space.axes[row.axis]!
              const value = row.assignment[row.axis]!
              return [
                {
                  axis: axis.name,
                  label:
                    axis.kind === 'single'
                      ? (axis.options.find((option) => option.id === value)?.name ?? 'Nothing')
                      : loadoutChanges([axis], [value]).join(', ') || 'As chosen',
                  result,
                  best: rowKey === baseKey,
                  current: rowKey === currentKey,
                },
              ]
            }),
          complete: search[name].complete,
        }
      }
      if (active) setFound({ key, phases: { ranged: phase('ranged'), melee: phase('melee') } })
    }
    run().catch(() => active && setFound({ key, phases: null }))
    return () => {
      active = false
      worker.terminate()
    }
  }, [key, request, check])
  if (!request) return null
  if (found?.key !== key) return { status: 'searching' }
  return found.phases ? { status: 'ready', phases: found.phases } : { status: 'failed', retry: () => setAttempt((value) => value + 1) }
}
