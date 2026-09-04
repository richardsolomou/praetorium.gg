import { useQueryClient } from '@tanstack/react-query'
import posthog from 'posthog-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Command, SubmitResult } from '../core/battle'
import { isSignedOut } from '../core/session'
import { submit } from '../server/functions'
import { battleQuery, meQuery } from './queries'
import { errorMessage } from './queryClient'
import { requestNativeHaptic } from './nativeBridge'

type SubmittedCommand = Command | { kind: 'attach-saved-roster'; rosterId: string; playerId?: string }
export type SendCommand = (command: Command, options?: { background?: boolean }) => void
type QueuedCommand = { command: SubmittedCommand; basedOn: number; background?: boolean; complete?: (appended: boolean) => void }

function explain(result: SubmitResult, setup: boolean) {
  if (result.outcome === 'appended') return null
  if (result.outcome === 'stale' && setup) return null
  // Shared setup redraws from the winner; live controls remain available to retry.
  if (result.outcome === 'stale') return 'Your opponent got there first. Try that again.'
  return result.reason
}

/**
 * Sends commands sequentially against the latest history this device has seen.
 *
 * Every response carries the authoritative screen. Refusals remain visible, setup
 * collisions quietly redraw, and live collisions ask the player to retry. The queue
 * prevents one device's taps from racing under the battle-wide `expectedSeq`.
 */
export function useCommand(token: string, seq: number) {
  const queryClient = useQueryClient()
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  /** The history this hook last saw, which runs ahead of props between renders. */
  const seen = useRef(seq)
  const queued = useRef<QueuedCommand[]>([])
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
          const setup = screen?.kind === 'battle' && screen.view.status === 'setup'
          if (!item.background || result.outcome === 'refused') setProblem(explain(result, setup))
          queryClient.setQueryData(battleQuery(token).queryKey, screen)
          if (screen?.kind === 'battle') seen.current = Math.max(seen.current, screen.view.seq)
          void queryClient.invalidateQueries({ queryKey: ['report', token] })
          item.complete?.(result.outcome === 'appended')
          if (result.outcome === 'appended' && !item.background) requestNativeHaptic()
          if (result.outcome !== 'appended') {
            const authoritativeSeq = screen?.kind === 'battle' ? screen.view.seq : item.basedOn
            const kept: QueuedCommand[] = []
            for (const candidate of queued.current) {
              if (candidate.basedOn !== item.basedOn && candidate.basedOn >= authoritativeSeq) kept.push(candidate)
              else candidate.complete?.(false)
            }
            queued.current = kept
          }
        } catch (error) {
          // Whatever was behind this one was written against a history that never happened.
          item.complete?.(false)
          for (const candidate of queued.current) candidate.complete?.(false)
          queued.current = []
          if (isSignedOut(error)) {
            /*
             * A session that lapsed mid-battle is an answer like any other. Asking
             * again who is playing and what this battle looks like turns the page
             * into the unavailable screen, which offers sign-in with this battle as the
             * destination — so the player gets a way back into the game they were
             * in the middle of, rather than a sentence they cannot act on.
             */
            console.info({ event: 'battle_command_signed_out' })
            setProblem(null)
            void queryClient.invalidateQueries({ queryKey: meQuery().queryKey })
            void queryClient.invalidateQueries({ queryKey: battleQuery(token).queryKey })
          } else {
            posthog.captureException(error, { operation: 'battle_command' })
            setProblem(errorMessage(error))
          }
        }
      }
    } finally {
      draining.current = false
      setPending(false)
    }
  }, [queryClient, token])

  const send = useCallback(
    (command: Command, options?: { background?: boolean }) => {
      queued.current.push({ command, basedOn: seq, background: options?.background })
      if (!options?.background) setPending(true)
      void drain()
    },
    [drain, seq],
  )

  const attachSavedRoster = useCallback(
    (rosterId: string, playerId?: string) =>
      new Promise<boolean>((complete) => {
        queued.current.push({
          command: { kind: 'attach-saved-roster', rosterId, ...(playerId ? { playerId } : {}) },
          basedOn: seq,
          complete,
        })
        setProblem(null)
        setPending(true)
        void drain()
      }),
    [drain, seq],
  )

  return { send, attachSavedRoster, problem, pending }
}
