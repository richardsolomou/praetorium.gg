import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
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
 */
export function useCommand(token: string, seq: number) {
  const queryClient = useQueryClient()
  const [problem, setProblem] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (command: Command) => submit({ data: { token, expectedSeq: seq, command } }),
    onSuccess: (result) => {
      setProblem(explain(result))
      void queryClient.invalidateQueries({ queryKey: battleQuery(token).queryKey })
    },
    onError: (error) => setProblem(errorMessage(error)),
  })

  return { send: mutation.mutate, problem, pending: mutation.isPending }
}
