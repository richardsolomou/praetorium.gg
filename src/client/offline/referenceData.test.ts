import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { OfflineReferenceData } from '../../contracts/offlineReference'
import { applyReferenceData, savedReferenceData } from './referenceData'
import { referenceRead } from './runtime'

function reference(revision: string, queries: OfflineReferenceData['queries']): OfflineReferenceData {
  return {
    version: 1,
    savedAt: 1,
    revision,
    queries,
    css: '',
    logo: '',
    search: { factions: [], detachments: [], datasheets: [], missions: [], rules: [] },
  }
}
beforeEach(() => vi.stubGlobal('window', {}))
afterEach(() => vi.unstubAllGlobals())
it('restores public query data from a stored application', () => {
  const data = reference('saved', [{ key: ['rule-index'], data: { documents: [] } }])
  expect(savedReferenceData(`<script>window.PraetoriumOffline=${JSON.stringify(data)};</script>`)).toEqual(data)
})
it.each(['null', '{}', '{broken', JSON.stringify({ version: 1, queries: [{}], revision: 'bad', savedAt: 1 })])(
  'ignores an unusable saved application: %s',
  (serialized) => {
    expect(savedReferenceData(`<script>window.PraetoriumOffline=${serialized};</script>`)).toBeNull()
  },
)
it('makes an updated rule available to the current page without replacing private data', async () => {
  const client = new QueryClient()
  const key = ['rule-section', 'core', 'moving']
  client.setQueryData(['me'], { name: 'Player' })
  applyReferenceData(client, reference('old', [{ key, data: 'Old rule' }]))
  applyReferenceData(client, reference('new', [{ key, data: 'Updated rule' }]))
  expect([
    client.getQueryData(key),
    await referenceRead(key, () => Promise.reject(new Error('Network unavailable'))),
    client.getQueryData(['me']),
  ]).toEqual(['Updated rule', 'Updated rule', { name: 'Player' }])
})
it('removes a deleted reference from the visible query cache', () => {
  const client = new QueryClient()
  const key = ['rule-section', 'core', 'removed']
  applyReferenceData(client, reference('old', [{ key, data: 'Removed rule' }]))
  applyReferenceData(client, reference('new', []))
  expect(client.getQueryData(key)).toBeNull()
})
it('recomputes cached search and datasheet filters after a revision changes', () => {
  const client = new QueryClient()
  const keys = [
    ['global-search', 'moving'],
    ['faction-datasheets', 'necrons', 'infantry'],
  ]
  for (const key of keys) client.setQueryData(key, ['Old result'])
  applyReferenceData(client, reference('new', []))
  expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([true, true])
})
