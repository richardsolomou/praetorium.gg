import { useCallback, useRef, useState } from 'react'
import { authFailureMessage } from './authFailures'
import { useHydrated } from './useClientValue'

export type AuthActionResult<T, Failure = unknown> = { data?: T | null; error?: Failure | null }

const defaultFailureMessage = (failure: unknown) => authFailureMessage(failure, 'That did not work. Try again.')

/**
 * Pending and error state for one Better Auth client call, such as a sign-in form. `busy` is also true before hydration,
 * so a submit button disabled while busy cannot post the form natively and put the password in the URL.
 */
export function useAuthAction(options: { failureMessage?: (failure: unknown) => string } = {}) {
  const failureMessage = options.failureMessage ?? defaultFailureMessage
  const hydrated = useHydrated()
  const [state, setState] = useState<{ running: boolean; error?: string }>({ running: false })
  const latest = useRef(0)

  const clearError = useCallback(() => setState((current) => ({ running: current.running })), [])
  const run = useCallback(
    async <T, Failure>(work: () => Promise<AuthActionResult<T, Failure>>): Promise<AuthActionResult<T>> => {
      const call = ++latest.current
      // Only the latest call may change the state, so a slow earlier answer cannot overwrite it.
      const settle = (error?: string) => {
        if (call === latest.current) setState(error ? { running: false, error } : { running: false })
      }
      setState({ running: true })
      try {
        const result = await work()
        settle(result.error ? failureMessage(result.error) : undefined)
        return result
      } catch (error) {
        settle(failureMessage(error))
        return { error }
      }
    },
    [failureMessage],
  )
  return { busy: !hydrated || state.running, error: state.error, clearError, run }
}
