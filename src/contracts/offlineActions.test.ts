import { expect, it } from 'vitest'
import { offlineActionKind, offlineActionSchema } from './offlineActions'
import { currentOfflineAction, RELEASED_OFFLINE_KINDS } from '../core/releasedNames'

it('renames every kind the previous release queued to one this release syncs', () => {
  expect(Array.from(RELEASED_OFFLINE_KINDS.values()).filter((kind) => !offlineActionKind.safeParse(kind).success)).toEqual([])
})

it('syncs a tournament the previous release queued under its old names', () => {
  const action = { owner: 'player', operationId: crypto.randomUUID(), kind: 'createLeague', input: {}, createdAt: 1 }
  expect(offlineActionSchema.parse(currentOfflineAction({ ...action, identifiers: { leagueToken: action.operationId } }))).toMatchObject({
    kind: 'createSealedEvent',
    identifiers: { tournamentToken: action.operationId },
  })
})
