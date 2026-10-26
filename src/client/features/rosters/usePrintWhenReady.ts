import { useEffect, useRef } from 'react'

/** Opens the print dialog once `ready` holds and the fonts have loaded, and only once. */
export function usePrintWhenReady(ready: boolean) {
  const printed = useRef(false)
  useEffect(() => {
    if (!ready || printed.current) return
    let cancelled = false
    void document.fonts.ready.then(() => {
      if (cancelled) return
      printed.current = true
      window.print()
    })
    return () => {
      cancelled = true
    }
  }, [ready])
}
