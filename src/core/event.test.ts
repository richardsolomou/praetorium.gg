import { describe, expect, it } from 'vitest'
import { eventView, type EventParticipantRecord, type EventRecord } from './event'

const event: EventRecord = { id: 'event', name: 'Open play', creatorId: 'alice', createdAt: 1, revealedAt: null }
const snapshot = {
  id: 'roster',
  name: 'Hidden army',
  catalogueId: 'book',
  detachmentId: null,
  disposition: null,
  limit: 1000,
  picks: '[]',
  prep: null,
  tags: '[]',
  source: 'editable',
  updatedAt: 2,
}
const participants: EventParticipantRecord[] = [
  { userId: 'alice', name: 'Alice', image: null, limit: 1000, rosterId: 'roster', sealedAt: 3, snapshot },
  { userId: 'bob', name: 'Bob', image: null, limit: 1000, rosterId: 'other', sealedAt: 3, snapshot: { ...snapshot, id: 'other' } },
]

describe('eventView', () => {
  it('shows only the viewer roster before reveal', () => {
    const view = eventView(event, participants, 'alice')!
    expect(view.participants.map((participant) => participant.roster?.id ?? null)).toEqual(['roster', null])
    expect(view.participants.map((participant) => participant.rosterId)).toEqual(['roster', null])
  })

  it('shows every roster after reveal', () => {
    const view = eventView({ ...event, revealedAt: 4 }, participants, 'alice')!
    expect(view.participants.map((participant) => participant.roster?.id)).toEqual(['roster', 'other'])
  })

  it('refuses non-participants', () => expect(eventView(event, participants, 'carol')).toBeNull())
})
