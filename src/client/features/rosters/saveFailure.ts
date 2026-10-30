import { LOCKED_ROSTER_MESSAGE } from '../../../core/rosterLock'
import { SIGN_IN_REQUIRED } from '../../../core/session'
import { DELETED_ROSTER_MESSAGE } from '../../functions'
import { isFetchNetworkFailure } from '../../networkErrors'
import { SIGN_IN_TO_SAVE_MESSAGE } from '../../offline/localRuntime'
import { SAVING_ELSEWHERE_MESSAGE, STORAGE_LIMIT_MESSAGE } from '../../offline/localStorage'
import { NO_ROOM_MESSAGE, TOO_MANY_CHANGES_MESSAGE } from '../../offline/syncEngine'

type SaveFailureReason = 'locked' | 'deleted' | 'account' | 'storage' | 'network' | 'invalid' | 'other'

// The lowercase messages are thrown by the server (src/server/services/rosterService.ts), which the client cannot import.
const DELETED = new Set([DELETED_ROSTER_MESSAGE, 'the saved roster is no longer available'])
const ACCOUNT = new Set([SIGN_IN_REQUIRED, SIGN_IN_TO_SAVE_MESSAGE, 'you do not own this roster'])
const STORAGE = new Set([STORAGE_LIMIT_MESSAGE, NO_ROOM_MESSAGE, TOO_MANY_CHANGES_MESSAGE, SAVING_ELSEWHERE_MESSAGE])

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
