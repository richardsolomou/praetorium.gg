import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { Command } from '../core/battle'
import type { SubmitResult } from '../db/repository'
import { submit } from '../server/fns'
import { battleQuery } from './queries'
import { errorMessage } from './queryClient'

function explain(result: SubmitResult) {
  if (result.outcome === 'appended') return null
  // A lost race is not a mistake, so it says what happened rather than what the
  // player did wrong. The refetch that follows leaves them able to just tap again.
  if (result.outcome === 'stale') return 'Your opponent got there first. Try that again.'
  return result.reason
}

/**
 * Sends one command, conditional on the history the page is currently showing.
 *
 * A refusal and a lost race are both answers rather than failures: the domain's
 * own wording goes on screen, and every outcome refetches instead of assuming
 * what the server did with it.
 *
 * The seq it sends is the later of what the page is showing and what the server
 * reported for this page's own last accepted command. The refetch behind a
 * command lands a round trip after the command itself, so a player mustering —
 * attach a list, save the prep, pick the battlefield — would otherwise lose the
 * race to nobody but themselves, and be told their opponent got there first.
 * Only an accepted seq is adopted: a lost race still has to be tapped again.
 */
export function useCommand(token: string, seq: number) {
  const queryClient = useQueryClient()
  const [problem, setProblem] = useState<string | null>(null)
  const own = useRef({ token, seq: 0 })
  const mutation = useMutation({
    mutationFn: (command: Command) => {
      if (own.current.token !== token) own.current = { token, seq: 0 }
      return submit({ data: { token, expectedSeq: Math.max(seq, own.current.seq), command } })
    },
    onSuccess: (result) => {
      if (result.outcome === 'appended') own.current = { token, seq: result.seq }
      setProblem(explain(result))
      void queryClient.invalidateQueries({ queryKey: battleQuery(token).queryKey })
    },
    onError: (error) => setProblem(errorMessage(error)),
  })

  return { send: mutation.mutate, problem, pending: mutation.isPending }
}
