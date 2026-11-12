import { describe, expect, it } from 'vitest'
import { battleTable } from './rematch'

const seat = (id: string, side: number, rosterId?: string, automated = false) => ({
  id,
  side,
  name: id,
  automated,
  roster: rosterId ? ({ id: rosterId } as never) : null,
})

describe('battle table', () => {
  it('fields only the reader’s own list again, leaving the opponent to choose theirs', () => {
    const table = battleTable({ viewerId: 'bob', players: [seat('alice', 0, 'alice-list'), seat('bob', 1, 'bob-list')] })

    expect(table?.seats).toEqual({ allyId: null, opponentIds: ['alice'], guestNames: [], rosterId: 'bob-list' })
  })

  it('seats a guest again by name, since a guest seat ends with its battle', () => {
    const table = battleTable({ viewerId: 'alice', players: [seat('alice', 0), seat('guest:battle:1', 1, 'draft', true)] })

    expect(table?.seats?.guestNames).toEqual(['guest:battle:1'])
  })

  it('names no rival in a battle with a practice seat, which counts in no record', () => {
    const table = battleTable({ viewerId: 'alice', players: [seat('alice', 0), seat('bot', 0, undefined, true), seat('bob', 1)] })

    expect(table?.rival).toBeNull()
  })

  it('names the lone account across the table as the rival', () => {
    const table = battleTable({ viewerId: 'alice', players: [seat('alice', 0), seat('bob', 1)] })

    expect(table?.rival?.id).toBe('bob')
  })
})
