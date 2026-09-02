import { nativeNavigation, type NativeSection } from './nativeNavigation'

const TAB_PREFIX = 'praetorium.native-tab:'

/**
 * Where a tab was left, and the section that owns it.
 *
 * A player moves between a roster and the datasheets behind it constantly, so a tab
 * is a place to come back to rather than a link to the top of a section. The hash
 * goes: a roster's open pane lives in history state this cannot carry, and a
 * restored `#roster-pane` would name a pane that is not open. A location belonging
 * to no section belongs to no tab.
 */
export function tabLocation(href: string): { section: NativeSection; href: string } | null {
  const location = href.split('#')[0] ?? ''
  const section = nativeNavigation(location.split('?')[0] ?? '').section
  return section ? { section, href: location } : null
}

export function rememberTab(href: string) {
  const location = tabLocation(href)
  if (location) sessionStorage.setItem(`${TAB_PREFIX}${location.section}`, location.href)
}

export function recallTab(section: NativeSection) {
  if (typeof window === 'undefined') return null
  try {
    return sessionStorage.getItem(`${TAB_PREFIX}${section}`)
  } catch {
    return null
  }
}
