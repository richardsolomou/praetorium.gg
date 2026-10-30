import { describe, expect, it } from 'vitest'
import { joinedUnits, loadoutOf, unitLoadoutSchema } from './unitLoadouts'

const unit = {
  choices: [{ key: 'pistol' }, { key: 'relic', kind: 'enhancement' as const }, { key: 'doctrine', kind: 'upgrade' as const }],
}
const pick = {
  key: 7,
  entryId: 'captain',
  catalogueId: 'sm',
  models: 1,
  choices: { pistol: 'plasma-pistol', relic: 'artificer-armour', doctrine: 'honour' },
  spreads: { squad: { bolter: 4 } },
  toggles: { warlord: 1 },
  attachedTo: 2,
  nickname: 'Brother Cato',
  embarkedIn: 3,
  note: 'Deep strike turn two',
}
const alone = (over: Partial<typeof pick> = {}) => loadoutOf([{ pick: { ...pick, ...over }, unit }], 'sm')

describe('loadoutOf', () => {
  it('keeps the datasheet, squad size, wargear and nickname', () => {
    expect(alone()?.pick).toEqual({
      entryId: 'captain',
      models: 1,
      choices: { pistol: 'plasma-pistol' },
      spreads: { squad: { bolter: 4 } },
      nickname: 'Brother Cato',
    })
  })

  it('records the book of an allied unit rather than the roster it stood in', () => {
    expect(alone({ catalogueId: 'knights' })?.catalogueId).toBe('knights')
  })

  it('records the roster book for a unit of the primary army', () => {
    expect(loadoutOf([{ pick: { key: 0, entryId: 'captain' }, unit }], 'mfm-15~sm')?.catalogueId).toBe('mfm-15~sm')
  })

  it('refuses a unit whose choices have not been priced, so an enhancement cannot pass as wargear', () => {
    expect(loadoutOf([{ pick, unit: undefined }], 'sm')).toBeNull()
  })

  it('refuses a group with an unpriced joined unit', () => {
    expect(
      loadoutOf(
        [
          { pick: { key: 1, entryId: 'intercessors' }, unit },
          { pick, unit: undefined },
        ],
        'sm',
      ),
    ).toBeNull()
  })

  it('records a joined unit against the position of the unit it joins', () => {
    const group = [
      { pick: { key: 4, entryId: 'intercessors' }, unit },
      { pick: { key: 9, entryId: 'command', attachedTo: 4 }, unit },
      { pick: { key: 2, entryId: 'protector', attachedTo: 9 }, unit },
    ]
    expect(loadoutOf(group, 'sm')?.joined?.map((joined) => joined.attachedTo)).toEqual([0, 1])
  })

  it('strips enhancements from joined units too', () => {
    const group = [
      { pick: { key: 4, entryId: 'intercessors' }, unit },
      { pick: { ...pick, attachedTo: 4 }, unit },
    ]
    expect(loadoutOf(group, 'sm')?.joined?.[0]?.choices).toEqual({ pistol: 'plasma-pistol' })
  })

  it('leaves out joined units for a lone unit', () => {
    expect(alone()).not.toHaveProperty('joined')
  })
})

describe('joinedUnits', () => {
  const roster = [
    { key: 0, entryId: 'protector', attachedTo: 2 },
    { key: 1, entryId: 'intercessors' },
    { key: 2, entryId: 'command', attachedTo: 1 },
    { key: 3, entryId: 'scouts' },
  ]

  it('orders a chain so each joined unit follows the one it joins', () => {
    expect(joinedUnits(roster, 0, 'sm').map((joined) => joined.entryId)).toEqual(['command', 'protector'])
  })

  it('finds the same group from the bodyguard', () => {
    expect(joinedUnits(roster, 1, 'sm').map((joined) => joined.entryId)).toEqual(['command', 'protector'])
  })

  it('finds nothing for a unit standing alone', () => {
    expect(joinedUnits(roster, 3, 'sm')).toEqual([])
  })

  it('leaves out a unit of another book', () => {
    const allied = [{ key: 0, entryId: 'inquisitor', catalogueId: 'agents', attachedTo: 1 }, roster[1]!]
    expect(joinedUnits(allied, 1, 'sm')).toEqual([])
  })
})

describe('unitLoadoutSchema', () => {
  const loadout = { name: 'Vanguard', catalogueId: 'sm', pick: { entryId: 'intercessors' } }

  it('accepts a joined unit that joins one listed before it', () => {
    expect(unitLoadoutSchema.safeParse({ ...loadout, joined: [{ entryId: 'captain', attachedTo: 0 }] }).success).toBe(true)
  })

  it('refuses a joined unit that joins one listed after it', () => {
    const joined = [
      { entryId: 'captain', attachedTo: 2 },
      { entryId: 'lieutenant', attachedTo: 0 },
    ]
    expect(unitLoadoutSchema.safeParse({ ...loadout, joined }).success).toBe(false)
  })

  it('refuses a joined unit carrying a private note', () => {
    expect(unitLoadoutSchema.safeParse({ ...loadout, joined: [{ entryId: 'captain', attachedTo: 0, note: 'x' }] }).success).toBe(false)
  })
})
