import { Link } from '@tanstack/react-router'
import { useEffect, useId, useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'
import { TEXT_SOURCES, type TextSource } from '../../shared/sourceText'
import { TEXT_SOURCE_NAMES, chooseTextSource } from '../rulesText'
import type { MissingText } from '../sourceText'

/** Words the app holds from BSData without a token, such as option lists it builds from catalogue entries. */
export const BSDATA: readonly TextSource[] = ['bsdata']

/** The prompts on screen in the order they mounted, so only the first asks and the rest say what is missing. */
const shown: string[] = []
const listeners = new Set<() => void>()
const changed = () => {
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * What stands where rules text would be before this device has loaded it.
 *
 * Praetorium publishes names and numbers; the words load in the reader's browser from
 * the community sources they choose, and one choice loads them everywhere. A page shows
 * one way to ask, at its first gap, so a datasheet does not repeat it under every rule.
 */
export function SourceTextPrompt({
  missing,
  needs,
  className,
}: {
  missing: Exclude<MissingText, null>
  /** The sources that would load this text; empty while the file list naming them has not arrived. */
  needs: readonly TextSource[]
  className?: string
}) {
  const id = useId()
  useEffect(() => {
    if (missing !== 'unchosen') return
    shown.push(id)
    changed()
    return () => {
      shown.splice(shown.indexOf(id), 1)
      changed()
    }
  }, [id, missing])
  // The server renders every prompt as the first, since it cannot know the order they mount in.
  const first = useSyncExternalStore(
    subscribe,
    () => shown[0] === id || !shown.includes(id),
    () => true,
  )
  if (missing === 'loading') return <p className={cn('text-xs text-faint', className)}>Loading rules text…</p>
  if (missing === 'unavailable') return null
  const named = needs.length ? needs : TEXT_SOURCES
  const label = needs.length
    ? `${needs.map((source) => TEXT_SOURCE_NAMES[source]).join(' and ')} text isn’t loaded.`
    : 'Rules text isn’t loaded.'
  if (!first) return <p className={cn('text-xs text-faint', className)}>{label}</p>
  return (
    <p className={cn('text-xs text-faint', className)}>
      {label}{' '}
      <button
        type="button"
        className="text-info hover:text-bone"
        onClick={() => {
          for (const source of named) chooseTextSource(source, true)
        }}
      >
        Load
      </button>
      {' · '}
      <Link to="/sources" className="text-info hover:text-bone">
        Data sources
      </Link>
    </p>
  )
}
