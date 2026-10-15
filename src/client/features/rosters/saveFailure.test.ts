import { expect, it } from 'vitest'
import { z } from 'zod'
import { LOCKED_ROSTER_MESSAGE } from '../../../core/rosterLock'
import { SIGN_IN_REQUIRED } from '../../../core/session'
import { saveFailureReason } from './saveFailure'

const invalid = z.object({ name: z.string() }).safeParse({}).error

it.each([
  [new TypeError('Failed to fetch'), 'network'],
  [new Error(LOCKED_ROSTER_MESSAGE), 'locked'],
  [new Error('This roster was deleted. Save it as a new roster.'), 'deleted'],
  [new Error('the saved roster is no longer available'), 'deleted'],
  [new Error(SIGN_IN_REQUIRED), 'account'],
  [new Error('you do not own this roster'), 'account'],
  [new Error('The account changed while saving this roster.'), 'account'],
  [new Error('This device has no room for more saved changes.'), 'storage'],
  [new DOMException('Storage unavailable', 'QuotaExceededError'), 'storage'],
  [invalid, 'invalid'],
  [new Error('request failed (500)'), 'other'],
  ['not an error', 'other'],
])('classifies %s as %s', (error, reason) => {
  expect(saveFailureReason(error)).toBe(reason)
})
