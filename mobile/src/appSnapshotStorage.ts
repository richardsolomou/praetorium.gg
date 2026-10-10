import { MAX_APP_SNAPSHOT_BYTES, parseAppSnapshot, type AppSnapshot } from '../../src/contracts/appSnapshot'
import { deleteSavedState, readSavedState, writeSavedState } from './savedStateStorage'

export function readAppSnapshot(): AppSnapshot | null {
  try {
    return readSavedState('app-state', MAX_APP_SNAPSHOT_BYTES, parseAppSnapshot)
  } catch {
    return null
  }
}

export function storeAppSnapshot(snapshot: AppSnapshot | null, id: string) {
  if (!snapshot) {
    deleteSavedState('app-state')
    return
  }
  writeSavedState('app-state', snapshot, id, MAX_APP_SNAPSHOT_BYTES)
}

export function appSnapshotScript(snapshot = readAppSnapshot()) {
  return `window.PraetoriumAppSnapshot=${JSON.stringify(snapshot).replaceAll('<', '\\u003c')};`
}
