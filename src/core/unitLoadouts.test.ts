import { describe, expect, it } from 'vitest'
import { loadoutOf } from './unitLoadouts'

const unit = {
  choices: [{ key: 'pistol' }, { key: 'relic', kind: 'enhancement' as const }, { key: 'doctrine', kind: 'upgrade' as const }],
}
const pick = {
  entryId: 'captain',
  catalogueId: 'sm',
  models: 1,
  choices: { pistol: 'plasma-pistol', relic: 'artificer-armour', doctrine: 'honour' },
  spreads: { squad: { bolter: 4 } },
  toggles: { warlord: 1 },
  attachedTo: 2,
  note: 'Deep strike turn two',
}

describe('loadoutOf', () => {
  it('keeps the datasheet, squad size and wargear', () => {
    expect(loadoutOf(pick, 'sm', unit)?.pick).toEqual({
      entryId: 'captain',
      models: 1,
      choices: { pistol: 'plasma-pistol' },
      spreads: { squad: { bolter: 4 } },
    })
  })

  it('never keeps the private note', () => {
    expect(loadoutOf(pick, 'sm', unit)?.pick).not.toHaveProperty('note')
  })

  it('records the book of an allied unit rather than the roster it stood in', () => {
    expect(loadoutOf({ ...pick, catalogueId: 'knights' }, 'sm', unit)?.catalogueId).toBe('knights')
  })

  it('records the roster book for a unit of the primary army', () => {
    expect(loadoutOf({ entryId: 'captain' }, 'mfm-15~sm', unit)?.catalogueId).toBe('mfm-15~sm')
  })

  it('refuses a unit whose choices have not been priced, so an enhancement cannot pass as wargear', () => {
    expect(loadoutOf(pick, 'sm', undefined)).toBeNull()
  })
})
