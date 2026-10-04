import { QueryClient, onlineManager } from '@tanstack/react-query'
import * as functions from '../../server/functions'
import { globalSearchQuery } from '../queries/references'
import { factionDatasheetsQuery } from '../queries/rosters'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { OfflineReferenceData } from '../../contracts/offlineReference'
import { offlineDatasheets, offlineSearch, referenceRead } from './runtime'
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
beforeEach(() => vi.stubGlobal('window', { PraetoriumOffline: saved }))
afterEach(() => {
  onlineManager.setOnline(true)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
it('reads a downloaded rule without contacting the service', async () => {
  const online = vi.fn(() => Promise.reject(new Error('Network unavailable')))
  expect(await referenceRead(['rule-section', 'core', 'moving'], online)).toEqual({ title: 'Moving' })
  expect(online).not.toHaveBeenCalled()
})
it('reports missing saved data rather than hanging on a network request', async () => {
  await expect(referenceRead(['rule-section', 'core', 'missing'], () => Promise.resolve('Network'))).rejects.toThrow(
    'unavailable in the saved download',
  )
})
it('uses the current service while connected', async () => {
  vi.stubGlobal('window', {})
  expect(await referenceRead(['rule-section', 'core', 'moving'], () => Promise.resolve('Live rule'))).toBe('Live rule')
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

it('runs saved search in an already open hosted page after connectivity is lost', async () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: saved })
  onlineManager.setOnline(false)
  const client = new QueryClient()
  try {
    expect((await client.query(globalSearchQuery('moving'))).map((result) => result.href)).toEqual(['/rules/core/moving'])
  } finally {
    client.clear()
  }
})
it('runs a saved datasheet filter in an already open hosted page after connectivity is lost', async () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: saved })
  onlineManager.setOnline(false)
  const client = new QueryClient()
  try {
    expect((await client.query(factionDatasheetsQuery('necrons', 'Warriors'))).map((unit) => unit.name)).toEqual(['Necron Warriors'])
  } finally {
    client.clear()
  }
})

it('keeps private search results available online when public reference data is saved', async () => {
  vi.stubGlobal('window', { PraetoriumReferenceCache: saved })
  vi.stubGlobal('navigator', { onLine: true })
  const results = [{ id: 'roster:1', group: 'Your rosters' as const, label: 'My army', detail: 'Necrons', href: '/rosters/1' }]
  vi.spyOn(functions, 'globalSearch').mockResolvedValue(results)
  const client = new QueryClient()
  try {
    expect(await client.query(globalSearchQuery('army'))).toEqual(results)
  } finally {
    client.clear()
  }
})

it('finds a saved roster and battle through the normal search without a connection', async () => {
  vi.stubGlobal('navigator', { onLine: false })
  const client = new QueryClient()
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
  const client = new QueryClient()
  try {
    expect((await client.query(globalSearchQuery('moving'))).map((result) => result.href)).toEqual(['/rules/core/moving'])
  } finally {
    client.clear()
  }
})
