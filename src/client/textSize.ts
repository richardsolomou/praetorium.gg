import { readStoredValue, subscribeStoredValues, useStoredValue, writeStoredValue } from './storedValue'

/** Reading sizes for this device, as the root font size every rem-sized measure follows. */
export const TEXT_SIZES = ['standard', 'large', 'larger'] as const
export type TextSize = (typeof TEXT_SIZES)[number]

const KEY = 'praetorium-text-size'
const isTextSize = (value: unknown): value is TextSize => TEXT_SIZES.some((size) => size === value)

/** Runs in the document head before the first paint, so a saved size never flashes the standard one first. */
export const TEXT_SIZE_SCRIPT = `try{var s=localStorage.getItem(${JSON.stringify(KEY)});if(${JSON.stringify(TEXT_SIZES.slice(1))}.indexOf(s)>=0)document.documentElement.dataset.textSize=s}catch(e){}`

const parsed = (value: string | null): TextSize => (isTextSize(value) ? value : 'standard')

export const savedTextSize = () => parsed(readStoredValue(KEY))

function applyTextSize(size: TextSize) {
  if (size === 'standard') delete document.documentElement.dataset.textSize
  else document.documentElement.dataset.textSize = size
}

/** Keeps the document on the saved size as it changes in any tab, and sets it where the head script never ran, such as the native shell's saved application. */
export function followTextSize() {
  const apply = () => applyTextSize(savedTextSize())
  apply()
  return subscribeStoredValues(apply)
}

/** Storage can refuse the write; the size still applies until the page reloads. */
export function chooseTextSize(size: TextSize) {
  applyTextSize(size)
  writeStoredValue(KEY, size === 'standard' ? null : size)
}

/** The size chosen on this device; the server and the first frame render the standard size. */
export const useTextSize = () => parsed(useStoredValue(KEY))
