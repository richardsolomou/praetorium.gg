import { readStoredValue, subscribeStoredValues, useStoredValue, writeStoredValue } from '../../storedValue'

/** '1' keeps the rail folded and '0' open on every page; unset is automatic, folded only in the roster workspace. */
const KEY = 'praetorium-rail-collapsed'

export const ROSTER_WORKSPACE = /^\/rosters\/(?:new|import|(?!discover$)[^/]+(?:\/edit)?)$/

/**
 * Runs in the document head before the first paint and marks the document `data-rail="collapsed"`
 * when the rail is folded on this page, so the page is laid out at its width from the start.
 */
export const RAIL_SCRIPT = `try{var r=localStorage.getItem(${JSON.stringify(KEY)});if(r==='1'||(r!=='0'&&${String(ROSTER_WORKSPACE)}.test(location.pathname)))document.documentElement.dataset.rail='collapsed'}catch(e){}`

const folded = (workspace: boolean, stored: string | null) => (stored === null ? workspace : stored === '1')

export const useRailCollapsed = (workspace: boolean) => folded(workspace, useStoredValue(KEY))

/** Folding or opening back to what this page shows by default returns the rail to automatic. */
export function setRailCollapsed(workspace: boolean, collapsed: boolean) {
  writeStoredValue(KEY, collapsed === workspace ? null : collapsed ? '1' : '0')
}

/** Keeps the document on the stored choice as it changes in any tab, and sets it where the head script never ran. */
export function followRailState(workspace: boolean) {
  const apply = () => {
    if (folded(workspace, readStoredValue(KEY))) document.documentElement.dataset.rail = 'collapsed'
    else delete document.documentElement.dataset.rail
  }
  apply()
  return subscribeStoredValues(apply)
}
