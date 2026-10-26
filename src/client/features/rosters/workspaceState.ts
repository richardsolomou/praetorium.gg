import { useCallback, useMemo, useState } from 'react'
import { readSessionValue, writeSessionValue } from '../../storedValue'
import { useClientValue } from '../../useClientValue'

const STATE_PREFIX = 'praetorium.workspace-state:'

/** The setup a player has open and not yet saved. */
export const SETUP_STATE = 'roster-setup'
/** Which set of waived restrictions this workspace has already been told about. */
export const WAIVERS_STATE = 'waivers-dismissed'

/** The stored text, unparsed, for rendering through `useSyncExternalStore`, which needs a value that compares equal. */
export const readStoredWorkspaceState = (path: string, name: string) => readSessionValue(`${STATE_PREFIX}${path}:${name}`)

export function parseWorkspaceState<T>(stored: string | null): T | null {
  try {
    return JSON.parse(stored ?? 'null')
  } catch {
    return null
  }
}

export function readWorkspaceState<T>(path: string, name: string): T | null {
  return parseWorkspaceState(readStoredWorkspaceState(path, name))
}

export function writeWorkspaceState(path: string, name: string, value: unknown) {
  writeSessionValue(`${STATE_PREFIX}${path}:${name}`, value === null ? null : JSON.stringify(value))
}

/** This tab's state for a workspace, read once the browser renders, and the setter that keeps it there. */
export function useWorkspaceState<T>(path: string, name: string) {
  const stored = useClientValue(() => readStoredWorkspaceState(path, name), null)
  const restored = useMemo(() => parseWorkspaceState<T>(stored), [stored])
  const [chosen, setChosen] = useState<{ path: string; value: T | null }>()
  const set = useCallback(
    (value: T | null) => {
      setChosen({ path, value })
      writeWorkspaceState(path, name, value)
    },
    [name, path],
  )
  return [chosen?.path === path ? chosen.value : restored, set] as const
}
