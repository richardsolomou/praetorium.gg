import { readSessionValue, writeSessionValue } from '../../storedValue'
import { nativeNavigation, type NativeSection } from './nativeNavigation'

const TAB_PREFIX = 'praetorium.native-tab:'

type NativeTabState = { rosterPane?: unknown; rosterSnapshotPane?: unknown }

type NativeTabMemory = {
  href: string
  scrollY: number
  regions: Record<string, number>
  state?: NativeTabState
}

function rememberedState(value: unknown): NativeTabState | undefined {
  if (!value || typeof value !== 'object') return undefined
  const state: NativeTabState = {}
  if ('rosterPane' in value) state.rosterPane = value.rosterPane
  if ('rosterSnapshotPane' in value) state.rosterSnapshotPane = value.rosterSnapshotPane
  return 'rosterPane' in state || 'rosterSnapshotPane' in state ? state : undefined
}

export function tabLocation(href: string): { section: NativeSection; href: string } | null {
  const section = nativeNavigation((href.split(/[?#]/, 1)[0] ?? '') || '/').section
  return section ? { section, href } : null
}

function stored(section: NativeSection): NativeTabMemory | null {
  try {
    const value = readSessionValue(`${TAB_PREFIX}${section}`)
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<NativeTabMemory>
    if (typeof parsed.href !== 'string') return null
    const state = rememberedState(parsed.state)
    return {
      href: parsed.href,
      scrollY: typeof parsed.scrollY === 'number' ? parsed.scrollY : 0,
      regions:
        parsed.regions && typeof parsed.regions === 'object'
          ? Object.fromEntries(Object.entries(parsed.regions).filter((entry): entry is [string, number] => typeof entry[1] === 'number'))
          : {},
      ...(state ? { state } : {}),
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
  const state = rememberedState(options.state)
  const memory: NativeTabMemory = {
    href: location.href,
    scrollY: options.scrollY ?? (sameLocation ? previous.scrollY : 0),
    regions: options.regions ?? (sameLocation ? previous.regions : {}),
    ...(state ? { state } : {}),
  }
  writeSessionValue(`${TAB_PREFIX}${location.section}`, JSON.stringify(memory))
}

/** Drops a tab's memory of a location that no longer exists, so the tab reopens at its section root. */
export function forgetTab(href: string) {
  const location = tabLocation(href)
  if (!location || typeof window === 'undefined') return
  if (stored(location.section)?.href === location.href) writeSessionValue(`${TAB_PREFIX}${location.section}`, null)
}

export function recallTab(section: NativeSection) {
  return stored(section)
}
