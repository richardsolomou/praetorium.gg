import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { OfflineReferenceData, ReferenceQuery } from '../../contracts/offlineReference'
import { applyReferenceData } from './referenceData'
import { referenceRead } from './runtime'

const mocks = vi.hoisted(() => ({ parts: new Map<string, unknown>() }))
vi.mock('./referenceStore', () => ({ readPart: async (asset: string) => structuredClone(mocks.parts.get(asset)) }))

let saved = 0
/** A download whose core holds `queries`; each call stores its parts apart, as each published revision does. */
function reference(revision: string, queries: ReferenceQuery[]): OfflineReferenceData {
  const core = `/assets/reference-${++saved}.bin`
  mocks.parts.set(core, queries)
  return {
    version: 2,
    savedAt: 1,
    appRevision: 'app',
    editions: [],
    download: {
      revision,
      reference: { core, search: core, parts: {} },
      construction: { catalogue: core, rules: core, editions: {} },
    },
  }
}
beforeEach(() => vi.stubGlobal('window', {}))
afterEach(() => vi.unstubAllGlobals())
it('keeps the connected faction index while restoring an older saved reference', async () => {
  const client = new QueryClient()
  const key = ['faction-index']
  const live = { factions: [{ id: 'necrons', isDefault: true }] }
  client.setQueryData(key, live)
  await applyReferenceData(client, reference('old', [{ key, data: { factions: [{ id: 'necrons' }] } }]), true)
  expect(client.getQueryData(key)).toEqual(live)
})
it('restores an unopened reference without a network read', async () => {
  const client = new QueryClient()
  const key = ['rule-index']
  await applyReferenceData(client, reference('old', [{ key, data: 'Saved rules' }]), true)
  expect(await referenceRead(key, () => Promise.reject(new Error('Disconnected')))).toBe('Saved rules')
})
it('keeps query timestamps and search results when only application assets change', async () => {
  const client = new QueryClient()
  const key = ['rule-index']
  await applyReferenceData(client, reference('same', [{ key, data: 'Saved rules' }]))
  client.setQueryData(key, 'Current rules', { updatedAt: 1 })
  client.setQueryData(['global-search', 'moving'], ['Moving'])
  await applyReferenceData(client, { ...reference('same', [{ key, data: 'Saved rules' }]), appRevision: 'new-app' })
  expect({
    rules: client.getQueryData(key),
    updatedAt: client.getQueryState(key)?.dataUpdatedAt,
    invalidated: client.getQueryState(['global-search', 'moving'])?.isInvalidated,
  }).toEqual({ rules: 'Current rules', updatedAt: 1, invalidated: false })
})
it('makes an updated rule available to the current page without replacing private data', async () => {
  const client = new QueryClient()
  const key = ['rule-section', 'core', 'moving']
  client.setQueryData(['me'], { name: 'Player' })
  client.setQueryData(key, 'Old rule')
  await applyReferenceData(client, reference('old', [{ key, data: 'Old rule' }]))
  await applyReferenceData(client, reference('new', [{ key, data: 'Updated rule' }]))
  expect([
    client.getQueryData(key),
    await referenceRead(key, () => Promise.reject(new Error('Network unavailable'))),
    client.getQueryData(['me']),
  ]).toEqual(['Updated rule', 'Updated rule', { name: 'Player' }])
})
it('asks the service again for a reference a new revision no longer has', async () => {
  const client = new QueryClient()
  const key = ['rule-section', 'core', 'removed']
  client.setQueryData(key, 'Removed rule')
  await applyReferenceData(client, reference('new', []))
  expect(client.getQueryState(key)?.isInvalidated).toBe(true)
})
it('recomputes cached search and datasheet filters after a revision changes', async () => {
  const client = new QueryClient()
  const keys = [
    ['global-search', 'moving'],
    ['faction-datasheets', 'necrons', 'infantry'],
  ]
  for (const key of keys) client.setQueryData(key, ['Old result'])
  await applyReferenceData(client, reference('new', []))
  expect(keys.map((key) => client.getQueryState(key)?.isInvalidated)).toEqual([true, true])
})

it('fills only reference queries already waiting when restoring', async () => {
  const client = new QueryClient()
  client.getQueryCache().build(client, { queryKey: ['rule-index'] })
  await applyReferenceData(
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
it('leaves queries no page has made to read a new revision when made', async () => {
  const client = new QueryClient()
  await applyReferenceData(client, reference('new', [{ key: ['deployments'], data: [] }]))
  expect(client.getQueryCache().getAll()).toEqual([])
})
