import { type QueryClient, useQueryClient } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import type { z } from 'zod'
import type { Command, SubmitResult } from '../../../core/battle'
import type { saveRosterSchema } from '../../../contracts/schemas'
import { isRosterNotUsable } from '../../../core/rosterUse'
import { OfflineRefusal } from '../../offline/offlineRefusal'
import { isSignedOut } from '../../../core/session'
import { submit } from '../../functions'
import { battleQuery, meQuery, reportKey } from '../../queries'
import { errorMessage } from '../../queryClient'
import { requestNativeHaptic } from '../../nativeBridge'
import { captureAppSnapshot } from '../../offline/appSnapshot'
import { writeAppSnapshot } from '../../offline/appStorage'
import { isFetchNetworkFailure } from '../../networkErrors'
import { sendingBattleCommands } from '../../pendingWrites'
import { predictedBattle, savedBattleAt } from '../../offline/battleFunctions'
import type { AbilityReminder } from '../../../core/reminders'
import { asSentence } from '../../text'

/** A list the server prices and freezes before it is attached: a saved one, or the draft a guest built on this device. */
export type RosterAttachment =
  | { kind: 'attach-saved-roster'; rosterId: string; playerId?: string }
  | { kind: 'attach-draft-roster'; draft: RosterDraftInput; reminders: AbilityReminder[] | undefined }
type SubmittedCommand = Command | RosterAttachment
export type SendCommand = (
  command: Command,
  /** `blocking: false` leaves other controls enabled while it is in flight, for presses meant to be repeated. */
  options?: { background?: boolean; blocking?: boolean; complete?: (appended: boolean) => void },
) => void
type RosterDraftInput = z.input<typeof saveRosterSchema>
type QueuedCommand = { command: SubmittedCommand; basedOn: number; background?: boolean; complete?: (appended: boolean) => void }
type Prediction = NonNullable<ReturnType<typeof predictedBattle>>
/** The newest screen worked out on this device as the cache holds it, and the service's screen to return to if a command throws. */
type Projection = { battle: Prediction; shown: unknown; confirmed: unknown }

/** Screens worked out on this device ahead of the service's answer, with the sequence the service last confirmed. */
const predictions = new WeakMap<object, number>()

/** The sequence the service last confirmed for `screen`, which commands are queued against while a prediction shows. */
export const confirmedSeq = (screen: { view: { seq: number } }) => predictions.get(screen) ?? screen.view.seq

function explain(result: SubmitResult, setup: boolean) {
  if (result.outcome === 'appended') return null
  if (result.outcome === 'stale' && setup) return null
  // Shared setup redraws from the winner; live controls remain available to retry.
  if (result.outcome === 'stale') return 'Your opponent got there first. Try that again.'
  return asSentence(result.reason)
}

/**
 * What survives in the queue after a command comes back stale or refused.
 *
 * Work built from the same or an older screen is dropped rather than resent against a
 * history its player never saw, while work built from a newer realtime screen stays.
 * A failed automatic background write is the exception: it records facts the armies
 * already settle, so the player's own commands queued behind it are kept.
 */
export function afterFailedCommand<T extends Pick<QueuedCommand, 'basedOn' | 'background'>>(
  queued: readonly T[],
  failed: Pick<QueuedCommand, 'basedOn' | 'background'>,
  authoritativeSeq: number,
): { kept: T[]; dropped: T[] } {
  if (failed.background) return { kept: [...queued], dropped: [] }
  const kept = queued.filter((candidate) => candidate.basedOn !== failed.basedOn && candidate.basedOn >= authoritativeSeq)
  return { kept, dropped: queued.filter((candidate) => !kept.includes(candidate)) }
}

/**
 * Sends queued commands one at a time, each against the newest history this device has seen. Queued commands live only
 * in this page, so automatic reloads wait until the queue is empty, including between sends.
 */
export function drainCommands(args: Parameters<typeof sendQueued>[0]) {
  if (args.draining.current) return Promise.resolve()
  return sendingBattleCommands(args.token, sendQueued(args))
}

