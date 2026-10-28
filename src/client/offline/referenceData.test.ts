import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { OfflineReferenceData } from '../../contracts/offlineReference'
import { applyReferenceData } from './referenceData'
import { restoreReferenceParts } from './compressedReference'
import { restoredReference, savedPackedReference } from './referenceRestore'

const savedReferenceData = async (html: string) => {
  const parts = await restoreReferenceParts(savedPackedReference(html))
  return parts && JSON.parse(JSON.stringify(restoredReference(parts)))
}
import { referenceRead } from './runtime'
import { referenceJsonExpression } from '../../contracts/embeddedReference'
import { compressReference } from './compressedReference'

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
it('restores public query data from a stored application', async () => {
  const data = reference('saved', [{ key: ['rule-index'], data: { documents: [] } }])
  expect(await savedReferenceData(`<script>window.PraetoriumOffline=${JSON.stringify(data)};</script>`)).toEqual(data)
})
it('restores public query data from a JSON-parsed application', async () => {
  const data = reference('saved', [{ key: ['rule-index'], data: { documents: [] } }])
  expect(await savedReferenceData(`<script>window.PraetoriumOffline=${referenceJsonExpression(JSON.stringify(data))};</script>`)).toEqual(
    data,
  )
})
it('restores public query data from a compressed application', async () => {
  const data = reference('saved', [{ key: ['rule-index'], data: { documents: [] } }])
  expect(
    await savedReferenceData(
      `<script>window.PraetoriumOffline=${referenceJsonExpression(JSON.stringify(await compressReference(data)))};</script>`,
    ),
  ).toEqual(data)
})
it('keeps the connected faction index while restoring an older saved reference', () => {
  const client = new QueryClient()
  const key = ['faction-index']
  const live = { factions: [{ id: 'necrons', isDefault: true }] }
  client.setQueryData(key, live)
  applyReferenceData(client, reference('old', [{ key, data: { factions: [{ id: 'necrons' }] } }]), true)
  expect(client.getQueryData(key)).toEqual(live)
})
it('restores an unopened reference without a network read', async () => {
  const client = new QueryClient()
  const key = ['rule-index']
  applyReferenceData(client, reference('old', [{ key, data: 'Saved rules' }]), true)
  expect(await referenceRead(key, () => Promise.reject(new Error('Disconnected')))).toBe('Saved rules')
})
it('keeps query timestamps and search results when only application assets change', () => {
  const client = new QueryClient()
  const key = ['rule-index']
  applyReferenceData(client, reference('same', [{ key, data: 'Saved rules' }]))
  client.setQueryData(key, 'Current rules', { updatedAt: 1 })
  client.setQueryData(['global-search', 'moving'], ['Moving'])
  applyReferenceData(client, { ...reference('same', [{ key, data: 'Saved rules' }]), appRevision: 'new-app' })
  expect({
    rules: client.getQueryData(key),
    updatedAt: client.getQueryState(key)?.dataUpdatedAt,
    invalidated: client.getQueryState(['global-search', 'moving'])?.isInvalidated,
  }).toEqual({ rules: 'Current rules', updatedAt: 1, invalidated: false })
})
it.each(['null', '{}', '{broken', JSON.stringify({ version: 1, queries: [{}], revision: 'bad', savedAt: 1 })])(
  'ignores an unusable saved application: %s',
  async (serialized) => {
    expect(await savedReferenceData(`<script>window.PraetoriumOffline=${serialized};</script>`)).toBeNull()
  },
)
it('makes an updated rule available to the current page without replacing private data', async () => {
  const client = new QueryClient()
  const key = ['rule-section', 'core', 'moving']
  client.setQueryData(['me'], { name: 'Player' })
  client.setQueryData(key, 'Old rule')
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

it('parses a restored query only when it is read', () => {
  const restored = restoredReference({ reference: reference('saved', []), queries: [{ key: ['rule-index'], json: '{"documents":[]}' }] })
  expect(typeof Object.getOwnPropertyDescriptor(restored.queries[0], 'data')?.get).toBe('function')
})
it('restores each query’s data when read', () => {
  const restored = restoredReference({ reference: reference('saved', []), queries: [{ key: ['rule-index'], json: '{"documents":[]}' }] })
  expect(restored.queries[0]?.data).toEqual({ documents: [] })
})
it('fills only reference queries already waiting when restoring', () => {
  const client = new QueryClient()
  client.getQueryCache().build(client, { queryKey: ['rule-index'] })
  applyReferenceData(
    client,
    reference('saved', [
      { key: ['rule-index'], data: 'Saved rules' },
      { key: ['deployments'], data: [] },
    ]),
    true,
  )
  expect(
    client
      .getQueryCache()
      .getAll()
      .map((query) => [query.queryKey[0], query.state.data]),
  ).toEqual([['rule-index', 'Saved rules']])
})
it('leaves queries no page has made to read a new revision when made', () => {
  const client = new QueryClient()
  applyReferenceData(client, reference('new', [{ key: ['deployments'], data: [] }]))
  expect(client.getQueryCache().getAll()).toEqual([])
})
