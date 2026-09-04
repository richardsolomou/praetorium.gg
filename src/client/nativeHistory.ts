import type { NativeSection } from './nativeNavigation'

const KEY = 'praetorium.native-history'
/** One tab's worth of screens is short; the oldest entries answer nothing anybody asks. */
const KEPT = 50

type Trail = Record<string, NativeSection>

/**
 * Which tab each browser history entry belongs to.
 *
 * The application's tabs share one history stack, so going back one entry can land in
 * another tab — a roster that returns to a faction. Every entry records its section as
 * it is visited, and Back reads the entry behind the current one: same section, and it
 * is this tab's own history; anything else, and the tab's parent screen is the answer.
 *
 * `sessionStorage` because this is about one run of the application, and the index is
 * the router's own history index, which survives a reload of the same entry.
 */
function read(): Trail {
  if (typeof window === 'undefined') return {}
  try {
    const value = sessionStorage.getItem(KEY)
    if (!value) return {}
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, NativeSection] => typeof entry[1] === 'string'))
  } catch {
    return {}
  }
}

export function rememberHistorySection(index: number, section: NativeSection | undefined) {
  if (typeof window === 'undefined') return
  const trail = read()
  // A new entry replaces whatever the forward entries used to be: they are gone.
  for (const key of Object.keys(trail)) if (Number(key) > index) delete trail[key]
  if (section) trail[String(index)] = section
  else delete trail[String(index)]
  const kept = Object.entries(trail).filter(([key]) => index - Number(key) < KEPT)
  try {
    sessionStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)))
  } catch {
    // A full or blocked store only costs the tab-aware Back, so the parent screen answers.
  }
}

/** Whether going back one entry stays inside `section`. */
export function historyStaysInSection(index: number, section: NativeSection | undefined) {
  return Boolean(section) && index > 0 && read()[String(index - 1)] === section
}