async function sendQueued({
  token,
  queryClient,
  seen,
  queued,
  draining,
  setPending,
  setProblem,
  projection,
  unshown,
}: {
  token: string
  queryClient: QueryClient
  seen: RefObject<number>
  queued: RefObject<QueuedCommand[]>
  draining: RefObject<boolean>
  setPending: (pending: boolean) => void
  setProblem: (problem: string | null) => void
  projection?: RefObject<Projection | null>
  unshown?: RefObject<Set<QueuedCommand>>
}) {
  draining.current = true
  try {
    while (queued.current.length) {
      const item = queued.current.shift()
      if (!item) break
      seen.current = Math.max(seen.current, item.basedOn)
      try {
        const { result, screen } = await submit({ data: { token, expectedSeq: seen.current, command: item.command } })
        const setup = screen?.kind === 'battle' && screen.view.status === 'setup'
        if (!item.background || result.outcome === 'refused') setProblem(explain(result, setup))
        // A realtime refetch that landed while this command was in flight can hold a newer screen than its answer, and so can
        // the predictions of commands queued behind it, unless this one failed and they are about to be dropped.
        queryClient.setQueryData(battleQuery(token).queryKey, (held) =>
          held?.kind === 'battle' &&
          screen?.kind === 'battle' &&
          held.view.seq > screen.view.seq &&
          (result.outcome === 'appended' || !predictions.has(held))
            ? held
            : screen,
        )
        if (projection?.current && screen?.kind === 'battle') projection.current.confirmed = screen
        if (screen?.kind === 'battle') seen.current = Math.max(seen.current, screen.view.seq)
        // Before the snapshot write yields, so the screen and anything shown ahead of it change in one render.
        item.complete?.(result.outcome === 'appended')
        void queryClient.invalidateQueries({ queryKey: reportKey(token) })
        await writeAppSnapshot(captureAppSnapshot(queryClient)).catch(() => {})
        if (result.outcome === 'appended' && !item.background) requestNativeHaptic()
        if (result.outcome !== 'appended') {
          const authoritativeSeq = screen?.kind === 'battle' ? screen.view.seq : item.basedOn
          const { kept, dropped } = afterFailedCommand(queued.current, item, authoritativeSeq)
          for (const candidate of dropped) candidate.complete?.(false)
          queued.current = kept
        }
      } catch (error) {
        // Whatever was behind this one was written against a history that never happened.
        const confirmed = projection?.current?.confirmed
        if (confirmed)
          queryClient.setQueryData(battleQuery(token).queryKey, (held) => (held && predictions.has(held) ? confirmed : held) as never)
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
        } else if (isFetchNetworkFailure(error)) {
          setProblem('Check your connection and try again.')
        } else {
          if (!isRosterNotUsable(error) && !(error instanceof OfflineRefusal))
            posthog.captureException(error, { operation: 'battle_command' })
          setProblem(errorMessage(error))
        }
      }
    }
  } finally {
    draining.current = false
    unshown?.current.clear()
    setPending(false)
  }
}

/** Shows `command`'s result from the history on this device, on top of any result already shown ahead of the service. */
export async function showPrediction(
  { token, queryClient, projection }: { token: string; queryClient: QueryClient; projection: RefObject<Projection | null> },
  command: Command,
) {
  const key = battleQuery(token).queryKey
  const held = queryClient.getQueryData(key)
  if (held?.kind !== 'battle') return false
  const base = projection.current?.shown === held ? projection.current.battle : await savedBattleAt(token, held.view.seq)
  const battle = base && predictedBattle(base, command)
  // The service answered meanwhile, so its screen stays.
  if (!battle || queryClient.getQueryData(key) !== held) return false
  const confirmed = predictions.has(held) ? projection.current?.confirmed : held
  // The cache keeps its own copy of what it is given.
  const shown = queryClient.setQueryData(key, battle.screen)!
  predictions.set(shown, confirmedSeq(held))
  projection.current = { battle, shown, confirmed }
  return true
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
  const projection = useRef<Projection | null>(null)
  /** Blocking commands whose result is not on screen yet, which keep the controls disabled. */
  const unshown = useRef(new Set<QueuedCommand>())
  const predicting = useRef(Promise.resolve())

  useEffect(() => {
    seen.current = Math.max(seen.current, seq)
  }, [seq])

  const drain = useCallback(
    () => drainCommands({ token, queryClient, seen, queued, draining, setPending, setProblem, projection, unshown }),
    [queryClient, token],
  )

  const send: SendCommand = useCallback(
    (command, options) => {
      const item: QueuedCommand = { command, basedOn: seq, background: options?.background, complete: options?.complete }
      queued.current.push(item)
      if (!options?.background && options?.blocking !== false) {
        unshown.current.add(item)
        setPending(true)
      }
      if (!options?.background)
        predicting.current = predicting.current
          .then(() => showPrediction({ token, queryClient, projection }, command))
          .then((shown) => {
            if (!shown || !unshown.current.delete(item)) return
            if (!unshown.current.size) setPending(false)
          })
          .catch(() => {})
      void drain()
    },
    [drain, queryClient, seq, token],
  )

  const attachRoster = useCallback(
    (command: RosterAttachment) =>
      new Promise<boolean>((complete) => {
        queued.current.push({ command, basedOn: seq, complete })
        setProblem(null)
        setPending(true)
        void drain()
      }),
    [drain, seq],
  )

  return { send, attachRoster, problem, pending }
}
