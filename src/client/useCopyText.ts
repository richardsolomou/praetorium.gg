import { posthog } from 'posthog-js'
import { useCallback, useRef, useState } from 'react'

/** Clipboard writes whose outcome is shown, where only the latest attempt may set `copied` or `problem`. */
export function useCopyText() {
  const [copied, setCopied] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const attempt = useRef(0)
  const reset = useCallback(() => {
    attempt.current++
    setCopied(false)
    setProblem(null)
  }, [])
  /** Resolves whether the text reached the clipboard. */
  const copy = async (text: string, { failure, operation }: { failure: string; operation: string }) => {
    reset()
    const current = attempt.current
    try {
      await navigator.clipboard.writeText(text)
      if (current === attempt.current) setCopied(true)
      return true
    } catch (error) {
      posthog.captureException(error, { operation })
      if (current === attempt.current) setProblem(failure)
      return false
    }
  }
  return { copy, copied, problem, reset }
}
