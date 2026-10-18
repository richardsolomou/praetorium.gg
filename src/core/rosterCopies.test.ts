import { describe, expect, it } from 'vitest'
import { copiedPicks, loadoutPick } from './rosterCopies'

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

describe('loadoutPick', () => {
  const loadout = { catalogueId: 'sm', pick: { entryId: 'captain', models: 1, choices: { pistol: 'plasma-pistol' } } }

  it('is offered only to a roster of the same army', () => {
    expect(loadoutPick(loadout, 'orks')).toBeNull()
  })

  it('moves into the destination rules version', () => {
    expect(loadoutPick(loadout, 'preview-x~sm')?.catalogueId).toBe('preview-x~sm')
  })

  it('moves from an older rules version into current rules', () => {
    expect(loadoutPick({ ...loadout, catalogueId: 'preview-x~sm' }, 'sm')?.catalogueId).toBe('sm')
  })

  it('keeps a choice the destination may lack, so pricing reports it instead of dropping it', () => {
    expect(loadoutPick(loadout, 'preview-x~sm')?.choices).toEqual({ pistol: 'plasma-pistol' })
  })
})

describe('copiedPicks', () => {
  it('takes out every note', () => {
    expect(copiedPicks([pick, { entryId: 'scouts', note: 'Infiltrate' }], 'sm').map((copy) => copy.note)).toEqual([undefined, undefined])
  })

  it('keeps attachments, which still point inside the copied army', () => {
    expect(copiedPicks([pick], 'sm')[0]?.attachedTo).toBe(2)
  })
})
