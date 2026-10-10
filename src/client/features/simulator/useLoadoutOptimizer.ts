import { localCombatStream } from '../../offline/combatStream'
import CombatWorker from './combatWorker'
import { useContext, useEffect, useRef, useState } from 'react'
import {
  compareOutcomes,
  applyOptimizedLoadout,
  type LoadoutBatch,
  type LoadoutCandidates,
  type LoadoutScoring,
  type OptimizedLoadout,
} from '../../../core/combatLoadouts'
import { LoadoutOptimizationContext } from './LoadoutOdds'
import type { Combatant } from './useCombatant'

export type OptimizeLoadoutRequest = { kind: 'optimize'; space: LoadoutCandidates; scoring: LoadoutScoring }
export type OptimizeLoadoutAnswer = { optimized: OptimizedLoadout; error?: never } | { error: string; optimized?: never }

export function useLoadoutOptimizer(combatant: Combatant) {
  const context = useContext(LoadoutOptimizationContext)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const active = useRef<{ cancel: () => void; key: string } | null>(null)
  const key = JSON.stringify([
    combatant.identity,
    combatant.picks.positioned,
    combatant.ruleSelections,
    context?.key,
    context?.preferences,
    context?.excluded,
  ])
  const latest = useRef(key)
  latest.current = key
  useEffect(() => {
    if (active.current?.key === key) return
    active.current?.cancel()
    setBusy(false)
    setProgress(0)
    setError(null)
  }, [key])
  useEffect(() => () => active.current?.cancel(), [])
  const cancel = () => {
    active.current?.cancel()
    setBusy(false)
    setProgress(0)
  }
  const optimize = async () => {
    if (!context?.scoring || !combatant.ready || active.current || combatant.battleUnit) return
    const controller = new AbortController()
    const workers: Worker[] = []
    const pending = new Set<(reason: Error) => void>()
    let timer: ReturnType<typeof setTimeout> | undefined
    const job = {
      key,
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
      const input = {
        catalogueId: combatant.catalogueId,
        detachmentIds: combatant.detachmentIds,
        picks: combatant.picks.positioned,
        pickIndex: combatant.pickIndex,
      }
      const response =
        localCombatStream(input, controller.signal) ??
        (await fetch('/api/simulator/optimize', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            catalogueId: combatant.catalogueId,
            detachmentIds: combatant.detachmentIds,
            picks: combatant.picks.positioned,
            pickIndex: combatant.pickIndex,
          }),
        }))
      if (!response.ok || !response.body) throw new Error('The loadout could not be loaded. Try again.')
      const count = Math.min(4, Math.max(1, navigator.hardwareConcurrency ?? 2))
      for (let at = 0; at < count; at++) workers.push(new CombatWorker())
      let best: OptimizedLoadout | undefined =
        context.result && combatant.pick
          ? {
              picks: [combatant.pickIndex, ...(combatant.sheets.data?.companions ?? []).map((member) => member.pickIndex)].map(
                (pickIndex) => ({ pickIndex, pick: combatant.picks.positioned[pickIndex]! }),
              ),
              preferences: context.preferences,
              result: context.result,
            }
          : undefined
      let scored = 0
      let complete = false
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
        latest.current = job.key
        combatant.picks.setPicks((currentPicks) => applyOptimizedLoadout(currentPicks, optimized.picks))
        context.apply(optimized.preferences)
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
          worker.postMessage({ kind: 'optimize', space, scoring: context.scoring! } satisfies OptimizeLoadoutRequest)
        })
      const space: LoadoutCandidates = { candidates: [] }
      let discovered = 0
      let built = 0
      let scheduled = 0
      const updateProgress = () => {
        // The unfinished search can discover more work, so estimate from its current frontier.
        const expectedCandidates = built ? Math.max(discovered, (scheduled * discovered) / built) : 0
        const work = scheduled + expectedCandidates
        const percentage = work ? Math.min(99, Math.floor(((built + scored) / work) * 100)) : 0
        setProgress((previous) => Math.max(previous, percentage))
      }
      let streamError: unknown
      let wake: (() => void) | undefined
      controller.signal.addEventListener('abort', () => wake?.(), { once: true })
      const process = (batch: LoadoutBatch & { error?: string }) => {
        if (batch.error) throw new Error(batch.error)
        discovered += batch.candidates.length
        if (discovered > 20_000) throw new Error('The full search could not finish. The best loadout found so far has been kept.')
        space.candidates.push(...batch.candidates)
        complete = batch.done
        built = batch.built
        scheduled = batch.scheduled
        updateProgress()
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
        let improved = false
        for (const result of results)
          if (!best || compareOutcomes(result.result, best.result) > 0) {
            best = result
            improved = true
          }
        if (improved && best) apply(best)
        scored += batch.length
        updateProgress()
      }
      if (!current()) return
      await reading
      if (!scored) throw new Error('No supported legal loadout is available.')
      setProgress(100)
      job.cancel()
      setBusy(false)
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : 'Optimization failed. Try again.')
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
