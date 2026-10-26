import { posthog } from 'posthog-js'
import { useCallback, useState } from 'react'
import { shareLink } from './nativeBridge'

/** Shares a link through the native share sheet or the clipboard, records which, and keeps the outcome to show. */
export function useShareLink(event: string) {
  const [shared, setShared] = useState<'copied' | 'shared' | null>(null)
  const [problem, setProblem] = useState<unknown>(null)
  const reset = useCallback(() => {
    setShared(null)
    setProblem(null)
  }, [])
  const share = async (url: string, title: string) => {
    reset()
    try {
      const method = await shareLink(url, title)
      setShared(method)
      posthog.capture(event, { method })
    } catch (error) {
      setProblem(error)
    }
  }
  return { shared, problem, share, reset }
}
