import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { fieldedDatasheets, importableLists, matchingLists, unitCounts, type WinningList } from './winningLists'

const list = (
  id: string,
  catalogueId: string,
  datasheets: string[],
  { detachmentIds = [], limit = 2000, models = [5] }: { detachmentIds?: string[]; limit?: number; models?: number[] } = {},
): WinningList => ({
  id,
  name: '',
  catalogueId,
  detachmentIds,
  disposition: null,
  limit,
  unitCount: datasheets.length,
  datasheets: datasheets.map((datasheet) => ({ id: datasheet, name: datasheet, models })),
  points: 2000,
  reportedPoints: 2000,
  placing: 1,
  record: 'W5 L0 D0',
  event: { name: 'GT', url: null, date: '2026-11-07', rounds: 5, players: 40, source: '40kstats' },
})

it("counts a faction's lists across rules versions and leaves other factions out", () => {
  const lists = [
    list('a', 'mfm-1-6~470a-6daa-9014-12df', ['sammael', 'outriders']),
    list('b', '470a-6daa-9014-12df', ['outriders']),
    list('c', 'a55f-b7b3-6c65-a05f', ['outriders']),
  ]

  expect(unitCounts(lists, '470a-6daa-9014-12df')).toEqual({ lists: 2, units: { sammael: 1, outriders: 2 } })
})

it("counts only a battle size's lists when given one, so a small list is never set beside bigger lists' staples", () => {
  const lists = [list('a', '470a-6daa-9014-12df', ['sammael']), list('b', '470a-6daa-9014-12df', ['outriders'], { limit: 1000 })]

  expect(unitCounts(lists, '470a-6daa-9014-12df', 1000)).toEqual({ lists: 1, units: { outriders: 1 } })
})

it("keeps a faction family's lists that took the detachment at the battle size", () => {
  const lists = [
    list('a', 'mfm-1-6~470a-6daa-9014-12df', [], { detachmentIds: ['gladius'] }),
    list('b', '470a-6daa-9014-12df', [], { detachmentIds: ['ironstorm'] }),
    list('c', '470a-6daa-9014-12df', [], { detachmentIds: ['gladius'], limit: 1000 }),
    list('d', 'a55f-b7b3-6c65-a05f', [], { detachmentIds: ['gladius'] }),
  ]

  expect(matchingLists(lists, '470a-6daa-9014-12df', { detachmentId: 'gladius', battleSize: 2000 }).map(({ id }) => id)).toEqual(['a'])
})

it('ranks datasheets by how many lists field them and sizes by how often they are taken', () => {
  const lists = [list('a', 'x', ['outriders', 'sammael'], { models: [3, 6, 6] }), list('b', 'x', ['outriders'], { models: [3] })]

  expect(fieldedDatasheets(lists)).toEqual([
    { entryId: 'outriders', name: 'outriders', lists: 2, models: [3, 6] },
    { entryId: 'sammael', name: 'sammael', lists: 1, models: [6, 3] },
  ])
})

it('shows a list placed at two events once, at the newer one', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'winning-lists-'))
  const id = '79bd96d67c746de718c92002c798f0ce'
  const placing = (eventId: string, date: string, ranking: number) => ({
    eventId,
    name: eventId,
    date,
    players: [{ ranking, record: 'W4 L1 D0', list: id }],
    source: '40kstats',
  })
  const { id: _, placing: __, record: ___, event: ____, ...verdict } = list(id, 'x', [])
  await fs.writeFile(
    path.join(directory, 'events.json'),
    JSON.stringify([placing('newer', '2026-11-14', 4), placing('older', '2026-11-07', 2)]),
  )
  await fs.writeFile(path.join(directory, 'verdicts.json'), JSON.stringify({ revision: 'r', lists: { [id]: verdict } }))

  expect((await importableLists(directory, 'r'))?.map(({ event }) => event.name)).toEqual(['newer'])
})
