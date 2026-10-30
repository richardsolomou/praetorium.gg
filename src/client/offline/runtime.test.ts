import { QueryClient, onlineManager } from '@tanstack/react-query'
import * as functions from '../../server/functions'
import { globalSearchQuery } from '../queries/references'
import { factionDatasheetsQuery } from '../queries/rosters'
import { referenceChangesQuery } from '../queries/changes'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { OfflineReferenceData } from '../../contracts/offlineReference'
import {
  offlineDatasheets,
  offlineSearch,
  referenceRead,
  referenceData,
  searchDownload,
  setPublishedReference,
  currentConstruction,
} from './runtime'
import { compressReference } from './compressedReference'
const CONSTRUCTION = { current: '/assets/construction-a.bin', complete: '/assets/construction-b.bin', versions: [] }
const published = (revision: string) => ({ revision, construction: CONSTRUCTION })
const saved: OfflineReferenceData = {
  version: 1,
  savedAt: 1,
  revision: 'test',
  css: '',
  logo: '',
  queries: [
    { key: ['rule-section', 'core', 'moving'], data: { title: 'Moving' } },
    {
      key: ['faction-datasheets', 'necrons', ''],
      data: [
        { id: 'immortals', name: 'Immortals' },
        { id: 'warriors', name: 'Necron Warriors' },
      ],
    },
  ],
  search: {
    factions: [],
    detachments: [],
    datasheets: ['Immortals', 'Necron Warriors'].map((name, at) => ({
      targetId: String(at),
      allied: false,
      name,
      fields: { name, keywords: ['Infantry'], abilities: [], weapons: [], weaponKeywords: [], wargear: [] },
      result: {
        id: `datasheet:necrons:${at ? 'warriors' : 'immortals'}`,
        group: 'Datasheets',
        label: name,
        detail: 'Necrons',
        href: `/factions/necrons/datasheets/${at}`,
      },
    })),
    missions: [],
    rules: [
      { search: 'moving 03', result: { id: 'moving', group: 'Rules', label: 'Moving', detail: 'Core rules', href: '/rules/core/moving' } },
    ],
  },
}
beforeEach(() => {
  vi.stubGlobal('window', { PraetoriumOffline: saved })
  vi.stubGlobal('navigator', { onLine: false })
})
const client = new QueryClient()
afterEach(() => {
  client.clear()
  setPublishedReference(null)
  onlineManager.setOnline(true)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it('reads a downloaded rule without contacting the service', async () => {
  const online = vi.fn(() => Promise.reject(new Error('Network unavailable')))
  expect(await referenceRead(['rule-section', 'core', 'moving'], online)).toEqual({ title: 'Moving' })
  expect(online).not.toHaveBeenCalled()
})
it('restores a compressed offline application once and releases the compressed copy', async () => {
  vi.stubGlobal('window', { PraetoriumOffline: await compressReference(saved) })
  const restored = referenceData()
  expect({ restored, reused: referenceData() === restored, global: window.PraetoriumOffline }).toEqual({
    restored: saved,
    reused: true,
    global: saved,
  })
})
it('leaves a compressed native reference for background decoding', async () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: await compressReference(saved) })
  expect(referenceData()).toBeUndefined()
})
it('ignores an unreadable native reference and uses the connected service', async () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: { encoding: 'gzip-base64', data: 'broken' } })
  vi.stubGlobal('navigator', { onLine: true })
  expect(await referenceRead(['rule-section', 'core', 'moving'], () => Promise.resolve('Live rule'))).toBe('Live rule')
})
it('reports missing saved data rather than hanging on a network request', async () => {
  await expect(referenceRead(['rule-section', 'core', 'missing'], () => Promise.resolve('Network'))).rejects.toThrow(
    'unavailable in the saved download',
  )
})
it('loads an uncached reference from the service while connected', async () => {
  vi.stubGlobal('navigator', { onLine: true })
  expect(await referenceRead(['detachment-rules', 'necrons', ['Uncached combination']], () => Promise.resolve('Live rules'))).toBe(
    'Live rules',
  )
})
it('uses the current service while connected', async () => {
  vi.stubGlobal('window', {})
  expect(await referenceRead(['rule-section', 'core', 'moving'], () => Promise.resolve('Live rule'))).toBe('Live rule')
})
it('uses current hosted faction data even when the native shell injected an older download', async () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: saved })
  vi.stubGlobal('navigator', { onLine: true })
  expect(await referenceRead(['rule-section', 'core', 'moving'], () => Promise.resolve('Current rule'))).toBe('Current rule')
})
it('uses the native shell’s saved reference when the hosted read fails', async () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: saved })
  vi.stubGlobal('navigator', { onLine: true })
  expect(await referenceRead(['rule-section', 'core', 'moving'], () => Promise.reject(new Error('Unreachable')))).toEqual({
    title: 'Moving',
  })
})
it('filters downloaded datasheets through the existing search field', () => {
  expect(offlineDatasheets('necrons', 'Warriors')).toEqual([{ id: 'warriors', name: 'Necron Warriors' }])
})
it('finds rules through the shared public search', () => {
  expect(offlineSearch('moving')?.map((result) => result.href)).toEqual(['/rules/core/moving'])
})

it('finds a downloaded datasheet by keyword with the same match reasons as online', () => {
  expect(offlineDatasheets('necrons', 'Infantry')?.map((unit) => unit.matchReasons)).toEqual([
    [{ kind: 'keyword', value: 'Infantry' }],
    [{ kind: 'keyword', value: 'Infantry' }],
  ])
})

