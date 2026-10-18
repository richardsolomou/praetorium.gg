import type { OnboardingProgress } from '../../../core/onboarding'
import { nativeBridgeVersion } from '../../nativeBridge'
import { readStoredValue, writeStoredValue } from '../../storedValue'

type SpectatorInviteOffer = 'roster' | 'battle'

/**
 * The first step a viewer without a seat has not taken yet, or nothing.
 *
 * An unknown account or progress offers nothing rather than flashing an invite at
 * someone who already plays, and an account that has been seated is left to watch.
 */
export function spectatorInviteOffer({
  seated,
  me,
  progress,
}: {
  seated: boolean
  me: object | null | undefined
  progress: OnboardingProgress | undefined
}): SpectatorInviteOffer | null {
  if (seated || me === undefined) return null
  if (me === null) return 'roster'
  if (!progress || progress.completedTasks.includes('battle')) return null
  return progress.completedTasks.includes('roster') ? 'battle' : 'roster'
}

const DISMISSED_KEY = 'praetorium-spectator-invite-dismissed'

/** The application's own tabs already lead to rosters and battles, so the shell never shows it. */
export function spectatorInviteSuppressed() {
  return nativeBridgeVersion() !== undefined || readStoredValue(DISMISSED_KEY) === 'true'
}

export function dismissSpectatorInvite() {
  writeStoredValue(DISMISSED_KEY, 'true')
}
