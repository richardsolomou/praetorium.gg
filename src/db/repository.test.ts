import { afterEach, expect, it } from 'vitest'
import type { PraetoriumConnection } from './connection'
import { Repository } from './repository'
import { battleUsers, battles, commands, user } from './schema'
import { openTestDatabase } from './testDatabase'

let connection: PraetoriumConnection | undefined

afterEach(async () => {
  await connection?.close()
  connection = undefined
})

async function users(count: number) {
  connection = await openTestDatabase()
  const createdAt = new Date('2026-01-01T00:00:00Z')
  await connection.database.insert(user).values(
    Array.from({ length: count }, (_, index) => ({
      id: `user-${index.toString().padStart(3, '0')}`,
      name: index === 0 ? 'Needle Player' : `Player ${index}`,
      email: `player-${index}@example.test`,
      emailVerified: false,
      createdAt: new Date(createdAt.getTime() + index),
      updatedAt: createdAt,
    })),
  )
  return new Repository(connection.database)
}

it('paginates administrator users without overlap', async () => {
  const repository = await users(12)
  const first = await repository.adminUsers({ limit: 5 })
  const second = await repository.adminUsers({ limit: 5, cursor: first.nextCursor })

  expect(new Set([...first.users, ...second.users].map((entry) => entry.id)).size).toBe(10)
})

it('searches users outside the first administrator page', async () => {
  const repository = await users(60)

  const found = await repository.adminUsers({ query: 'Needle', limit: 10 })

  expect(found.users.map((entry) => entry.name)).toEqual(['Needle Player'])
})

it('reads a log past a command kind it does not recognise', async () => {
  const repository = await users(1)
  const database = connection!.database
  await database.insert(battles).values({ id: 'battle-000', token: 'token-000', createdAt: 0 })
  await database.insert(battleUsers).values({ battleId: 'battle-000', userId: 'user-000', side: 0, joinedAt: 0 })
  await database.insert(commands).values([
    { battleId: 'battle-000', seq: 1, userId: 'user-000', at: 1, body: JSON.stringify({ kind: 'reopen-battle' }) },
    { battleId: 'battle-000', seq: 2, userId: 'user-000', at: 2, body: JSON.stringify({ kind: 'command-from-a-newer-release' }) },
    { battleId: 'battle-000', seq: 3, userId: 'user-000', at: 3, body: JSON.stringify({ kind: 'pause-clock' }) },
  ])

  const log = await repository.log('battle-000')
  const history = await repository.battlesByUser('user-000')

  expect(log.map((entry) => entry.command.kind)).toEqual(['reopen-battle', 'pause-clock'])
  expect(history[0]?.log.map((entry) => entry.command.kind)).toEqual(['reopen-battle', 'pause-clock'])
})
