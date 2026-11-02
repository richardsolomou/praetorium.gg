import { useEffect } from 'react'
import { requestNativeHaptic } from '../../nativeBridge'

/** Controls whose press changes a choice: switches, tabs, radios, checkboxes, options and toggles, and the app's own tab bar. */
const CHOICE = `:is([role='switch'], [role='tab'], [role='radio'], [role='checkbox'], [role='option'], [role='menuitemradio'], [role='menuitemcheckbox'], [aria-pressed], input[type='checkbox'], input[type='radio'], [data-native-app-tabs] a):not(:disabled, [aria-disabled='true'], [data-disabled])`

/**
 * Ticks on the phone as a choice changes, so a toggle or a tab answers the finger the way a native one does. Listened
 * for once at the document rather than in each control, so the generated components stay untouched; any other link
 * or a press that only opens something is left silent. Outside a shell that knows the feels the tick goes nowhere.
 */
export function SelectionHaptics() {
  useEffect(() => {
    const tick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest(CHOICE)) requestNativeHaptic('selection')
    }
    document.addEventListener('click', tick, true)
    return () => document.removeEventListener('click', tick, true)
  }, [])
  return null
}
