import { writeSessionValue } from '../../storedValue'

const STATE_PREFIX = 'praetorium.workspace-state:'

/** The stored text, unparsed, for rendering through `useSyncExternalStore`, which needs a value that compares equal. */
export function readStoredWorkspaceState(path: string, name: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return sessionStorage.getItem(`${STATE_PREFIX}${path}:${name}`)
  } catch {
    return null
  }
}

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
