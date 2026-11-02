import { readStoredValue, subscribeStoredValues, useStoredValue, writeStoredValue } from '../../storedValue'

const KEY = 'praetorium-rail-collapsed'

/**
 * Runs in the document head before the first paint and marks the document `data-rail="collapsed"`
 * when this device keeps the navigation rail folded, so the page is laid out at its width from the start.
 */
export const RAIL_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(KEY)})==='1')document.documentElement.dataset.rail='collapsed'}catch(e){}`

const railCollapsed = () => readStoredValue(KEY) === '1'

export const useRailCollapsed = () => useStoredValue(KEY) === '1'

export function setRailCollapsed(collapsed: boolean) {
  writeStoredValue(KEY, collapsed ? '1' : null)
}

/** Keeps the document on the stored choice as it changes in any tab, and sets it where the head script never ran. */
export function followRailState() {
  const apply = () => {
    if (railCollapsed()) document.documentElement.dataset.rail = 'collapsed'
    else delete document.documentElement.dataset.rail
  }
  apply()
  return subscribeStoredValues(apply)
}
