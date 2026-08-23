/** Pure visibility rules for roster-reveal events. */

export type EventRosterSnapshot = {
  id: string
  name: string
  catalogueId: string
  detachmentId: string | null
  disposition: string | null
  limit: number
  picks: string
  prep: string | null
  tags: string
  source: string
  updatedAt: number
}

export type EventRecord = {
  id: string
  name: string
  creatorId: string
  createdAt: number
  revealedAt: number | null
}

export type EventParticipantRecord = {
  userId: string
  name: string
  image: string | null
  limit: number
  rosterId: string | null
  sealedAt: number | null
  snapshot: EventRosterSnapshot | null
}

export type EventView = EventRecord & {
  viewerId: string
  sealedCount: number
  participants: Array<
    Omit<EventParticipantRecord, 'snapshot'> & {
      roster: Pick<EventRosterSnapshot, 'id' | 'name' | 'catalogueId' | 'limit' | 'updatedAt'> | null
    }
  >
}

/** A submission belongs only to its author until the event reveals. */
export function eventView(event: EventRecord, participants: EventParticipantRecord[], viewerId: string): EventView | null {
  if (!participants.some((participant) => participant.userId === viewerId)) return null
  return {
    ...event,
    viewerId,
    sealedCount: participants.filter((participant) => participant.sealedAt !== null).length,
    participants: participants.map(({ snapshot, ...participant }) => {
      const mayReadRoster = event.revealedAt !== null || participant.userId === viewerId
      return {
        ...participant,
        rosterId: mayReadRoster ? participant.rosterId : null,
        roster:
          snapshot && mayReadRoster
            ? {
                id: snapshot.id,
                name: snapshot.name,
                catalogueId: snapshot.catalogueId,
                limit: snapshot.limit,
                updatedAt: snapshot.updatedAt,
              }
            : null,
      }
    }),
  }
}
