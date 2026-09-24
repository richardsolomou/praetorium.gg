import { describe, expect, it } from 'vitest'
import type { CatalogueChangeSet } from './catalogueChanges'
import {
  appendHistory,
  type CatalogueHistoryEntry,
  decodeHistoryCursor,
  encodeHistoryCursor,
  historyKey,
  historyPage,
  historySince,
} from './catalogueHistory'

const changes = (to: string): CatalogueChangeSet => ({
  factions: [
    {
      catalogueId: 'marines',
      faction: 'Space Marines',
      changes: [{ kind: 'detachment-points', id: 'gladius', name: 'Gladius', from: '1', to }],
    },
  ],
  omitted: 0,
})
const entry = (from: string, recordedAt: number, definitions = `${from}-next`): CatalogueHistoryEntry => ({
  from,
  revisions: { definitions },
  recordedAt,
  changes: changes(String(recordedAt)),
})

describe('appending to the history', () => {
  it('adds a change, keeping the history oldest first', () => {
    expect(appendHistory([entry('b', 20)], entry('a', 10)).map((known) => known.from)).toEqual(['a', 'b'])
  })

  it('adds the same change once however many times it is appended', () => {
    const once = appendHistory([], entry('a', 10))

    expect(appendHistory(once, { ...entry('a', 99), revisions: { definitions: 'a-next' } })).toEqual(once)
  })

  it('tells two changes from one snapshot apart by the revisions they arrived at', () => {
    expect(appendHistory([entry('a', 10, 'first')], entry('a', 20, 'second'))).toHaveLength(2)
  })

  it('adds nothing for an update that changed nothing', () => {
    expect(appendHistory([], { ...entry('a', 10), changes: { factions: [], omitted: 0 } })).toEqual([])
  })

  it('keys an entry the same whatever order its revisions were written in', () => {
    expect(historyKey({ from: 'a', revisions: { rules: 'r', definitions: 'd' } })).toBe(
      historyKey({ from: 'a', revisions: { definitions: 'd', rules: 'r' } }),
    )
  })
})

describe('paging through the history', () => {
  // Two entries share a time; their keys decide their order, so each is on exactly one page.
  const history = [entry('a', 10), entry('b', 20), entry('c', 20), entry('d', 30)]
  const froms = (entries: CatalogueHistoryEntry[]) => entries.map((known) => known.from)

  it('reaches every entry once, newest first, a page at a time across a shared time', () => {
    const seen: string[] = []
    let before: ReturnType<typeof historyPage>['next'] = null
    do {
      const page = historyPage(history, 1, before ?? undefined)
      seen.push(...froms(page.entries))
      before = page.next
    } while (before)

    expect(seen).toEqual(['d', 'c', 'b', 'a'])
  })

  it('names no next page after the last one', () => {
    expect(historyPage(history, 4).next).toBeNull()
  })

  it('starts the next page with the entry sharing the last one’s time', () => {
    const first = historyPage(history, 2)

    expect(froms(historyPage(history, 2, first.next!).entries)).toEqual(['b', 'a'])
  })

  it('finds nothing before the oldest entry', () => {
    expect(historyPage(history, 5, { recordedAt: 10, key: historyKey(entry('a', 10)) }).entries).toEqual([])
  })

  it('carries a cursor through an address unchanged', () => {
    const cursor = { recordedAt: 20, key: historyKey(entry('upstream:2026-06-01:abc', 20)) }

    expect(decodeHistoryCursor(encodeHistoryCursor(cursor))).toEqual(cursor)
  })

  it('reads an address that is not a cursor as none', () => {
    expect(decodeHistoryCursor('not-a-cursor')).toBeNull()
  })
})

describe('the history a saved list is compared with', () => {
  it('is the entries recorded after the list was saved', () => {
    expect(historySince([entry('a', 10), entry('b', 20)], 10, 5).map((set) => set.recordedAt)).toEqual([20])
  })

  it('is at most the newest few', () => {
    expect(historySince([entry('a', 10), entry('b', 20), entry('c', 30)], 0, 2).map((set) => set.recordedAt)).toEqual([20, 30])
  })
})
