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
  factionAnchors,
  INDEX_FACTIONS,
  updateAnchor,
  updateSummary,
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

describe('what an update’s row says', () => {
  const removed = (count: number) =>
    Array.from({ length: count }, (_, at) => ({ kind: 'datasheet-removed' as const, id: `unit-${at}`, name: `Unit ${at}` }))
  const reaching = (...counts: [string, number][]): CatalogueChangeSet => ({
    factions: counts.map(([faction, count]) => ({ catalogueId: faction.toLowerCase(), faction, changes: removed(count) })),
    omitted: 0,
  })
  const row = (set: CatalogueChangeSet) => updateSummary('update-2026-07-22-0123abcd', set)

  it('names the factions it reached most first, with their counts and anchors', () => {
    expect(row(reaching(['Orks', 2], ['Aeldari', 9], ['Necrons', 2])).factions).toEqual([
      { faction: 'Aeldari', anchor: 'update-2026-07-22-0123abcd-aeldari', count: 9 },
      { faction: 'Necrons', anchor: 'update-2026-07-22-0123abcd-necrons', count: 2 },
      { faction: 'Orks', anchor: 'update-2026-07-22-0123abcd-orks', count: 2 },
    ])
  })

  it('counts every change, including those past the change set’s bound', () => {
    expect(row({ ...reaching(['Orks', 3]), omitted: 4 }).total).toBe(7)
  })

  it('names the first few factions and counts the rest', () => {
    const many = row(reaching(...Array.from({ length: INDEX_FACTIONS + 3 }, (_, at): [string, number] => [`Faction ${at}`, 1])))

    expect({ named: many.factions.length, more: many.more }).toEqual({ named: INDEX_FACTIONS, more: 3 })
  })

  it('counts no more factions when every one is named', () => {
    expect(row(reaching(['Orks', 1])).more).toBe(0)
  })

  it('starts open for an update of five changes', () => {
    expect(row(reaching(['Orks', 3], ['Necrons', 2])).open).toBe(true)
  })

  it('starts closed for an update of six changes', () => {
    expect(row(reaching(['Orks', 3], ['Necrons', 3])).open).toBe(false)
  })

  it('counts changes past the bound toward whether an update starts open', () => {
    expect(row({ ...reaching(['Orks', 5]), omitted: 1 }).open).toBe(false)
  })
})

describe('the anchors an update is addressed by', () => {
  const day = Date.UTC(2026, 6, 22, 23, 59)

  it('reads the day it was recorded and the start of its digest', () => {
    expect(updateAnchor(day, '0123abcd4567ef89')).toBe('update-2026-07-22-0123abcd')
  })

  it('tells two updates of one day apart', () => {
    expect(updateAnchor(day, '0123abcd4567ef89')).not.toBe(updateAnchor(Date.UTC(2026, 6, 22, 1), 'fedcba9876543210'))
  })

  it('uses the day in UTC, whatever the time of day', () => {
    expect(updateAnchor(Date.UTC(2026, 6, 22, 0, 0), 'ab')).toBe(updateAnchor(Date.UTC(2026, 6, 22, 23, 59), 'ab'))
  })

  it('is URL-safe', () => {
    expect(updateAnchor(day, '0123abcd4567ef89')).toMatch(/^[a-z0-9-]+$/)
  })

  it('addresses each faction inside its update by the name the page prints', () => {
    const anchors = factionAnchors('update-2026-07-22-0123abcd', [
      { catalogueId: 'ec', faction: 'Emperor’s Children' },
      { catalogueId: 'tau', faction: 'T’au Empire' },
    ])

    expect([...anchors.values()]).toEqual(['update-2026-07-22-0123abcd-emperors-children', 'update-2026-07-22-0123abcd-tau-empire'])
  })

  it('tells two factions of one name apart', () => {
    const anchors = factionAnchors('update-x', [
      { catalogueId: 'a', faction: 'Orks' },
      { catalogueId: 'b', faction: 'Orks' },
    ])

    expect([...anchors.values()]).toEqual(['update-x-orks', 'update-x-orks-2'])
  })

  it('keeps one faction in two updates apart', () => {
    const faction = [{ catalogueId: 'orks', faction: 'Orks' }]

    expect(factionAnchors('update-a', faction).get('orks')).not.toBe(factionAnchors('update-b', faction).get('orks'))
  })

  it('links a row’s factions to the anchors its body renders', () => {
    const twoOrks: CatalogueChangeSet = {
      factions: [
        { catalogueId: 'orks', faction: 'Orks', changes: [{ kind: 'datasheet-removed', id: 'lootas', name: 'Lootas' }] },
        { catalogueId: 'orks-2', faction: 'Orks', changes: [{ kind: 'datasheet-removed', id: 'burnas', name: 'Burna Boyz' }] },
      ],
      omitted: 0,
    }

    expect(
      updateSummary('update-x', twoOrks)
        .factions.map((faction) => faction.anchor)
        .toSorted(),
    ).toEqual([...factionAnchors('update-x', twoOrks.factions).values()].toSorted())
  })
})
