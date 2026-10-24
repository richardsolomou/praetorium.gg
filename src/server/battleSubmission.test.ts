import { expect, it, vi } from 'vitest'
import { submittedBattleCommand } from './battleSubmission'
import { frozenRoster } from './rosterUsage'

const frozen = { name: 'Frozen army' }
vi.mock('./rosterUsage', () => ({ rosterForUse: vi.fn(), frozenRoster: vi.fn(async () => frozen) }))

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

const timings = [{ moment: 'turn-start' as const, phase: null, turn: 'your-turn' as const }]

it('fields a guest’s draft with the alerts their browser sent', async () => {
  const reminders = [{ key: 'datasheet:shroud', ability: 'Shroud', description: '', timings }]
  await submittedBattleCommand('guest:battle:0', { kind: 'attach-draft-roster', draft, reminders })
  expect(vi.mocked(frozenRoster).mock.lastCall?.[1]).toEqual(reminders)
})

it('fields a draft from an older build with the alerts it kept per unit, keyed by ability', async () => {
  const kept = { key: 'datasheet:shroud:2', ability: 'Shroud', description: '', unit: { index: 2, name: 'Lord' }, timings }
  const prep = { stratagems: [], secondaries: [], reminders: [kept], remindersEnabled: true }
  await submittedBattleCommand('guest:battle:0', { kind: 'attach-draft-roster', draft: { ...draft, prep } })
  expect(vi.mocked(frozenRoster).mock.lastCall?.[1].map((reminder) => reminder.key)).toEqual(['datasheet:shroud'])
})
