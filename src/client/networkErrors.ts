const FETCH_NETWORK_FAILURES = ['failed to fetch', 'networkerror when attempting to fetch resource', 'load failed', 'fetch failed']

/** Fetch rejects with these engine-specific TypeErrors when the connection drops or the page unloads mid-request. */
export function isFetchNetworkFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name !== 'TypeError' || typeof message !== 'string') return false
  const lowered = message.toLowerCase()
  return FETCH_NETWORK_FAILURES.some((phrase) => lowered.includes(phrase))
}
