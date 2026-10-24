import { describe, expect, it } from 'vitest'
import { copiedPicks, loadoutPicks } from './rosterCopies'

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

describe('loadoutPicks', () => {
  const loadout = { catalogueId: 'sm', pick: { entryId: 'captain', models: 1, choices: { pistol: 'plasma-pistol' } } }
  const group = { ...loadout, joined: [{ entryId: 'lieutenant', attachedTo: 0 }] }

  it('is offered only to a roster of the same army', () => {
    expect(loadoutPicks(loadout, 'orks')).toBeNull()
  })

  it('moves into the destination rules version', () => {
    expect(loadoutPicks(loadout, 'preview-x~sm')?.[0]?.catalogueId).toBe('preview-x~sm')
  })

  it('moves from an older rules version into current rules', () => {
    expect(loadoutPicks({ ...loadout, catalogueId: 'preview-x~sm' }, 'sm')?.[0]?.catalogueId).toBe('sm')
  })

  it('keeps a choice the destination may lack, so pricing reports it instead of dropping it', () => {
    expect(loadoutPicks(loadout, 'preview-x~sm')?.[0]?.choices).toEqual({ pistol: 'plasma-pistol' })
  })

  it('lists joined units after the unit they join', () => {
    expect(loadoutPicks(group, 'sm')?.map((copy) => copy.entryId)).toEqual(['captain', 'lieutenant'])
  })

  it('keeps each joined unit pointing at its position in the result', () => {
    expect(loadoutPicks(group, 'sm')?.[1]?.attachedTo).toBe(0)
  })

  it('moves joined units into the destination rules version', () => {
    expect(loadoutPicks(group, 'preview-x~sm')?.[1]?.catalogueId).toBe('preview-x~sm')
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
