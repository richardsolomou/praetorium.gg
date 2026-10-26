import { useStoredValue, writeStoredValue } from '../../storedValue'

/** The battle this device last joined as a guest, so the roster builder can lead back to it. */
const KEY = 'praetorium.guest-battle'

export const rememberGuestBattle = (token: string) => writeStoredValue(KEY, token)
export const useGuestBattle = () => useStoredValue(KEY)
export const forgetGuestBattle = () => writeStoredValue(KEY, null)
