const STATE_PREFIX = 'praetorium.workspace-state:'

export function readWorkspaceState<T>(path: string, name: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    return JSON.parse(sessionStorage.getItem(`${STATE_PREFIX}${path}:${name}`) ?? 'null')
  } catch {
    return null
  }
}

export function writeWorkspaceState(path: string, name: string, value: unknown) {
  const key = `${STATE_PREFIX}${path}:${name}`
  if (value === null) sessionStorage.removeItem(key)
  else sessionStorage.setItem(key, JSON.stringify(value))
}
