import { isFetchNetworkFailure } from '../networkErrors'

/** The service answered a download request with an error status. */
export class DownloadRefused extends Error {}

/** Why a background refresh failed, never the error's message. */
export function refreshFailureReason(error: unknown) {
  if (isFetchNetworkFailure(error)) return 'network'
  if (error instanceof DownloadRefused) return 'refused'
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout'
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'storage'
  return 'error'
}

/** The error's class, such as a `DOMException` name, which says what failed without its message; anything else is `other`. */
export function failureName(error: unknown) {
  const name = typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined
  return typeof name === 'string' && /^[A-Za-z]{1,64}$/.test(name) ? name : 'other'
}
