import { describe, expect, it } from 'vitest'
import type { RosterPick } from '../core/roster'
import { picksAfterDetachmentChange } from './rosterPicks'

describe('changing roster detachments', () => {
  const picks: RosterPick[] = [
    { entryId: 'captain', choices: { weapon: 'sword', relic: 'honour-vehement', doctrine: 'captain-upgrade' } },
    { entryId: 'intercessors', choices: { rifle: 'bolt-rifle' } },
  ]
  const units = [
    {
      choices: [{ key: 'weapon' }, { key: 'relic', kind: 'enhancement' as const }, { key: 'doctrine', kind: 'upgrade' as const }],
    },
    { choices: [{ key: 'rifle' }] },
  ]

  it('clears enhancements and upgrades when a detachment is replaced', () => {
    expect(picksAfterDetachmentChange(picks, units, ['awakened'], ['obeisance'])).toEqual([
      { entryId: 'captain', choices: { weapon: 'sword' } },
      { entryId: 'intercessors', choices: { rifle: 'bolt-rifle' } },
    ])
  })

  it('clears enhancements and upgrades when a detachment is removed', () => {
    expect(picksAfterDetachmentChange(picks, units, ['awakened', 'obeisance'], ['awakened'])).toEqual([
      { entryId: 'captain', choices: { weapon: 'sword' } },
      { entryId: 'intercessors', choices: { rifle: 'bolt-rifle' } },
    ])
  })

  it('keeps enhancements and upgrades when another detachment is added', () => {
    expect(picksAfterDetachmentChange(picks, units, ['awakened'], ['awakened', 'obeisance'])).toEqual(picks)
  })

  it('keeps enhancements and upgrades when the detachments do not change', () => {
    expect(picksAfterDetachmentChange(picks, units, ['awakened', 'obeisance'], ['obeisance', 'awakened'])).toEqual(picks)
  })
})
