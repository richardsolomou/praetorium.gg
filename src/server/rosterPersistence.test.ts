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
})
