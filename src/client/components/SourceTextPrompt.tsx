import { useEffect, useId, useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'
import type { MissingText } from '../sourceText'
import { openTextSourcesDialog } from './TextSourcesDialog'

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
export function SourceTextPrompt({ missing, className }: { missing: Exclude<MissingText, null>; className?: string }) {
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
  if (!first) return <p className={cn('text-xs text-faint', className)}>Rules text isn’t loaded.</p>
  return (
    <p className={cn('text-xs text-faint', className)}>
      Rules text isn’t loaded.{' '}
      <button type="button" className="text-info hover:text-bone" onClick={() => openTextSourcesDialog()}>
        Choose sources
      </button>
    </p>
  )
}
