import { describe, expect, it } from 'vitest'
import type { UnitGroup } from '../../../../core/unitGroups'
import { rosterShelves, unitRoleRows } from './shelves'

const card = (key: number, name: string, group: UnitGroup, joins?: { to: number; as: 'leader' | 'support' }) => ({
  key,
  name,
  group,
  attachedTo: joins?.to,
  attaches: joins?.as,
})

const roster = [
  card(0, 'Tempestus Scions', 'battleline'),
  card(1, 'Militarum Tempestus Command Squad', 'infantry', { to: 0, as: 'support' }),
  card(2, 'Commissar Yarrick', 'epic-hero', { to: 0, as: 'leader' }),
  card(3, 'Nork Deddog', 'epic-hero', { to: 0, as: 'support' }),
  card(4, 'Inquisitor Coteaz', 'epic-hero'),
  card(5, 'Cadian Shock Troops', 'battleline'),
]

type Card = ReturnType<typeof card>
const names = (shelves: ReturnType<typeof rosterShelves<Card>>) =>
  shelves.map((shelf) => [shelf.plural, shelf.entries.map((members) => members.map((unit) => unit.name))])

describe('rosterShelves', () => {
  it('shelves every datasheet by its own role', () => {
    expect(names(rosterShelves(roster, 'role'))).toEqual([
      ['Epic heroes', [['Commissar Yarrick'], ['Inquisitor Coteaz'], ['Nork Deddog']]],
      ['Battleline', [['Cadian Shock Troops'], ['Tempestus Scions']]],
      ['Infantry', [['Militarum Tempestus Command Squad']]],
    ])
  })

  it('lists an attached unit with the unit they joined first, then leaders, then support', () => {
    const battleline = rosterShelves(roster, 'attached').find((shelf) => shelf.plural === 'Battleline')

    expect(battleline?.entries.find((members) => members.length > 1)?.map((unit) => unit.name)).toEqual([
      'Tempestus Scions',
      'Commissar Yarrick',
      'Militarum Tempestus Command Squad',
      'Nork Deddog',
    ])
  })

  it('shelves each attached unit by the role of the unit its leaders and support joined', () => {
    expect(names(rosterShelves(roster, 'attached'))).toEqual([
      ['Epic heroes', [['Inquisitor Coteaz']]],
      [
        'Battleline',
        [['Cadian Shock Troops'], ['Tempestus Scions', 'Commissar Yarrick', 'Militarum Tempestus Command Squad', 'Nork Deddog']],
      ],
    ])
  })

  it('counts an attached unit once on its shelf', () => {
    const shelves = rosterShelves(
      [
        card(0, 'Immortals', 'battleline'),
        card(1, 'Overlord', 'character', { to: 0, as: 'leader' }),
        card(2, 'Immortals', 'battleline'),
        card(3, 'Plasmancer', 'character', { to: 2, as: 'leader' }),
      ],
      'attached',
    )

    expect(shelves.map((shelf) => [shelf.plural, shelf.count])).toEqual([['Battleline', 2]])
  })

  it("leads a shelf with the Warlord's attached unit", () => {
    const shelves = rosterShelves(
      [
        ...roster,
        { ...card(6, 'Arbites', 'battleline'), warlord: false },
        { ...card(7, 'Lord Solar', 'character', { to: 5, as: 'leader' }), warlord: true },
      ],
      'attached',
    )

    expect(shelves.find((shelf) => shelf.plural === 'Battleline')?.entries.map((members) => members[0]!.name)).toEqual([
      'Cadian Shock Troops',
      'Arbites',
      'Tempestus Scions',
    ])
  })

  it('counts a role shelf by its datasheets', () => {
    expect(rosterShelves(roster, 'role').map((shelf) => shelf.count)).toEqual([3, 2, 1])
  })
})

describe('unitRoleRows', () => {
  const rows = [
    { label: 'Leading', name: 'Khorne Berzerkers', action: 'Remove' },
    { label: 'Leader', name: 'Kharn the Betrayer', action: 'Detach' },
    { label: 'Supporting', name: 'Khorne Berzerkers', action: 'Remove' },
  ]

  it('names only the role a datasheet plays, since the unit it joined is drawn beside it', () => {
    expect(unitRoleRows(rows)).toEqual([
      { label: 'Leader', name: '', action: 'Remove' },
      { label: 'Support', name: '', action: 'Remove' },
    ])
  })
})
