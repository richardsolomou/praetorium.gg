import { useClientValue } from '../../useClientValue'
import { useMediaQuery } from '../../useMediaQuery'

const PHONE = '(max-width: 859px)'
const nativeApp = () => document.documentElement.dataset.nativeApp === 'true'

/** Whether the compact application chrome is on screen: a phone-width website, or a native application at any width. */
export function compactChrome() {
  return nativeApp() || window.matchMedia(PHONE).matches
}

/** The same answer as a value, re-rendering when the width crosses the website's compact boundary. */
export function useCompactChrome() {
  const phone = useMediaQuery(PHONE)
  return useClientValue(nativeApp, false) || phone
}
