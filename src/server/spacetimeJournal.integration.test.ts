import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { SpacetimeOperator } from './spacetimeOperator'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

const game = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  eventId: null,
  playedOn: '2026-10-03',
  factionId: null,
  army: null,
  opponentName: null,
  opponentFactionId: null,
  score: null,
  opponentScore: null,
  result: 'won' as const,
  notes: null,
  ...overrides,
})

it.skipIf(!url || !database || !token)('records a game once however often it is saved, and only for its owner', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const userId = randomUUID()
  const other = randomUUID()
  const recorded = game({ score: 80, opponentScore: 60 })
  try {
    expect(await operator.saveJournalGame(userId, recorded, 1)).toBe('saved')
    expect(await operator.saveJournalGame(userId, recorded, 2)).toBe('saved')
    expect((await operator.journal(userId)).games).toMatchObject([{ id: recorded.id, score: 80, opponentScore: 60, createdAt: 1 }])
    expect(await operator.saveJournalGame(other, { ...recorded, notes: 'stolen' }, 3)).toBe('forbidden')
    expect(await operator.deleteJournalGame(recorded.id, other)).toBe(false)
    expect((await operator.journal(other)).games).toEqual([])
    expect(await operator.deleteJournalGame(recorded.id, userId)).toBe(true)
    expect((await operator.journal(userId)).games).toEqual([])
  } finally {
    await operator.deleteUserData(userId)
    await operator.deleteUserData(other)
  }
})

it.skipIf(!url || !database || !token)('groups games under the owner’s own events and keeps them when an event goes', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const userId = randomUUID()
  const other = randomUUID()
  const event = { id: randomUUID(), name: 'Club league' }
  const strangerEvent = { id: randomUUID(), name: 'Another club' }
  try {
    expect(await operator.saveJournalEvent(userId, event, 1)).toBe('saved')
    expect(await operator.saveJournalEvent(other, strangerEvent, 1)).toBe('saved')
    const grouped = game({ eventId: event.id })
    expect(await operator.saveJournalGame(userId, grouped, 2)).toBe('saved')
    expect(await operator.saveJournalGame(userId, game({ eventId: strangerEvent.id }), 2)).toBe('no-event')
    expect(await operator.saveJournalEvent(other, { ...event, name: 'Renamed' }, 3)).toBe('forbidden')
    expect(await operator.deleteJournalEvent(event.id, other)).toBe(false)
    expect(await operator.deleteJournalEvent(event.id, userId)).toBe(true)
    expect(await operator.journal(userId)).toMatchObject({ events: [], games: [{ id: grouped.id, eventId: null }] })
  } finally {
    await operator.deleteUserData(userId)
    await operator.deleteUserData(other)
  }
})

it.skipIf(!url || !database || !token)('deletes a player’s journal with their account', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const userId = randomUUID()
  await operator.saveJournalEvent(userId, { id: randomUUID(), name: 'Weekend' }, 1)
  await operator.saveJournalGame(userId, game(), 1)
  await operator.deleteUserData(userId)
  expect(await operator.journal(userId)).toEqual({ events: [], games: [] })
})
