import { MAX_OFFLINE_BYTES } from '../../src/contracts/offlineReference'
import { parseSavedReference, type SavedReference } from './offlineReference'
import { embeddedReferenceJson, referenceJsonExpression } from '../../src/contracts/embeddedReference'
import { readSavedState, writeSavedState } from './savedStateStorage'

export function readOfflineReference(): SavedReference | null {
  return readSavedState('offline-app', MAX_OFFLINE_BYTES * 2, parseSavedReference)
}
// Reading a whole reference pack back after writing it spikes iOS memory; the byte-size check catches truncation.
export function storeOfflineReference(pack: SavedReference, id: string) {
  writeSavedState('offline-app', pack, id, MAX_OFFLINE_BYTES * 2, { readBack: false })
}

export function offlineReferenceDataScript(pack = readOfflineReference()) {
  const json = pack ? embeddedReferenceJson(pack.html) : null
  return json ? `window.PraetoriumReferenceCache=${referenceJsonExpression(json)};` : ''
}
