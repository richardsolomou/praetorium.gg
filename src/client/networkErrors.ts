const FETCH_NETWORK_FAILURES = ['failed to fetch', 'networkerror when attempting to fetch resource', 'load failed', 'fetch failed']

const MODULE_LOAD_FAILURES = ['dynamically imported module', 'importing a module script failed']

function typeErrorMessage(error: unknown) {
  if (typeof error !== 'object' || error === null) return null
  const { name, message } = error as { name?: unknown; message?: unknown }
  return name === 'TypeError' && typeof message === 'string' ? message.toLowerCase() : null
}

/** A code-split chunk that failed to load, usually because a deploy replaced the build this page started with. */
export function isModuleLoadFailure(error: unknown): boolean {
  const message = typeErrorMessage(error)
  return message !== null && MODULE_LOAD_FAILURES.some((phrase) => message.includes(phrase))
}

/** Fetch rejects with these engine-specific TypeErrors when the connection drops or the page unloads mid-request. */
export function isFetchNetworkFailure(error: unknown): boolean {
  const message = typeErrorMessage(error)
  return message !== null && !isModuleLoadFailure(error) && FETCH_NETWORK_FAILURES.some((phrase) => message.includes(phrase))
}
