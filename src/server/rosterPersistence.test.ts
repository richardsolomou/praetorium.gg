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
  it('does not parse private preparation data for a public roster read', () => {
    expect(rosterFromRow(row)).toMatchObject({ id: 'roster', prep: null })
  })

  it('validates preparation data when the caller requests it', () => {
    expect(() => rosterFromRow(row, true)).toThrow()
  })

  it('keeps a stored automatic name distinct from a name the player chose', () => {
    expect(rosterFromRow({ ...row, name: 'CL 2K', automaticName: true }).automaticName).toBe(true)
  })

  it('treats existing unnamed rows as automatic', () => {
    expect(rosterFromRow({ ...row, name: '', automaticName: null }).automaticName).toBe(true)
  })

  it('reads a list saved against the retired Marine codex under current ids', () => {
    expect(
      rosterFromRow({
        ...row,
        catalogueId: 'a603-5039-f08d-e841',
        detachmentId: '["profile-detachment-option-a603-5039-f08d-e841-f367-3240-47c1-7e1a"]',
        picks: '[{"entryId":"profile-unit-a603-5039-f08d-e841-5302-e1f9-0338-76f9"}]',
      }),
    ).toMatchObject({
      catalogueId: '4029-9237-e8db-af55',
      detachmentIds: ['d2dc-693e-b491-b16d'],
      picks: [{ entryId: '984d-c25b-86dd-9970' }],
    })
  })
})
