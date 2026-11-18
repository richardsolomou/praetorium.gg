import { setNativeWatchBattle } from '../../nativeBridge'

/**
 * The battle on the watch. It stays there after its page closes, since the watch polls it, until
 * another battle replaces it or the account signs out; a finished battle only replaces itself.
 */
let following: string | null = null

export const followedBattle = () => following
export function followBattle(token: string) {
  following = token
}

/** Takes the watch off whatever battle it follows, along with the seated player's objectives and reminders. */
export function clearWatchBattle() {
  following = null
  setNativeWatchBattle(null)
}
