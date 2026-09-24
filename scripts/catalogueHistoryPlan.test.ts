import { describe, expect, it } from 'vitest'
import type { ChangeSource } from '../src/core/catalogueChanges'
import type { CatalogueHistoryEntry } from '../src/core/catalogueHistory'
import {
  compareInOrder,
  dailyCheckpoints,
  type HistoryPoint,
  historyEntry,
  type ListedSnapshot,
  nextHistory,
  parseSnapshotListing,
  snapshotsToCompare,
  upstreamId,
} from './catalogueHistoryPlan'

const id = (digit: string) => digit.repeat(64)
const at = (day: number) => Date.UTC(2026, 8, day)
const listed = (digit: string, day: number): ListedSnapshot => ({ id: id(digit), publishedAt: at(day) })

const page = (entries: string, tail: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>praetorium</Name><Prefix>snapshots/</Prefix>${tail}${entries}</ListBucketResult>`
const contents = (key: string, modified: string) =>
  `<Contents><Key>${key}</Key><LastModified>${modified}</LastModified><ETag>&#34;x&#34;</ETag><Size>1</Size></Contents>`

describe('reading the snapshot listing', () => {
  it('reads each archive by its snapshot id and publication time', () => {
    const xml = page(contents(`snapshots/${id('a')}.zip`, '2026-09-19T10:56:18.139Z'), '<IsTruncated>false</IsTruncated>')

    expect(parseSnapshotListing(xml)).toEqual({
      snapshots: [{ id: id('a'), publishedAt: Date.parse('2026-09-19T10:56:18.139Z') }],
      next: null,
    })
  })

  it('ignores anything under the prefix that is not a snapshot archive', () => {
    expect(parseSnapshotListing(page(contents('snapshots/readme.txt', '2026-09-19T10:56:18.139Z'), '')).snapshots).toEqual([])
  })

  it('hands back the next page token, unescaped, while the listing is truncated', () => {
    const xml = page('', '<NextContinuationToken>c25h&amp;cA==</NextContinuationToken><IsTruncated>true</IsTruncated>')

    expect(parseSnapshotListing(xml).next).toBe('c25h&cA==')
  })
})

describe('choosing the snapshots to compare', () => {
  const all = [listed('c', 20), listed('a', 1), listed('b', 10)]
  const ids = (snapshots: ListedSnapshot[]) => snapshots.map((snapshot) => snapshot.id)

  it('orders them by when they were published', () => {
    expect(ids(snapshotsToCompare(all, []))).toEqual([id('a'), id('b'), id('c')])
  })

  it('leaves revoked snapshots out', () => {
    expect(ids(snapshotsToCompare(all, [id('b')]))).toEqual([id('a'), id('c')])
  })

  it('keeps the snapshot before a date as the baseline for the first one since it', () => {
    expect(ids(snapshotsToCompare(all, [], { since: at(15) }))).toEqual([id('b'), id('c')])
  })

  it('stops at the last snapshot published by a time, keeping that one', () => {
    expect(ids(snapshotsToCompare(all, [], { until: at(10) }))).toEqual([id('a'), id('b')])
  })

  it('keeps the snapshot before the newest few as their baseline', () => {
    expect(ids(snapshotsToCompare(all, [], { last: 1 }))).toEqual([id('b'), id('c')])
  })
})

describe('comparing points in order', () => {
  const run = async (unreadable: readonly string[]) => {
    const pairs: string[] = []
    const result = await compareInOrder(
      ['a', 'b', 'c', 'd'],
      async (point) => {
        if (unreadable.includes(point)) throw new Error('unsupported format')
        return point
      },
      (older, newer) => void pairs.push(`${older.value}${newer.value}`),
    )
    return { pairs, skipped: result.skipped.map((entry) => `${entry.point}: ${entry.reason}`) }
  }

  it('compares each point with the one before it', async () => {
    expect(await run([])).toEqual({ pairs: ['ab', 'bc', 'cd'], skipped: [] })
  })

  it('spans points it cannot read, and names them', async () => {
    expect(await run(['b', 'c'])).toEqual({ pairs: ['ad'], skipped: ['b: unsupported format', 'c: unsupported format'] })
  })

  it('starts from the first point it can read', async () => {
    expect((await run(['a'])).pairs).toEqual(['bc', 'cd'])
  })
})

describe('checkpoints through upstream history', () => {
  const time = (day: number, hour: number) => Date.UTC(2026, 4, day, hour)
  const histories = {
    definitions: [
      { sha: 'd1', at: time(12, 21) },
      { sha: 'd2', at: time(13, 9) },
      { sha: 'd3', at: time(13, 23) },
    ],
    rules: [{ sha: 'r1', at: time(1, 0) }],
  }

  it('takes each source at its last commit on or before the day’s end', () => {
    expect(dailyCheckpoints(histories, '2026-05-13', '2026-05-13')).toEqual([
      { day: '2026-05-13', recordedAt: Date.UTC(2026, 4, 14) - 1, revisions: { definitions: 'd3', rules: 'r1' }, missing: [] },
    ])
  })

  it('leaves out a day on which no source moved', () => {
    expect(dailyCheckpoints(histories, '2026-05-12', '2026-05-16').map((checkpoint) => checkpoint.day)).toEqual([
      '2026-05-12',
      '2026-05-13',
    ])
  })

  it('names a source with no commit yet as missing', () => {
    expect(dailyCheckpoints({ ...histories, datacards: [{ sha: 'g1', at: time(14, 8) }] }, '2026-05-13', '2026-05-14')).toMatchObject([
      { day: '2026-05-13', missing: ['datacards'] },
      { day: '2026-05-14', revisions: { datacards: 'g1' }, missing: [] },
    ])
  })
})

describe('labelling reconstructed history', () => {
  it('names a point in upstream history by its day and a hash of its revisions', () => {
    expect(upstreamId('2026-05-13', { definitions: 'd3', rules: 'r1' })).toMatch(/^upstream:2026-05-13:[0-9a-f]{12}$/)
  })

  it('gives the same revisions the same id whatever order they are written in', () => {
    expect(upstreamId('2026-05-13', { rules: 'r1', definitions: 'd3' })).toBe(upstreamId('2026-05-13', { definitions: 'd3', rules: 'r1' }))
  })

  it('gives different revisions a different id', () => {
    expect(upstreamId('2026-05-13', { definitions: 'd2' })).not.toBe(upstreamId('2026-05-13', { definitions: 'd3' }))
  })

  it('is never mistaken for a snapshot id', () => {
    expect(upstreamId('2026-05-13', { definitions: 'd3' })).not.toMatch(/^[0-9a-f]{64}$/)
  })
})

const source = (points: number): ChangeSource => ({
  datasheets: [],
  detachments: [{ catalogueId: 'orks', faction: 'Orks', id: 'war-horde', name: 'War Horde', points, enhancements: [], upgrades: [] }],
})
const point = (pointId: string, definitions: string, recordedAt = 100): HistoryPoint => ({
  id: pointId,
  revisions: { definitions },
  recordedAt,
})
const recorded = (from: string, definitions: string, recordedAt: number): CatalogueHistoryEntry => ({
  from,
  revisions: { definitions },
  recordedAt,
  changes: {
    factions: [
      {
        catalogueId: 'orks',
        faction: 'Orks',
        changes: [{ kind: 'detachment-points', id: 'war-horde', name: 'War Horde', from: '1', to: '2' }],
      },
    ],
    omitted: 0,
  },
})

describe('an entry in the history', () => {
  it('names where the change started and never the snapshot it arrived in', () => {
    const newer = point(id('b'), 'd2')
    const entry = historyEntry(point(id('a'), 'd1'), newer, { factions: [], omitted: 0 })

    expect({ from: entry.from, carriesNewer: JSON.stringify(entry).includes(newer.id) }).toEqual({ from: id('a'), carriesNewer: false })
  })
})

describe('the history the next snapshot carries', () => {
  const earlier = [recorded('upstream:2026-08-01:aaaaaaaaaaaa', 'd0', 50)]

  it('appends the change since the published snapshot to that snapshot’s history', () => {
    const { history } = nextHistory({
      previous: { point: point(id('a'), 'd1'), history: earlier, source: source(1) },
      seed: null,
      next: { point: point('', 'd2', 200), source: source(2) },
    })

    expect(history?.map((entry) => [entry.from, entry.recordedAt])).toEqual([
      ['upstream:2026-08-01:aaaaaaaaaaaa', 50],
      [id('a'), 200],
    ])
  })

  it('writes the same history again when the sources did not move', () => {
    const { history, appended } = nextHistory({
      previous: { point: point(id('a'), 'd1'), history: earlier, source: source(1) },
      seed: null,
      next: { point: point('', 'd1', 200), source: source(1) },
    })

    expect({ history, appended }).toEqual({ history: earlier, appended: null })
  })

  it('starts from the seed when the published snapshot carries no history', () => {
    const { history } = nextHistory({
      previous: { point: point(id('a'), 'd1'), history: null, source: source(1) },
      seed: earlier,
      next: { point: point('', 'd2', 200), source: source(2) },
    })

    expect(history?.map((entry) => entry.from)).toEqual(['upstream:2026-08-01:aaaaaaaaaaaa', id('a')])
  })

  it('carries the history unchanged when the published snapshot cannot be compiled', () => {
    const { history, appended } = nextHistory({
      previous: { point: point(id('a'), 'd1'), history: earlier, source: null },
      seed: null,
      next: { point: point('', 'd2', 200), source: source(2) },
    })

    expect({ history, appended }).toEqual({ history: earlier, appended: null })
  })

  it('carries only the seed when the published snapshot cannot be read at all', () => {
    expect(nextHistory({ previous: null, seed: earlier, next: { point: point('', 'd2', 200), source: source(2) } }).history).toEqual(
      earlier,
    )
  })

  it('writes no history when there is neither one to carry nor a change to record', () => {
    expect(
      nextHistory({
        previous: { point: point(id('a'), 'd1'), history: null, source: source(1) },
        seed: null,
        next: { point: point('', 'd1', 200), source: source(1) },
      }).history,
    ).toBeNull()
  })
})
