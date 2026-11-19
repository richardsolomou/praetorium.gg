import { expect, it } from 'vitest'
import type { SqliteAccountRepository } from '../accountRepository'
import type { SpacetimeOperator } from '../spacetimeOperator'
import { RepositoryArea } from './area'
import { withSealedEvents } from './sealedEvents'

const entry = (userId: string, squadId: string, status = 'accepted') => ({
  key: userId,
  eventId: 'event',
  userId,
  status,
  joinedAt: 1,
  rosterId: null,
  rosterName: null,
  rosterSnapshot: '{}',
  submittedAt: 1,
  requiredLimit: null,
  teamId: null,
  droppedAt: null,
  checkedInAt: null,
  squadId,
})

/** Team A has locked in its defender for step 0 of round 1's meeting; team B hasn't chosen. */
const record = {
  kind: 'tournament',
  token: 'cup',
  tournament: null,
  group: null,
  event: { token: 'event', format: '1v1', rosterLimit: 2000, revealedAt: 1, revealedBy: null, teamSize: 3, teamScoring: 'games' },
  organizerIds: ['organizer'],
  entries: [entry('a1', 'A'), entry('b1', 'B'), entry('gone', 'A', 'rejected')],
  teams: [],
  teamWarlords: [],
  pairings: [],
  squads: [],
  squadMatches: [{ round: 1, table: 1, aId: 'A', bId: 'B' }],
  squadPicks: [{ round: 1, table: 1, squadId: 'A', step: 0, userIds: ['a1'] }],
  battlefields: [],
}

const SealedEvents = withSealedEvents(RepositoryArea)
const repository = new SealedEvents(
  {
    profilesByIds: async (ids: string[]) => new Map(ids.map((id) => [id, { name: id, image: null, colour: null }])),
  } as unknown as SqliteAccountRepository,
  { sealedEventByToken: async () => record } as unknown as SpacetimeOperator,
)
const meetingAs = async (viewerId: string) => (await repository.sealedEventByToken('cup', viewerId))!.squadMatches[0]!

it.each(['b1', 'organizer', 'gone', 'outsider'])('keeps a team’s pending pick from %s', async (viewerId) => {
  expect(await meetingAs(viewerId)).toMatchObject({ revealed: [], chosen: null, ready: ['A'] })
})

it('shows a team its own pending pick', async () => {
  expect((await meetingAs('a1')).chosen).toEqual(['a1'])
})
