import { useQueryClient } from '@tanstack/react-query'
import posthog from 'posthog-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Command, SubmitResult } from '../core/battle'
import { submit } from '../server/functions'
import { battleQuery } from './queries'
import { errorMessage } from './queryClient'

function explain(result: SubmitResult) {
  if (result.outcome === 'appended') return null
  // A lost race is not a mistake, so it says what happened rather than what the
  // player did wrong. The screen that comes with it leaves them able to tap again.
  if (result.outcome === 'stale') return 'Your opponent got there first. Try that again.'
  return result.reason
}

/**
 * Sends commands one at a time, each conditional on the history the last one left.
 *
 * A refusal and a lost race are both answers rather than failures: the domain's
 * own wording goes on screen, and the answer carries the battle as it now stands,
 * so the page is never left acting on what it has already changed.
 *
 * They queue rather than block. `expectedSeq` covers the whole log, so two of a
 * player's own taps would otherwise race each other, and the only way to stop that
 * was to disable every control on the page until each round trip came back —
 * which made the whole battle flicker on every press. Sending in order removes the
 * race instead of hiding it, and leaves a stale answer meaning what it says: the
 * opponent moved.
 */
export function useCommand(token: string, seq: number) {
  const queryClient = useQueryClient()
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  /** The history this hook last saw, which runs ahead of props between renders. */
  const seen = useRef(seq)
  const queued = useRef<{ command: Command; basedOn: number }[]>([])
  const draining = useRef(false)

  useEffect(() => {
    seen.current = Math.max(seen.current, seq)
  }, [seq])

  const drain = useCallback(async () => {
    if (draining.current) return
    draining.current = true
    try {
      while (queued.current.length) {
        const item = queued.current.shift()
        if (!item) break
        try {
          const { result, screen } = await submit({ data: { token, expectedSeq: seen.current, command: item.command } })
          setProblem(explain(result))
          queryClient.setQueryData(battleQuery(token).queryKey, screen)
          if (screen?.kind === 'battle') seen.current = Math.max(seen.current, screen.view.seq)
          void queryClient.invalidateQueries({ queryKey: ['report', token] })
          if (result.outcome !== 'appended') {
            const authoritativeSeq = screen?.kind === 'battle' ? screen.view.seq : item.basedOn
            queued.current = queued.current.filter(
              (candidate) => candidate.basedOn !== item.basedOn && candidate.basedOn >= authoritativeSeq,
            )
          }
        } catch (error) {
          posthog.captureException(error, { operation: 'battle_command' })
          // Whatever was behind this one was written against a history that never happened.
          setProblem(errorMessage(error))
          queued.current = []
        }
      }
    } finally {
      draining.current = false
      setPending(false)
    }
  }, [queryClient, token])

  const send = useCallback(
    (command: Command) => {
      queued.current.push({ command, basedOn: seq })
      setPending(true)
      void drain()
    },
    [drain, seq],
  )

  return { send, problem, pending }
}
