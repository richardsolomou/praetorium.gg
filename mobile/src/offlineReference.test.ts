import { expect, it } from 'vitest'
import { parseSavedReference } from './offlineReference'
import { parseNativeActionRequest } from './nativeActions'
const pack = { html: '<!doctype html><script>window.PraetoriumOffline={version:1}</script>', savedAt: 1 }
it('accepts a complete native offline app download', () => {
  expect(parseNativeActionRequest(JSON.stringify({ version: 3, type: 'native-offline-save', id: 'save-1', ...pack }))).toEqual({
    kind: 'offline-save',
    id: 'save-1',
    reference: pack,
  })
})
it('refuses a document without offline app data', () => {
  expect(parseSavedReference({ ...pack, html: '<!doctype html><main>Private roster</main>' })).toBeNull()
})
it('refuses an invalid download date', () => {
  expect(parseSavedReference({ ...pack, savedAt: NaN })).toBeNull()
})
it('refuses an oversized reference download', () => {
  expect(parseSavedReference({ ...pack, html: pack.html + 'x'.repeat(100_000_000) })).toBeNull()
})
