import { expect, it, vi } from 'vitest'
import { submittedBattleCommand } from './battleSubmission'

const frozen = { name: 'Frozen army' }
vi.mock('./rosterUsage', () => ({ rosterForUse: vi.fn(), frozenRoster: async () => frozen }))

const draft = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Guest army',
  catalogueId: 'necrons',
  detachmentIds: [],
  disposition: null,
  borrowedDetachmentId: null,
  limit: 2000,
  picks: [],
  prep: null,
  visibility: 'private' as const,
  source: 'editable' as const,
}

it('fields the draft a guest built, frozen by the server', async () => {
  expect(await submittedBattleCommand('guest:battle:0', { kind: 'attach-draft-roster', draft })).toEqual({
    kind: 'attach-roster',
    roster: frozen,
    prep: null,
    painted: true,
  })
})

it('asks an account to save a list before fielding it', async () => {
  await expect(submittedBattleCommand('host', { kind: 'attach-draft-roster', draft })).rejects.toMatchObject({ status: 400 })
})
