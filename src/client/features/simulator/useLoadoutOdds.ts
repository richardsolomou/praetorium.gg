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
  const [found, setFound] = useState<{ request: string; odds: LoadoutOdds | null } | null>(null)
  useEffect(() => {
    if (!request) return
    let worker: Worker
    try {
      worker = new CombatWorker()
    } catch {
      return
    }
    worker.onmessage = (event: MessageEvent<LoadoutOdds>) => {
      setFound({ request, odds: event.data })
      worker.terminate()
    }
    worker.onerror = () => {
      setFound({ request, odds: null })
      worker.terminate()
    }
    worker.postMessage({ kind: 'loadouts', ...JSON.parse(request) } as LoadoutOddsRequest)
    return () => worker.terminate()
  }, [request])
  if (found?.request === request) return found.odds
  return found?.odds ? { ...found.odds, updating: true } : null
}
