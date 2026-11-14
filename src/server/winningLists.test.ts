import { expect, it } from 'vitest'
import { unitCounts, type WinningList } from './winningLists'

const list = (id: string, catalogueId: string, datasheets: string[]): WinningList => ({
  id,
  name: '',
  catalogueId,
  detachmentIds: [],
  disposition: null,
  limit: 2000,
  unitCount: datasheets.length,
  datasheets: datasheets.map((datasheet) => ({ id: datasheet, name: datasheet, models: [5] })),
  points: 2000,
  reportedPoints: 2000,
  placing: 1,
  record: 'W5 L0 D0',
  event: { name: 'GT', url: null, date: '2026-11-07', rounds: 5, players: 40 },
})

it("counts a faction's lists across rules versions and leaves other factions out", () => {
  const lists = [
    list('a', 'mfm-1-6~470a-6daa-9014-12df', ['sammael', 'outriders']),
    list('b', '470a-6daa-9014-12df', ['outriders']),
    list('c', 'a55f-b7b3-6c65-a05f', ['outriders']),
  ]

  expect(unitCounts(lists, '470a-6daa-9014-12df')).toEqual({ lists: 2, units: { sammael: 1, outriders: 2 } })
})
