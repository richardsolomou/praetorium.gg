import { describe, expect, it } from 'vitest'
import { type CatalogueHistoryEntry, historyPage } from '../core/catalogueHistory'
import { indexedUpdate } from './catalogueChangeLog'
import { historyAnchor, updateId } from './catalogueHistory'

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

const july22 = (hour: number) => Date.UTC(2026, 6, 22, hour)

describe('an update’s anchor', () => {
  it('is the same wherever the same history is served', () => {
    expect(historyAnchor(entry('a'.repeat(64), july22(4)))).toBe('update-2026-07-22-e49d72ab')
  })

  it('does not depend on the order its revisions were written in', () => {
    const written = entry('a', july22(4))

    expect(historyAnchor({ ...written, revisions: { rules: 'rules', definitions: 'a-next' } })).toBe(historyAnchor(written))
  })

  it('tells apart two updates recorded on the same day', () => {
    expect(historyAnchor(entry('a', july22(4)))).not.toBe(historyAnchor(entry('b', july22(9))))
  })

  it('is unique across a history with several updates a day', () => {
    const history = Array.from({ length: 200 }, (_, at) => entry(`s${at}`, july22(at % 24)))

    expect(new Set(history.map(historyAnchor)).size).toBe(history.length)
  })

  it('starts from the digest the sitemap keys updates by', () => {
    const update = entry('a', july22(4))

    expect(historyAnchor(update).endsWith(updateId(update).slice(0, 8))).toBe(true)
  })
})

describe('an update as the index lists it', () => {
  it('starts open with five changes and closed with six', () => {
    expect([indexedUpdate(entry('a', 1, [['Orks', 5]]), null).open, indexedUpdate(entry('b', 1, [['Orks', 6]]), null).open]).toEqual([
      true,
      false,
    ])
  })

  it('links each faction to the anchor its block carries in the row’s body', () => {
    const update = indexedUpdate(
      entry('a', 1, [
        ['Orks', 4],
        ['Emperor’s Children', 3],
        ['Aeldari', 2],
      ]),
      null,
    )

    expect(update.factions.map((faction) => faction.anchor).toSorted()).toEqual(
      update.changes.factions.map((faction) => faction.anchor).toSorted(),
    )
  })

  it('nests each faction’s anchor inside its update’s', () => {
    const update = indexedUpdate(entry('a', july22(4)), null)

    expect(update.changes.factions.map((faction) => faction.anchor)).toEqual([`${update.anchor}-orks`])
  })

  it('carries every change, whether it starts open or closed', () => {
    expect(indexedUpdate(entry('a', 1, [['Orks', 9]]), null).changes.factions[0]?.changes).toHaveLength(9)
  })

  it('reaches every update once, a page at a time', () => {
    const history = Array.from({ length: 45 }, (_, at) => entry(`s${at}`, Math.floor(at / 2)))
    const seen: string[] = []
    let before: ReturnType<typeof historyPage>['next'] = null
    do {
      const page = historyPage(history, 20, before ?? undefined)
      seen.push(...page.entries.map((known) => indexedUpdate(known, null).anchor))
      before = page.next
    } while (before)

    expect(seen.toSorted()).toEqual(history.map(historyAnchor).toSorted())
  })
})
