import { nativeNavigation, type NativeSection } from './nativeNavigation'

const TAB_PREFIX = 'praetorium.native-tab:'

export type NativeTabMemory = {
  href: string
  scrollY: number
  regions: Record<string, number>
  state?: { rosterPane: unknown }
}

export function tabLocation(href: string): { section: NativeSection; href: string } | null {
  const section = nativeNavigation((href.split(/[?#]/, 1)[0] ?? '') || '/').section
  return section ? { section, href } : null
}

function stored(section: NativeSection): NativeTabMemory | null {
  if (typeof window === 'undefined') return null
  try {
    const value = sessionStorage.getItem(`${TAB_PREFIX}${section}`)
    if (!value) return null
    if (!value.startsWith('{')) return { href: value, scrollY: 0, regions: {} }
    const parsed = JSON.parse(value) as Partial<NativeTabMemory>
    if (typeof parsed.href !== 'string') return null
    return {
      href: parsed.href,
      scrollY: typeof parsed.scrollY === 'number' ? parsed.scrollY : 0,
      regions:
        parsed.regions && typeof parsed.regions === 'object'
          ? Object.fromEntries(Object.entries(parsed.regions).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
          : {},
      ...(parsed.state && typeof parsed.state === 'object' && 'rosterPane' in parsed.state
        ? { state: { rosterPane: parsed.state.rosterPane } }
        : {}),
    }
  } catch {
    return null
  }
}

export function rememberTab(href: string, options: { scrollY?: number; regions?: Record<string, number>; state?: unknown } = {}) {
  const location = tabLocation(href)
  if (!location || typeof window === 'undefined') return
  const previous = stored(location.section)
  const sameLocation = previous?.href === location.href
  const state = options.state
  const rosterPane =
    state && typeof state === 'object' && 'rosterPane' in state ? (state as { rosterPane?: unknown }).rosterPane : undefined
  const memory: NativeTabMemory = {
    href: location.href,
    scrollY: options.scrollY ?? (sameLocation ? previous.scrollY : 0),
    regions: options.regions ?? (sameLocation ? previous.regions : {}),
    ...(rosterPane ? { state: { rosterPane } } : {}),
  }
  sessionStorage.setItem(`${TAB_PREFIX}${location.section}`, JSON.stringify(memory))
}

export function recallTab(section: NativeSection) {
  return stored(section)
}
