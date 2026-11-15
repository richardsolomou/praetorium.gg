import { useEffect } from 'react'
import { requestNativeHaptic } from '../../nativeBridge'

/** Anything a finger presses: buttons, links, menu items, choices and disclosures. Labels are left out because their click reaches the control they label. */
const PRESSABLE = `:is(button, a[href], summary, select, input:is([type='button'], [type='submit'], [type='reset'], [type='checkbox'], [type='radio']), [role='button'], [role='link'], [role='menuitem'], [role='menuitemradio'], [role='menuitemcheckbox'], [role='option'], [role='switch'], [role='tab'], [role='radio'], [role='checkbox']):not(:disabled, [aria-disabled='true'], [data-disabled])`

/**
 * Ticks on the phone as any control takes a press, the way native controls answer the finger. Listened for once at the
 * document rather than in each control, so the generated components stay untouched. Outside a shell that knows the
 * feels the tick goes nowhere.
 */
export function PressHaptics() {
  useEffect(() => {
    const tick = (event: MouseEvent) => {
      if (event.isTrusted && event.target instanceof Element && event.target.closest(PRESSABLE)) requestNativeHaptic('selection')
    }
    document.addEventListener('click', tick, true)
    return () => document.removeEventListener('click', tick, true)
  }, [])
  return null
}
