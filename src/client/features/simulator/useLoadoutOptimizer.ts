import { noExclusions } from '../../../core/combatMatchup'
import { loadoutSearch } from '../../functions'
import CombatWorker from './combatWorker'
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  compareOutcomes,
  applyOptimizedLoadout,
  type LoadoutBatch,
  type LoadoutCandidates,
  type LoadoutOptimization,
  type LoadoutScoring,
  type OptimizedLoadout,
  type LoadoutOptimizationMode,
} from '../../../core/combatLoadouts'
import type { RosterPick } from '../../../core/roster'
import { LoadoutOptimizationContext } from './LoadoutOdds'
import type { Combatant } from './useCombatant'
import { errorMessage } from '../../queryClient'
import { workerAnswer } from '../../workerAnswer'

const SEARCH_CUT_SHORT = 'The full search could not finish. The best loadout found so far has been kept.'

export type OptimizeLoadoutRequest = { kind: 'optimize'; space: LoadoutCandidates; scoring: LoadoutScoring; mode: LoadoutOptimizationMode }
export type OptimizeLoadoutAnswer = { optimized: LoadoutOptimization; error?: never } | { error: string; optimized?: never }

/** Candidates the page scores before calling a search incomplete. */
const MAX_CANDIDATES = 20_000
/** How long a local search keeps climbing from random starts after its climb from the current loadout. */
const LOCAL_SEARCH_MS = 10_000
const RESTARTS = 20
/** Restarts in a row that find nothing better before a local search stops early. */
const STALE_RESTARTS = 4
/** Random edits from the current loadout to each restart's start. */
const WALK_STEPS = 8

