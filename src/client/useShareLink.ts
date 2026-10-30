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

/** A share button's text: what it will do with the `noun`, then what it did; a failed share reads as not yet shared. */
export function shareButtonLabel(shared: 'copied' | 'shared' | 'error' | null, nativeShare: boolean, noun: 'invite' | 'link') {
  if (shared === 'copied') return 'Link copied'
  if (shared === 'shared') return noun === 'invite' ? 'Invite shared' : 'Link shared'
  if (nativeShare) return noun === 'invite' ? 'Share invite' : 'Share link'
  return noun === 'invite' ? 'Copy invite link' : 'Copy link'
}
