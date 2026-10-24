import { expect, it } from 'vitest'
import type { Roster } from './battle'
import { nicknamedUnit, rosterWithoutUnitNotes, withoutUnitNotes } from './unitNotes'

const sealed: Roster = {
  name: 'Army',
  text: 'Alpha · Intercessor Squad — 80',
  built: {
    catalogueId: 'marines',
    revision: 'revision',
    limit: 2_000,
    detachment: null,
    disposition: null,
    picks: [{ entryId: 'intercessors', nickname: 'Alpha', note: 'Hold home.' }],
    units: [{ key: '0-intercessors', name: 'Intercessor Squad', nickname: 'Alpha', note: 'Hold home.', points: 80, models: 5 }],
  },
}

it('keeps the datasheet name beside a nickname', () => {
  expect(nicknamedUnit('Intercessor Squad', 'Alpha')).toBe('Alpha · Intercessor Squad')
})

it('names a unit without a nickname by its datasheet', () => {
  expect(nicknamedUnit('Intercessor Squad')).toBe('Intercessor Squad')
})

it('takes the notes out of picks and leaves their nicknames', () => {
  expect(withoutUnitNotes([{ entryId: 'intercessors', nickname: 'Alpha', note: 'Hold home.' }])).toEqual([
    { entryId: 'intercessors', nickname: 'Alpha' },
  ])
})

it('takes the notes out of a frozen army’s units and picks', () => {
  expect(JSON.stringify(rosterWithoutUnitNotes(sealed))).not.toContain('Hold home.')
})

it('keeps a frozen army’s nicknames on its units and picks', () => {
  const { built } = rosterWithoutUnitNotes(sealed)
  expect([built?.units[0]?.nickname, built?.picks?.[0]?.nickname]).toEqual(['Alpha', 'Alpha'])
})

it('leaves the original frozen army unchanged', () => {
  rosterWithoutUnitNotes(sealed)
  expect(sealed.built?.units[0]?.note).toBe('Hold home.')
})
