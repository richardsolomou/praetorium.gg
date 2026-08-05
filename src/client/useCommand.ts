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
  // player did wrong. The screen that comes with it leaves them able to tap again.
  if (result.outcome === 'stale') return 'Your opponent got there first. Try that again.'
  return result.reason
}

/**
 * Sends one command, conditional on the history the page is currently showing.
 *
 * A refusal and a lost race are both answers rather than failures: the domain's
 * own wording goes on screen, and the answer carries the battle as it now stands,
 * so the page is never left acting on what it has already changed. Waiting for a
 * refetch to say so is a round trip during which the page holds a view older than
 * its own last command — which sent a stale seq, and named the wrong command to
 * undo. Invisible on localhost; the ordinary case across the internet, where
 * setting a battle up is several commands in a row.
 */
export function useCommand(token: string, seq: number) {
  const queryClient = useQueryClient()
  const [problem, setProblem] = useState<string | null>(null)
  const mutation = useMutation({
    mutationFn: (command: Command) => submit({ data: { token, expectedSeq: seq, command } }),
    onSuccess: ({ result, screen }) => {
      setProblem(explain(result))
      queryClient.setQueryData(battleQuery(token).queryKey, screen)
    },
    onError: (error) => setProblem(errorMessage(error)),
  })

  return { send: mutation.mutate, problem, pending: mutation.isPending }
}
