import type { OnboardingProgress } from '../../../core/onboarding'
import { nativeBridgeVersion } from '../../nativeBridge'

export type SpectatorInviteOffer = 'roster' | 'battle'

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
const listeners = new Set<() => void>()
let dismissedHere = false

/** The application's own tabs already lead to rosters and battles, so the shell never shows it. */
export function spectatorInviteSuppressed() {
  if (dismissedHere || nativeBridgeVersion() !== undefined) return true
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function dismissSpectatorInvite() {
  dismissedHere = true
  try {
    localStorage.setItem(DISMISSED_KEY, 'true')
  } catch {
    // The page still remembers the dismissal when storage is unavailable.
  }
  for (const listener of listeners) listener()
}

export function subscribeSpectatorInvite(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
