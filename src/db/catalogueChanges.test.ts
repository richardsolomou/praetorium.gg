import { afterEach, expect, it } from 'vitest'
import type { CatalogueChangeSet } from '../core/catalogueChanges'
import type { PraetoriumConnection } from './connection'
import { Repository } from './repository'
import { catalogueChanges } from './schema'
import { openTestDatabase } from './testDatabase'

let connection: PraetoriumConnection | undefined

afterEach(async () => {
  await connection?.close()
  connection = undefined
})

async function repository() {
  connection = await openTestDatabase()
  return new Repository(connection.database)
}

const changed = (to: string): CatalogueChangeSet => ({
  factions: [
    {
      catalogueId: 'marines',
      faction: 'Space Marines',
      changes: [{ kind: 'detachment-points', id: 'gladius', name: 'Gladius Task Force', from: '2', to }],
    },
  ],
  omitted: 0,
})

const record = (fromSnapshot: string, toSnapshot: string, recordedAt: number, changes = changed('3')) => ({
  fromSnapshot,
  toSnapshot,
  recordedAt,
  changes,
})

it('stores one change set for a pair however many replicas record it', async () => {
  const store = await repository()

  const first = await store.recordCatalogueChanges(record('a', 'b', 10))
  const second = await store.recordCatalogueChanges(record('a', 'b', 20, changed('4')))

  expect({ first, second, rows: await connection!.database.select().from(catalogueChanges) }).toMatchObject({
    first: true,
    second: false,
    rows: [{ fromSnapshot: 'a', toSnapshot: 'b', recordedAt: 10 }],
  })
})

it('reads back the change set it stored', async () => {
  const store = await repository()
  await store.recordCatalogueChanges(record('a', 'b', 10))

  expect((await store.catalogueChanges(5))[0]?.changes).toEqual(changed('3'))
})

it('reads the newest change sets first, up to its limit', async () => {
  const store = await repository()
  await store.recordCatalogueChanges(record('a', 'b', 10))
  await store.recordCatalogueChanges(record('b', 'c', 30))
  await store.recordCatalogueChanges(record('c', 'd', 20))

  expect((await store.catalogueChanges(2)).map((set) => set.toSnapshot)).toEqual(['c', 'd'])
})

it('reads only the change sets recorded after a time', async () => {
  const store = await repository()
  await store.recordCatalogueChanges(record('a', 'b', 10))
  await store.recordCatalogueChanges(record('b', 'c', 20))

  expect((await store.catalogueChanges(5, 10)).map((set) => set.toSnapshot)).toEqual(['c'])
})
