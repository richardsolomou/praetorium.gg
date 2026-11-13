import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { posthog } from 'posthog-js'
import type { CombatAnswer, CombatRequest } from '../../../core/combatMatchup'
import { calculateCombatPair } from './combatCalculation'

export type CombatEntryPoint = 'standalone' | 'roster' | 'battle'

/** `refused` is whether the combined estimate's error is the matchup's own refusal rather than a failed calculation. */
export function combatOutcomeEvent(answer: CombatAnswer, source: CombatEntryPoint, refused = false) {
  const shooting = Boolean(answer.ranged?.result)
  const melee = Boolean(answer.melee?.result)
  const combined = !answer.combined ? 'none' : answer.combined.result ? 'calculated' : refused ? 'refused' : 'failed'
  if (shooting || melee) return { name: 'combat_simulation_completed', properties: { source, shooting, melee, combined } } as const
  if (answer.ranged?.error || answer.melee?.error)
    return { name: 'combat_simulation_failed', properties: { source, reason: 'calculation' } } as const
  return null
}

/** Calculates the matchup's estimate, and the same estimate without a Command Re-roll when one is spent, and reports how it went. */
export function useCombatOutcome({
  scenarios,
  scenariosWithout,
  pending,
  failed,
  choosing,
  retry,
  entryPoint,
  onCompleted,
}: {
  scenarios: CombatRequest
  scenariosWithout: CombatRequest | null
  pending: boolean
  failed: boolean
  choosing: boolean
  retry: number
  entryPoint: CombatEntryPoint
  onCompleted?: () => void
}) {
  const [outcome, setOutcome] = useState<{ key: string; attempt: number; answer: CombatAnswer; without?: CombatAnswer } | null>(null)
  const reported = useRef(false)
  const completed = useEffectEvent(() => onCompleted?.())
  const failureReported = useRef(false)
  const requestKey = JSON.stringify(scenarios)
  const comparisonKey = JSON.stringify(scenariosWithout)
  const canSimulate = Boolean(scenarios.ranged || scenarios.melee)
  const outcomeKey = `${requestKey}\n${comparisonKey}`
  const updating = pending || choosing || (canSimulate && (outcome?.key !== outcomeKey || outcome?.attempt !== retry))
  useEffect(() => {
    if (pending || failed || choosing) return
    const request = JSON.parse(requestKey) as CombatRequest
    const comparison = JSON.parse(comparisonKey) as CombatRequest | null
    if (!request.ranged && !request.melee) return
    const controller = new AbortController()
    const key = `${requestKey}\n${comparisonKey}`
    void Promise.all([calculateCombatPair(request, controller.signal), comparison && calculateCombatPair(comparison, controller.signal)])
      .then(([answer, without]) => {
        if (controller.signal.aborted) return
        setOutcome({ key, attempt: retry, answer, ...(without ? { without } : {}) })
        const telemetry = combatOutcomeEvent(answer, entryPoint, Boolean(request.sequenceError))
        if (telemetry?.name === 'combat_simulation_completed') completed()
        if (telemetry?.name === 'combat_simulation_completed' && !reported.current) {
          reported.current = true
          posthog.capture(telemetry.name, telemetry.properties)
        } else if (telemetry?.name === 'combat_simulation_failed' && !failureReported.current) {
          failureReported.current = true
          posthog.capture(telemetry.name, telemetry.properties)
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setOutcome({
          key,
          attempt: retry,
          answer: {
            ranged: request.ranged ? { error: 'The calculation failed. Try again.' } : null,
            melee: request.melee ? { error: 'The calculation failed. Try again.' } : null,
          },
        })
        if (!failureReported.current) {
          failureReported.current = true
          posthog.capture('combat_simulation_failed', { source: entryPoint, reason: 'calculation' })
        }
      })
    const stop = () => controller.abort()
    return stop
  }, [requestKey, comparisonKey, pending, failed, choosing, retry, entryPoint])
  /** The outcome only when it answers the current settings; the results keep showing the last one while a new one calculates. */
  const currentOutcome = outcome?.key === outcomeKey ? outcome : null
  return { outcome, currentOutcome, updating }
}