it.each(['PraetoriumOffline', 'PraetoriumReferenceCache'])(
  'finds a datasheet by its ability effect in the faction filter with %s',
  (key) => {
    const reference = structuredClone(saved)
    reference.search.datasheets[0]!.fields.abilityDescriptions = [{ name: 'Reanimation', description: 'Each destroyed model returns.' }]
    vi.stubGlobal('window', { [key]: reference })
    expect(offlineDatasheets('necrons', 'returns')?.map((unit) => unit.matchReasons)).toEqual([[{ kind: 'ability', value: 'Reanimation' }]])
  },
)

it('runs saved search in an already open hosted page after connectivity is lost', async () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: saved })
  onlineManager.setOnline(false)
  expect((await client.query(globalSearchQuery('moving'))).map((result) => result.href)).toEqual(['/rules/core/moving'])
})
it('runs a saved datasheet filter in an already open hosted page after connectivity is lost', async () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: saved })
  onlineManager.setOnline(false)
  expect((await client.query(factionDatasheetsQuery('necrons', 'Warriors'))).map((unit) => unit.name)).toEqual(['Necron Warriors'])
})

it('keeps private search results available online when public reference data is saved', async () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: saved })
  vi.stubGlobal('navigator', { onLine: true })
  const results = [{ id: 'roster:1', group: 'Your rosters' as const, label: 'My army', detail: 'Necrons', href: '/rosters/1' }]
  vi.spyOn(functions, 'globalSearch').mockResolvedValue(results)
  expect(await client.query(globalSearchQuery('army'))).toEqual(results)
})

it('finds a saved roster and battle through the normal search without a connection', async () => {
  vi.stubGlobal('navigator', { onLine: false })
  client.setQueryData(['me'], { id: 'alice' })
  client.setQueryData(
    ['saved-roster-summaries'],
    [{ id: 'army', name: 'Warriors army', catalogueId: 'necrons', detachmentIds: [], limit: 2000 }],
  )
  client.setQueryData(['battles'], {
    pages: [{ battles: [{ token: 'game', status: 'playing', players: ['Alice', 'Warriors opponent'], armies: [], mission: null }] }],
  })
  expect(
    (await client.query(globalSearchQuery('Warriors'))).filter((result) => result.group.startsWith('Your ')).map((result) => result.href),
  ).toEqual(['/rosters/army', '/battles/game'])
})
it('keeps public search usable when connectivity is reported but the service is unreachable', async () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: saved })
  vi.stubGlobal('navigator', { onLine: true })
  vi.spyOn(functions, 'globalSearch').mockRejectedValue(new Error('Service unreachable'))
  expect((await client.query(globalSearchQuery('moving'))).map((result) => result.href)).toEqual(['/rules/core/moving'])
})

it('reads a download the service still publishes without contacting the service', async () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: saved })
  vi.stubGlobal('navigator', { onLine: true })
  setPublishedReference(published('test'))
  expect(await referenceRead(['rule-section', 'core', 'moving'], () => Promise.resolve('Live rule'))).toEqual({ title: 'Moving' })
})
it('trusts a current download’s construction data while the service still publishes it', () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: { ...saved, constructionBundle: CONSTRUCTION.complete } })
  setPublishedReference(published('test'))
  expect(currentConstruction()).toBe(CONSTRUCTION.complete)
})
it('does not trust construction data the service no longer publishes, though the reference is current', () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: { ...saved, constructionBundle: '/assets/construction-old.bin' } })
  setPublishedReference(published('test'))
  expect(currentConstruction()).toBeUndefined()
})
it('reads from the service once it publishes another revision', async () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: saved })
  vi.stubGlobal('navigator', { onLine: true })
  setPublishedReference(published('newer'))
  expect(await referenceRead(['rule-section', 'core', 'moving'], () => Promise.resolve('Live rule'))).toBe('Live rule')
})
it('filters a current download’s datasheets without contacting the service', async () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: saved })
  vi.stubGlobal('navigator', { onLine: true })
  setPublishedReference(published('test'))
  vi.spyOn(functions, 'factionDatasheets').mockResolvedValue([{ id: 'live', name: 'Live Warriors' }] as never)
  expect((await client.query(factionDatasheetsQuery('necrons', 'Warriors'))).map((unit) => unit.name)).toEqual(['Necron Warriors'])
})
it('reads a current download’s datasheet changes without contacting the service', async () => {
  const changes = [{ recordedAt: 1, change: { kind: 'datasheet-points', id: 'warriors' } }]
  vi.stubGlobal('window', {
    PraetoriumReferenceCache: {
      ...saved,
      queries: [...saved.queries, { key: ['reference-changes', 'datasheet', 'necrons', 'warriors'], data: changes }],
    },
  })
  vi.stubGlobal('navigator', { onLine: true })
  setPublishedReference(published('test'))
  vi.spyOn(functions, 'referenceChanges').mockResolvedValue([])
  expect(await client.query(referenceChangesQuery({ kind: 'datasheet', faction: 'necrons', slug: 'warriors' }))).toEqual(changes)
})
it('searches the download together with the player’s own loaded lists', () => {
  expect(
    searchDownload('Warriors', undefined, {
      owner: { id: 'alice' },
      rosters: [{ id: 'army', name: 'Warriors army', catalogueId: 'necrons', detachmentIds: [], limit: 2000 }] as never,
      battles: undefined,
    })?.map((result) => result.href),
  ).toEqual(['/factions/necrons/datasheets/1', '/rosters/army'])
})