export function useLoadoutOptimizer(combatant: Combatant) {
  const context = useContext(LoadoutOptimizationContext)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const active = useRef<{ cancel: () => void; keep: () => void; key: string } | null>(null)
  const applied = useRef<string | null>(null)
  const key = JSON.stringify([
    combatant.identity,
    combatant.picks.positioned,
    combatant.ruleSelections,
    context?.key,
    context?.preferences,
    context?.excluded,
  ])
  const latest = useRef(key)
  useLayoutEffect(() => {
    latest.current = key
  }, [key])
  useEffect(() => {
    if (active.current?.key === key || applied.current === key) return
    applied.current = null
    active.current?.cancel()
    setBusy(false)
    setProgress(0)
    setError(null)
    setNotice(null)
  }, [key])
  useEffect(() => () => active.current?.cancel(), [])
  const cancel = () => {
    active.current?.keep()
    active.current?.cancel()
    setBusy(false)
    setProgress(0)
  }
  const optimize = async (mode: LoadoutOptimizationMode = 'combined') => {
    if (!context?.scoring || !combatant.ready || active.current || combatant.battleUnit) return
    const controller = new AbortController()
    const workers: Worker[] = []
    let timer: ReturnType<typeof setTimeout> | undefined
    const job = {
      key,
      keep: () => {},
      cancel: () => {
        controller.abort()
        workers.forEach((worker) => worker.terminate())
        clearTimeout(timer)
        if (active.current === job) active.current = null
      },
    }
    const current = () => active.current === job && latest.current === job.key
    const fail = (message: string) => {
      if (!current()) return
      job.keep()
      job.cancel()
      setBusy(false)
      setError(message)
    }
    active.current = job
    setBusy(true)
    setProgress(0)
    setError(null)
    setNotice(null)
    timer = setTimeout(() => fail(SEARCH_CUT_SHORT), 120_000)
    try {
      const count = Math.min(4, Math.max(1, navigator.hardwareConcurrency ?? 2))
      for (let at = 0; at < count; at++) workers.push(new CombatWorker())
      const baseline = context.results?.[mode]
      let best: OptimizedLoadout | undefined =
        baseline && combatant.pick
          ? {
              picks: [combatant.pickIndex, ...(combatant.sheets.data?.companions ?? []).map((member) => member.pickIndex)].map(
                (pickIndex) => ({ pickIndex, pick: combatant.picks.positioned[pickIndex]! }),
              ),
              preferences: context.preferences,
              result: baseline,
            }
          : undefined
      let scored = false
      let skipped = false
      let reason: string | undefined
      let improved = false
      const notes: string[] = []
      const started = performance.now()
      const apply = (optimized: OptimizedLoadout) => {
        const picks = applyOptimizedLoadout(combatant.picks.positioned, optimized.picks)
        job.key = JSON.stringify([combatant.identity, picks, combatant.ruleSelections, context.key, optimized.preferences, noExclusions()])
        applied.current = job.key
        latest.current = job.key
        context.apply(optimized.preferences)
        combatant.picks.setPicks((currentPicks) => applyOptimizedLoadout(currentPicks, optimized.picks))
      }
      job.keep = () => {
        if (current() && improved && best) apply(best)
      }
      const score = (worker: Worker, space: LoadoutCandidates) =>
        workerAnswer<OptimizeLoadoutAnswer>(
          worker,
          { kind: 'optimize', space, scoring: context.scoring!, mode } satisfies OptimizeLoadoutRequest,
          { signal: controller.signal },
        ).then(
          (answer): LoadoutOptimization => {
            if (answer.optimized) return answer.optimized
            throw new Error(answer.error)
          },
          () => {
            throw new Error(controller.signal.aborted ? 'Optimization cancelled.' : 'Optimization failed. Try again.')
          },
        )
      /** Scores every candidate a search sends while it is still searching, and returns the best of them. */
      const run = async (picks: RosterPick[], walk?: { seed: number; steps: number }) => {
        const response = await loadoutSearch(
          { catalogueId: combatant.catalogueId, detachmentIds: combatant.detachmentIds, picks, pickIndex: combatant.pickIndex, walk },
          controller.signal,
        )
        if (!response.ok || !response.body) throw new Error('The loadout could not be loaded. Try again.')
        let top: OptimizedLoadout | undefined
        let local = false
        const space: LoadoutCandidates = { candidates: [] }
        let discovered = 0
        let complete = false
        let streamError: unknown
        let wake: (() => void) | undefined
        controller.signal.addEventListener('abort', () => wake?.(), { once: true })
        const process = (batch: LoadoutBatch & { error?: string }) => {
          if (batch.error) throw new Error(batch.error)
          discovered += batch.candidates.length
          local = batch.local
          // States explored of those the unit's choices allow, or of those found once the search has found more.
          const states = Math.max(batch.estimated ?? 0, batch.scheduled)
          if (!local) setProgress((previous) => Math.max(previous, Math.min(99, Math.floor((batch.built / states) * 100))))
          if (discovered > MAX_CANDIDATES) throw new Error(SEARCH_CUT_SHORT)
          space.candidates.push(...batch.candidates)
          complete = batch.done
          wake?.()
        }
        const reader = response.body.getReader()
        const reading = (async () => {
          try {
            const decoder = new TextDecoder()
            let buffer = ''
            let received = 0
            while (current()) {
              const next = await reader.read()
              if (!current()) return
              received += next.value?.byteLength ?? 0
              if (received > 64 * 1024 * 1024) throw new Error(SEARCH_CUT_SHORT)
              buffer += decoder.decode(next.value, { stream: !next.done })
              let newline: number
              while ((newline = buffer.indexOf('\n')) >= 0) {
                process(JSON.parse(buffer.slice(0, newline)))
                buffer = buffer.slice(newline + 1)
              }
              if (next.done) {
                if (!complete) throw new Error(SEARCH_CUT_SHORT)
                break
              }
            }
          } catch (cause) {
            streamError = cause
          } finally {
            wake?.()
          }
        })()
        while (current()) {
          if (streamError) throw streamError
          if (!space.candidates.length) {
            if (complete) break
            await new Promise<void>((resolve) => {
              wake = resolve
            })
            wake = undefined
            continue
          }
          const batch = space.candidates.splice(0, 16)
          const results = await Promise.all(
            workers.flatMap((worker, index) => {
              const candidates = batch.filter((_, at) => at % workers.length === index)
              return candidates.length ? [score(worker, { candidates })] : []
            }),
          )
          if (!current()) break
          for (const result of results) {
            if (result.skipped) {
              skipped = true
              reason ??= result.reason
            }
            if (!result.best) continue
            scored = true
            if (!top || compareOutcomes(result.best.result, top.result) > 0) top = result.best
            if (!best || compareOutcomes(result.best.result, best.result) > 0) {
              best = result.best
              improved = true
            }
          }
        }
        await reading
        return { top, local }
      }
      /** Moves to the best loadout near the current one until none near it is better, and says whether it was local. */
      const climb = async (walk?: { seed: number; steps: number }) => {
        let found = await run(combatant.picks.positioned, walk)
        let here: OptimizedLoadout | undefined
        while (found.local && current() && found.top && (!here || compareOutcomes(found.top.result, here.result) > 0)) {
          here = found.top
          setProgress((previous) => Math.max(previous, Math.min(99, Math.floor(((performance.now() - started) / LOCAL_SEARCH_MS) * 100))))
          found = await run(applyOptimizedLoadout(combatant.picks.positioned, here.picks))
        }
        return found.local
      }
      if (await climb()) {
        // Climbs from random starting loadouts find what one climb from the current loadout can miss.
        for (
          let seed = 1, stale = 0;
          seed <= RESTARTS && stale < STALE_RESTARTS && current() && performance.now() - started < LOCAL_SEARCH_MS;
          seed++
        ) {
          const before = best
          await climb({ seed, steps: WALK_STEPS })
          stale = best === before ? stale + 1 : 0
        }
        notes.push('This unit has too many loadouts to compare them all, so this is the best one found by improving from several starts.')
      }
      if (!current()) return
      if (!scored) throw new Error(reason ?? 'No supported legal loadout is available.')
      if (skipped) notes.push('Loadouts with rules the simulator cannot estimate were left out.')
      job.keep()
      setProgress(100)
      setNotice(notes.join(' ') || null)
      job.cancel()
      setBusy(false)
    } catch (cause) {
      fail(errorMessage(cause, 'Optimization failed. Try again.'))
    }
  }
  return {
    available: Boolean(context) && !combatant.battleUnit,
    enabled: Boolean(context?.scoring) && combatant.ready,
    busy,
    progress,
    error,
    notice,
    optimize,
    cancel,
  }
}
