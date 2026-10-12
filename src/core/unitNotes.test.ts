import { expect, it } from 'vitest'
import type { Roster } from './battle'
import { rosterWithoutUnitNotes, withoutUnitNotes } from './unitNotes'

const sealed: Roster = {
  name: 'Army',
  text: 'Intercessor Squad — 80',
  built: {
    catalogueId: 'marines',
    revision: 'revision',
    limit: 2_000,
    detachment: null,
    disposition: null,
    picks: [{ entryId: 'intercessors', note: 'Hold home.' }],
    units: [{ key: '0-intercessors', name: 'Intercessor Squad', note: 'Hold home.', points: 80, models: 5 }],
  },
}

it('takes the notes out of picks and leaves the rest', () => {
  expect(withoutUnitNotes([{ entryId: 'intercessors', models: 5, note: 'Hold home.' }])).toEqual([{ entryId: 'intercessors', models: 5 }])
})

it('takes the notes out of a frozen army’s units and picks', () => {
  expect(JSON.stringify(rosterWithoutUnitNotes(sealed))).not.toContain('Hold home.')
})

it('leaves the original frozen army unchanged', () => {
  rosterWithoutUnitNotes(sealed)
  expect(sealed.built?.units[0]?.note).toBe('Hold home.')
})
