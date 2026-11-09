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
