import { loadoutSearch } from '../../functions'
import CombatWorker from './combatWorker'
import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  compareOutcomes,
  applyOptimizedLoadout,
  type LoadoutBatch,
  type LoadoutCandidates,
  type LoadoutScoring,
  type OptimizedLoadout,
  type LoadoutOptimizationMode,
} from '../../../core/combatLoadouts'
import { LoadoutOptimizationContext } from './LoadoutOdds'
import type { Combatant } from './useCombatant'
import { errorMessage } from '../../queryClient'

export type OptimizeLoadoutRequest = { kind: 'optimize'; space: LoadoutCandidates; scoring: LoadoutScoring; mode: LoadoutOptimizationMode }
export type OptimizeLoadoutAnswer = { optimized: OptimizedLoadout; error?: never } | { error: string; optimized?: never }

/** Candidates the page scores before calling a search incomplete. */
const MAX_CANDIDATES = 20_000

export function useLoadoutOptimizer(combatant: Combatant) {
  const context = useContext(LoadoutOptimizationContext)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
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
    const pending = new Set<(reason: Error) => void>()
    let timer: ReturnType<typeof setTimeout> | undefined
    const job = {
      key,
      keep: () => {},
      cancel: () => {
        controller.abort()
        workers.forEach((worker) => worker.terminate())
        pending.forEach((reject) => reject(new Error('Optimization cancelled.')))
        pending.clear()
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
    timer = setTimeout(() => fail('The full search could not finish. The best loadout found so far has been kept.'), 120_000)
    try {
      const response = await loadoutSearch(
        {
          catalogueId: combatant.catalogueId,
          detachmentIds: combatant.detachmentIds,
          picks: combatant.picks.positioned,
          pickIndex: combatant.pickIndex,
        },
        controller.signal,
      )
      if (!response.ok || !response.body) throw new Error('The loadout could not be loaded. Try again.')
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
      let scored = 0
      let complete = false
      let improved = false
      const apply = (optimized: OptimizedLoadout) => {
        const picks = applyOptimizedLoadout(combatant.picks.positioned, optimized.picks)
        job.key = JSON.stringify([
          combatant.identity,
          picks,
          combatant.ruleSelections,
          context.key,
          optimized.preferences,
          { ranged: [], melee: [] },
        ])
        applied.current = job.key
        latest.current = job.key
        context.apply(optimized.preferences)
        combatant.picks.setPicks((currentPicks) => applyOptimizedLoadout(currentPicks, optimized.picks))
      }
      job.keep = () => {
        if (current() && improved && best) apply(best)
      }
      const score = (worker: Worker, space: LoadoutCandidates) =>
        new Promise<OptimizedLoadout>((resolve, reject) => {
          pending.add(reject)
          worker.onerror = () => {
            pending.delete(reject)
            reject(new Error('Optimization failed. Try again.'))
          }
          worker.onmessage = (event: MessageEvent<OptimizeLoadoutAnswer>) => {
            pending.delete(reject)
            if (event.data.optimized) resolve(event.data.optimized)
            else reject(new Error(event.data.error))
          }
          worker.postMessage({ kind: 'optimize', space, scoring: context.scoring!, mode } satisfies OptimizeLoadoutRequest)
        })
      const space: LoadoutCandidates = { candidates: [] }
      let discovered = 0
      let streamError: unknown
      let wake: (() => void) | undefined
      controller.signal.addEventListener('abort', () => wake?.(), { once: true })
      const process = (batch: LoadoutBatch & { error?: string }) => {
        if (batch.error) throw new Error(batch.error)
        discovered += batch.candidates.length
        // States explored of those the unit's choices allow, or of those found once the search has found more.
        const states = Math.max(batch.estimated ?? 0, batch.scheduled)
        setProgress((previous) => Math.max(previous, Math.min(99, Math.floor((batch.built / states) * 100))))
        if (discovered > MAX_CANDIDATES) throw new Error('The full search could not finish. The best loadout found so far has been kept.')
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
            if (received > 64 * 1024 * 1024)
              throw new Error('The full search could not finish. The best loadout found so far has been kept.')
            buffer += decoder.decode(next.value, { stream: !next.done })
            let newline: number
            while ((newline = buffer.indexOf('\n')) >= 0) {
              process(JSON.parse(buffer.slice(0, newline)))
              buffer = buffer.slice(newline + 1)
            }
            if (next.done) {
              if (!complete) throw new Error('The full search could not finish. The best loadout found so far has been kept.')
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
        if (!current()) return
        for (const result of results)
          if (!best || compareOutcomes(result.result, best.result) > 0) {
            best = result
            improved = true
          }
        scored += batch.length
      }
      if (!current()) return
      await reading
      if (!scored) throw new Error('No supported legal loadout is available.')
      job.keep()
      setProgress(100)
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
    optimize,
    cancel,
  }
}
