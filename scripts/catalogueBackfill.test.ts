import { afterEach, describe, expect, it } from 'vitest'
import type { CatalogueChangeSet } from '../src/core/catalogueChanges'
import type { PraetoriumConnection } from '../src/db/connection'
import { Repository } from '../src/db/repository'
import { catalogueChanges as changesTable } from '../src/db/schema'
import { openTestDatabase } from '../src/db/testDatabase'
import {
  type ChangeRecord,
  compareInOrder,
  insertStatements,
  type ListedSnapshot,
  parseSnapshotListing,
  snapshotsToCompare,
  sqlString,
} from './catalogueBackfill'

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
    const xml = page(contents('snapshots/readme.txt', '2026-09-19T10:56:18.139Z'), '<IsTruncated>false</IsTruncated>')

    expect(parseSnapshotListing(xml).snapshots).toEqual([])
  })

  it('hands back the next page token, unescaped, while the listing is truncated', () => {
    const xml = page('', '<NextContinuationToken>c25h&amp;cA==</NextContinuationToken><IsTruncated>true</IsTruncated>')

    expect(parseSnapshotListing(xml).next).toBe('c25h&cA==')
  })
})

describe('choosing the snapshots to compare', () => {
  const all = [listed('c', 20), listed('a', 1), listed('b', 10)]

  it('orders them by when they were published', () => {
    expect(snapshotsToCompare(all, []).map((snapshot) => snapshot.id)).toEqual([id('a'), id('b'), id('c')])
  })

  it('leaves revoked snapshots out', () => {
    expect(snapshotsToCompare(all, [id('b')]).map((snapshot) => snapshot.id)).toEqual([id('a'), id('c')])
  })

  it('keeps the snapshot before a date as the baseline for the first one since it', () => {
    expect(snapshotsToCompare(all, [], { since: at(15) }).map((snapshot) => snapshot.id)).toEqual([id('b'), id('c')])
  })

  it('keeps the snapshot before the newest few as their baseline', () => {
    expect(snapshotsToCompare(all, [], { last: 1 }).map((snapshot) => snapshot.id)).toEqual([id('b'), id('c')])
  })

  it('compares nothing when nothing was published since the date', () => {
    expect(snapshotsToCompare(all, [], { since: at(25) })).toEqual([])
  })
})

describe('comparing snapshots in order', () => {
  const run = async (unreadable: readonly string[]) => {
    const pairs: string[] = []
    const result = await compareInOrder(
      [listed('a', 1), listed('b', 2), listed('c', 3), listed('d', 4)],
      async (snapshot) => {
        if (unreadable.includes(snapshot.id)) throw new Error('unsupported format')
        return snapshot.id[0]!
      },
      async (older, newer) => void pairs.push(`${older.value}${newer.value}`),
    )
    return { pairs, skipped: result.skipped.map((entry) => `${entry.snapshot.id[0]}: ${entry.reason}`) }
  }

  it('compares each snapshot with the one before it', async () => {
    expect(await run([])).toEqual({ pairs: ['ab', 'bc', 'cd'], skipped: [] })
  })

  it('compares across a snapshot it cannot read, and names it', async () => {
    expect(await run([id('b'), id('c')])).toEqual({ pairs: ['ad'], skipped: ['b: unsupported format', 'c: unsupported format'] })
  })

  it('starts from the first snapshot it can read', async () => {
    expect((await run([id('a')])).pairs).toEqual(['bc', 'cd'])
  })
})

const changed = (name: string): CatalogueChangeSet => ({
  factions: [{ catalogueId: 'orks', faction: 'Orks', changes: [{ kind: 'datasheet-removed', id: 'boyz', name }] }],
  omitted: 0,
})
const record = (name: string): ChangeRecord => ({ fromSnapshot: id('a'), toSnapshot: id('b'), recordedAt: at(2), changes: changed(name) })

describe('the SQL a backfill writes', () => {
  it('doubles a quote inside a string', () => {
    expect(sqlString("Big'Mek")).toBe("'Big''Mek'")
  })

  let connection: PraetoriumConnection | undefined
  afterEach(async () => {
    await connection?.close()
    connection = undefined
  })

  const apply = async (sql: string) => {
    const client = (connection!.database as unknown as { $client: { exec: (sql: string) => Promise<unknown> } }).$client
    await client.exec(sql)
  }

  it('stores a datasheet name with a quote and a backslash exactly as written', async () => {
    connection = await openTestDatabase()
    const name = String.raw`Da Boss's "Big" \ Squad`

    await apply(insertStatements([record(name)]))

    expect((await new Repository(connection.database).catalogueChanges(5))[0]?.changes).toEqual(changed(name))
  })

  it('stores a pair once however many times it is applied, beside the repository', async () => {
    connection = await openTestDatabase()
    await new Repository(connection.database).recordCatalogueChanges(record('Boyz'))

    await apply(insertStatements([record("Ork 'Boyz'")]))
    await apply(insertStatements([record("Ork 'Boyz'")]))

    expect(await connection.database.select().from(changesTable)).toHaveLength(1)
  })
})
