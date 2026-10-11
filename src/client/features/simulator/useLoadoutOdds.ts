import CombatWorker from './combatWorker'
import { useEffect, useState } from 'react'
import type { LoadoutScoring, LoadoutSpace, OptionEstimate, ProfileOdds } from '../../../core/combatLoadouts'
import type { CombatRequest } from '../../../core/combatMatchup'

export type LoadoutOddsRequest = { kind: 'loadouts'; space: LoadoutSpace; scoring: LoadoutScoring; expected: CombatRequest }
export type LoadoutOdds = {
  estimates: ReadonlyMap<string, OptionEstimate>
  profiles: ReadonlyMap<string, ProfileOdds>
  /** The previous answer, shown while the current loadout is scored. */
  updating?: boolean
  error?: string
  retry?: () => void
}

/**
 * Scores the attacker's weapon options and profiles against the current target in a worker. An edit keeps
 * the last answer in place, marked as updating, so the loadout editor does not reflow while it is scored.
 */
export function useLoadoutOdds({
  space,
  scoring,
  expected,
}: {
  space: LoadoutSpace | null | undefined
  scoring: LoadoutScoring | null
  expected: CombatRequest
}): LoadoutOdds | null {
  const request = space && scoring ? JSON.stringify({ space, scoring, expected }) : null
  const [attempt, setAttempt] = useState(0)
  const [found, setFound] = useState<{ request: string; attempt: number; odds: LoadoutOdds; error?: string } | null>(null)
  useEffect(() => {
    if (!request) return
    let active = true
    let worker: Worker | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = () => {
      if (!active) return
      active = false
      worker?.terminate()
      clearTimeout(timer)
    }
    const fail = (error: string) => {
      if (!active) return
      setFound((previous) => ({
        request,
        attempt,
        odds: previous?.odds ?? { estimates: new Map(), profiles: new Map() },
        error,
      }))
      stop()
    }
    try {
      worker = new CombatWorker()
      worker.onmessage = (event: MessageEvent<LoadoutOdds>) => {
        if (active) setFound({ request, attempt, odds: event.data })
        stop()
      }
      const failed = () => fail('The loadout comparison failed. Try again.')
      worker.onerror = failed
      worker.onmessageerror = failed
      timer = setTimeout(() => fail('The loadout comparison took too long. Try again.'), 15_000)
      worker.postMessage({ kind: 'loadouts', ...JSON.parse(request) } as LoadoutOddsRequest)
    } catch {
      fail('The loadout comparison could not start. Try again.')
    }
    return stop
  }, [request, attempt])
  if (!request) return null
  if (found?.request === request && found.attempt === attempt)
    return found.error
      ? { ...found.odds, updating: false, error: found.error, retry: () => setAttempt((current) => current + 1) }
      : found.odds
  return found?.odds ? { ...found.odds, updating: true } : null
}
