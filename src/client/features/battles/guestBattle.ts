/** The battle this device last joined as a guest, so the roster builder can lead back to it. */
const KEY = 'praetorium.guest-battle'

export function rememberGuestBattle(token: string) {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    // Without storage the builder offers no way back, and the battle link still works.
  }
}

export function readGuestBattle() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function forgetGuestBattle() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // A note that cannot be removed only leaves a link to a battle the account now holds.
  }
}
