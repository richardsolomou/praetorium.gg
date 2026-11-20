import { expect, it } from 'vitest'
import type { SqliteAccountRepository } from '../accountRepository'
import type { SpacetimeOperator } from '../spacetimeOperator'
import { RepositoryArea } from './area'
import { withSealedEvents } from './sealedEvents'

/** A private group's game, as anyone reaches it from one of its public battles: by the game's token alone. */
const record = {
  kind: 'group',
  token: 'invite',
  tournament: null,
  group: { token: 'invite', name: 'Group' },
  event: { token: 'game', format: '1v1', rosterLimit: 2000, revealedAt: 1, revealedBy: null, teamSize: null, teamScoring: null },
  privateTo: ['member'],
  organizerIds: [],
  entries: [],
  teams: [],
  teamWarlords: [],
  pairings: [],
  squads: [],
  squadMatches: [],
  squadPicks: [],
  battlefields: [],
}

const repository = new (withSealedEvents(RepositoryArea))(
  { profilesByIds: async () => new Map() } as unknown as SqliteAccountRepository,
  { sealedEventByToken: async () => record } as unknown as SpacetimeOperator,
)

it('opens a private group’s game to its members alone', async () => {
  const opens = (viewerId: string | null) => repository.sealedEventByToken('game', viewerId).then(Boolean)
  expect([await opens('member'), await opens('stranger'), await opens(null)]).toEqual([true, false, false])
})
