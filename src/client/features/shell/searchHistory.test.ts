import { expect, it } from 'vitest'
import type { GlobalSearchResult } from '../../functions'
import { parseRecentSearches, withRecentSearch, withoutRecentSearch } from './searchHistory'

const result = (id: string, group: GlobalSearchResult['group'] = 'Datasheets'): GlobalSearchResult => ({
  id,
  group,
  label: id,
  detail: 'Necrons',
  href: `/factions/necrons/datasheets/${id}`,
})

it('puts the newest opened result first without repeating it', () => {
  expect(withRecentSearch([result('immortals'), result('warriors')], result('warriors')).map(({ id }) => id)).toEqual([
    'warriors',
    'immortals',
  ])
})

it('keeps only the eight most recent results', () => {
  const recent = Array.from({ length: 8 }, (_, index) => result(`sheet-${index}`))
  expect(withRecentSearch(recent, result('newest')).map(({ id }) => id)).toEqual(['newest', ...recent.slice(0, 7).map(({ id }) => id)])
})

it.each(['Your rosters', 'Your battles'] as const)('does not remember %s, which belong to the signed-in player', (group) => {
  expect(withRecentSearch([], result('private', group))).toEqual([])
})

it('drops match reasons and fuzzy flags that described the original search', () => {
  expect(withRecentSearch([], { ...result('immortals'), fuzzy: true, matchReasons: [{ kind: 'keyword', value: 'Infantry' }] })).toEqual([
    result('immortals'),
  ])
})

it('forgets one result and keeps the rest in order', () => {
  expect(withoutRecentSearch([result('a'), result('b'), result('c')], 'b').map(({ id }) => id)).toEqual(['a', 'c'])
})

it('restores stored results', () => {
  expect(parseRecentSearches(JSON.stringify([result('immortals')]))).toEqual([result('immortals')])
})

it.each(['https://example.com/', '//example.com/', 'javascript:alert(1)'])('ignores a stored result linking to %s', (href) => {
  expect(parseRecentSearches(JSON.stringify([{ ...result('immortals'), href }]))).toEqual([])
})

it.each([null, 'not json', '{"id":"x"}'])('treats unreadable storage %s as no history', (raw) => {
  expect(parseRecentSearches(raw)).toEqual([])
})
