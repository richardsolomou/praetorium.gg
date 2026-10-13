import { describe, expect, it } from 'vitest'
import { rosterFromRow } from './rosterPersistence'

const row = {
  id: 'roster',
  name: 'Public roster',
  catalogueId: 'catalogue',
  detachmentId: '[]',
  disposition: null,
  limit: 2_000,
  createdAt: 1,
  updatedAt: 2,
  picks: '[]',
  prep: 'not json',
  waivedRules: '[]',
  optionalRules: '[]',
  borrowedDetachmentId: null,
  visibility: 'public',
  source: 'editable',
} as Parameters<typeof rosterFromRow>[0]

describe('rosterFromRow', () => {
  it('retains the saved codex and allied selections when reloading a list', () => {
    expect(
      rosterFromRow({ ...row, catalogueId: 'codex~catalogue', picks: '[{"entryId":"guard","catalogueId":"codex~allies","models":5}]' }),
    ).toMatchObject({
      catalogueId: 'codex~catalogue',
      picks: [{ entryId: 'guard', catalogueId: 'codex~allies', models: 5 }],
    })
  })
  it('does not parse private preparation data for a public roster read', () => {
    expect(rosterFromRow(row)).toMatchObject({ id: 'roster', prep: null })
  })

  it('validates preparation data when the caller requests it', () => {
    expect(() => rosterFromRow(row, true)).toThrow()
  })

  it('keeps a stored automatic name distinct from a name the player chose', () => {
    expect(rosterFromRow({ ...row, name: 'CL 2K', automaticName: true }).automaticName).toBe(true)
  })

  it('reads migrated unnamed rows as automatic', () => {
    expect(rosterFromRow({ ...row, name: '', automaticName: true }).automaticName).toBe(true)
  })

  it('reads a retired Marine profile roster against its original rules', () => {
    expect(
      rosterFromRow({
        ...row,
        catalogueId: 'a603-5039-f08d-e841',
        detachmentId: '["profile-detachment-option-a603-5039-f08d-e841-f367-3240-47c1-7e1a"]',
        picks: '[{"entryId":"profile-unit-a603-5039-f08d-e841-5302-e1f9-0338-76f9"}]',
      }),
    ).toMatchObject({
      catalogueId: 'legacy-profiles~a603-5039-f08d-e841',
      detachmentIds: ['profile-detachment-option-a603-5039-f08d-e841-f367-3240-47c1-7e1a'],
      picks: [{ entryId: 'profile-unit-a603-5039-f08d-e841-5302-e1f9-0338-76f9' }],
    })
  })
})

it('does not migrate saved loadouts before resolving their retained catalogue edition', () => {
  const pick = {
    entryId: '8b71-580f-ad19-83d7',
    choices: { '692c-f7be-75d4-ba2d/f1f6-718e-222f-9ed5': 'b440-75d0-9e95-486a' },
  }
  expect(rosterFromRow({ ...row, catalogueId: 'previous~f89b-84e0-6e3b-f1e2', picks: JSON.stringify([pick]) }).picks).toEqual([pick])
})
