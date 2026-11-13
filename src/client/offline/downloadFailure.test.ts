import { expect, it } from 'vitest'
import { DownloadRefused, failureName, refreshFailureReason } from './downloadFailure'

it.each([
  [new TypeError('Failed to fetch'), 'network'],
  [new DownloadRefused('The reference download is unavailable'), 'refused'],
  [new DOMException('signal timed out', 'TimeoutError'), 'timeout'],
  [new DOMException('The quota has been exceeded', 'QuotaExceededError'), 'storage'],
  [new Error('The reference version is invalid'), 'error'],
])('reports %s as %s', (error, reason) => {
  expect(refreshFailureReason(error)).toBe(reason)
})

it.each([
  [new DOMException('Entry was not found', 'NotFoundError'), 'NotFoundError'],
  [Object.assign(new Error('x'), { name: 'Cache put failed for /praetorium/part.json' }), 'other'],
  ['thrown text', 'other'],
])('names %s as %s without its message', (error, name) => {
  expect(failureName(error)).toBe(name)
})
