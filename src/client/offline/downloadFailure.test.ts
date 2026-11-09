import { expect, it } from 'vitest'
import { DownloadRefused, refreshFailureReason } from './downloadFailure'

it.each([
  [new TypeError('Failed to fetch'), 'network'],
  [new DownloadRefused('The reference download is unavailable'), 'refused'],
  [new DOMException('signal timed out', 'TimeoutError'), 'timeout'],
  [new DOMException('The quota has been exceeded', 'QuotaExceededError'), 'storage'],
  [new Error('The reference version is invalid'), 'error'],
])('reports %s as %s', (error, reason) => {
  expect(refreshFailureReason(error)).toBe(reason)
})
