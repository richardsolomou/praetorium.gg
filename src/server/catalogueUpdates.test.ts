import { describe, expect, it } from 'vitest'
import { type CatalogueHistoryEntry, historyPage } from '../core/catalogueHistory'
import { indexedUpdate, linkedUpdate } from './catalogueChangeLog'
import { historyUpdate, updateId } from './catalogueHistory'

const removed = (count: number) =>
  Array.from({ length: count }, (_, at) => ({ kind: 'datasheet-removed' as const, id: `unit-${at}`, name: `Unit ${at}` }))

const entry = (from: string, recordedAt: number, counts: [string, number][] = [['Orks', 1]]): CatalogueHistoryEntry => ({
  from,
  revisions: { definitions: `${from}-next`, rules: 'rules' },
  recordedAt,
  changes: {
    factions: counts.map(([faction, count]) => ({ catalogueId: faction.toLowerCase(), faction, changes: removed(count) })),
    omitted: 0,
  },
})

describe('an update’s address', () => {
  it('is a short, URL-safe hash', () => {
    expect(updateId(entry('upstream:2026-07-22:ee7c59245f7f', 1))).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is the same wherever the same history is served', () => {
    expect(updateId(entry('a'.repeat(64), 1))).toBe('e49d72abb3d9807b')
  })

  it('does not depend on the order its revisions were written in', () => {
    const written = entry('a', 1)

    expect(updateId({ ...written, revisions: { rules: 'rules', definitions: 'a-next' } })).toBe(updateId(written))
  })

  it('differs between two updates from one snapshot', () => {
    expect(updateId({ ...entry('a', 1), revisions: { definitions: 'other' } })).not.toBe(updateId(entry('a', 1)))
  })

  it('finds the update it names', () => {
    const history = [entry('a', 1), entry('b', 2)]

    expect(historyUpdate(history, updateId(history[1]!))).toBe(history[1])
  })

  it('finds nothing for an id this history does not hold', () => {
    expect(historyUpdate([entry('a', 1)], '0000000000000000')).toBeNull()
  })
})

describe('the index of updates', () => {
  it('reaches every update once, a page at a time', () => {
    const history = Array.from({ length: 45 }, (_, at) => entry(`s${at}`, Math.floor(at / 2)))
    const seen: string[] = []
    let before: ReturnType<typeof historyPage>['next'] = null
    do {
      const page = historyPage(history, 20, before ?? undefined)
      seen.push(...page.entries.map((known) => indexedUpdate(known, null).id))
      before = page.next
    } while (before)

    expect(seen.toSorted()).toEqual(history.map(updateId).toSorted())
  })

  it('carries a small update’s changes and not a large one’s', () => {
    expect(
      [indexedUpdate(entry('a', 1, [['Orks', 5]]), null).changes, indexedUpdate(entry('b', 1, [['Orks', 6]]), null).changes].map(Boolean),
    ).toEqual([true, false])
  })

  it('links each faction to the anchor its block has on the update’s page', () => {
    const large = entry('a', 1, [
      ['Orks', 4],
      ['Emperor’s Children', 3],
      ['Aeldari', 2],
    ])
    const page = linkedUpdate(large, null)

    expect(
      indexedUpdate(large, null)
        .factions.map((faction) => faction.anchor)
        .toSorted(),
    ).toEqual(page.factions.map((faction) => faction.anchor).toSorted())
  })

  it('addresses an update the same on the index as on its own page', () => {
    const large = entry('a', 1, [['Orks', 9]])

    expect(indexedUpdate(large, null).id).toBe(linkedUpdate(large, null).id)
  })
})
