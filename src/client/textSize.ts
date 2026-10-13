import { useSyncExternalStore } from 'react'

/** Reading sizes for this device, as the root font size every rem-sized measure follows. */
export const TEXT_SIZES = ['standard', 'large', 'larger'] as const
export type TextSize = (typeof TEXT_SIZES)[number]

const KEY = 'praetorium-text-size'
const CHANGED = 'praetorium-text-size-changed'
const isTextSize = (value: unknown): value is TextSize => TEXT_SIZES.some((size) => size === value)

/** Runs in the document head before the first paint, so a saved size never flashes the standard one first. */
export const TEXT_SIZE_SCRIPT = `try{var s=localStorage.getItem(${JSON.stringify(KEY)});if(${JSON.stringify(TEXT_SIZES.slice(1))}.indexOf(s)>=0)document.documentElement.dataset.textSize=s}catch(e){}`

export function savedTextSize(): TextSize {
  try {
    const saved = localStorage.getItem(KEY)
    return isTextSize(saved) ? saved : 'standard'
  } catch {
    return 'standard'
  }
}

function applyTextSize(size: TextSize) {
  if (size === 'standard') delete document.documentElement.dataset.textSize
  else document.documentElement.dataset.textSize = size
}

/** For documents the head script never ran in, such as the native shell's saved application. */
export function restoreTextSize() {
  applyTextSize(savedTextSize())
}

export function chooseTextSize(size: TextSize) {
  applyTextSize(size)
  try {
    if (size === 'standard') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, size)
  } catch {
    // Storage can be unavailable; the size still applies until the page reloads.
  }
  window.dispatchEvent(new Event(CHANGED))
}

function subscribe(onChange: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key !== KEY) return
    restoreTextSize()
    onChange()
  }
  window.addEventListener(CHANGED, onChange)
  window.addEventListener('storage', storage)
  return () => {
    window.removeEventListener(CHANGED, onChange)
    window.removeEventListener('storage', storage)
  }
}

/** The size chosen on this device; the server and the first frame render the standard size. */
export function useTextSize() {
  return useSyncExternalStore(subscribe, savedTextSize, () => 'standard' as const)
}
