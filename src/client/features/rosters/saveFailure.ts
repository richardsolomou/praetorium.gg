import { LOCKED_ROSTER_MESSAGE } from '../../../core/rosterLock'
import { SIGN_IN_REQUIRED } from '../../../core/session'
import { isFetchNetworkFailure } from '../../networkErrors'

type SaveFailureReason = 'locked' | 'deleted' | 'account' | 'storage' | 'network' | 'invalid' | 'other'

// Messages thrown by saveRoster on the server (src/server/services/rosterService.ts) and on the device (src/client/functions.ts, src/client/offline).
const DELETED = new Set(['This roster was deleted. Save it as a new roster.', 'the saved roster is no longer available'])
const ACCOUNT = new Set([SIGN_IN_REQUIRED, 'Sign in before saving changes.', 'you do not own this roster'])
const STORAGE = new Set([
  'Saved work exceeds this device’s storage limit.',
  'This device has no room for more saved changes.',
  'Too many unsynced changes. Connect before making more edits.',
  'Another window is saving changes. Try again.',
])

/** A save failure as one of a few telemetry reasons, never the message itself. */
export function saveFailureReason(error: unknown): SaveFailureReason {
  if (isFetchNetworkFailure(error)) return 'network'
  if (!(error instanceof Error)) return 'other'
  if (error.name === 'QuotaExceededError') return 'storage'
  if (error.name === 'ZodError') return 'invalid'
  const { message } = error
  if (message === LOCKED_ROSTER_MESSAGE) return 'locked'
  if (DELETED.has(message)) return 'deleted'
  if (ACCOUNT.has(message) || message.startsWith('The account changed')) return 'account'
  if (STORAGE.has(message)) return 'storage'
  return 'other'
}
