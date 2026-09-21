import { useLayoutEffect, useState } from 'react'

/** Whether the compact application chrome is on screen: a phone-width website, or a native application at any width. */
export function compactChrome() {
  return document.documentElement.dataset.nativeApp === 'true' || window.matchMedia('(max-width: 859px)').matches
}

/** The same answer as a value, re-rendering when the width crosses the website's compact boundary. */
export function useCompactChrome() {
  const [compact, setCompact] = useState(false)

  useLayoutEffect(() => {
    const phone = window.matchMedia('(max-width: 859px)')
    const sync = () => setCompact(compactChrome())
    sync()
    phone.addEventListener('change', sync)
    return () => phone.removeEventListener('change', sync)
  }, [])

  return compact
}
