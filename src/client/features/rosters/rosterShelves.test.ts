import { expect, it } from 'vitest'
import type { UnitGroup } from '../../../core/unitGroups'
import { rosterShelves } from './rosterShelves'

const card = (key: number, name: string, group: UnitGroup, points: number, attachedTo?: number) => ({
  key,
  group,
  unit: { name, points },
  ...(attachedTo === undefined ? {} : { attachedTo }),
})

const roster = [
  card(0, 'Lord Solar Leontus', 'epic-hero', 130, 2),
  card(1, 'Ogryn Bodyguard', 'character', 35, 2),
  card(2, 'Cadian Command Squad', 'infantry', 65),
  card(3, 'Cadian Castellan', 'character', 45),
  card(4, 'Cadian Shock Troops', 'battleline', 60),
]

const shape = (shelves: ReturnType<typeof rosterShelves<(typeof roster)[number]>>) =>
  shelves.map(({ id, entries }) => [
    id,
    entries.map(({ host, joined, points }) => [host.unit.name, joined.map((member) => member.unit.name), points]),
  ])

it('keeps a card per datasheet on its own shelf', () => {
  expect(shape(rosterShelves(roster, 'datasheets'))).toEqual([
    ['epic-hero', [['Lord Solar Leontus', [], 130]]],
    [
      'character',
      [
        ['Cadian Castellan', [], 45],
        ['Ogryn Bodyguard', [], 35],
      ],
    ],
    ['battleline', [['Cadian Shock Troops', [], 60]]],
    ['infantry', [['Cadian Command Squad', [], 65]]],
  ])
})

it('folds an attached unit onto its bodyguard shelf with its summed points', () => {
  expect(shape(rosterShelves(roster, 'units'))).toEqual([
    ['character', [['Cadian Castellan', [], 45]]],
    ['battleline', [['Cadian Shock Troops', [], 60]]],
    ['infantry', [['Cadian Command Squad', ['Lord Solar Leontus', 'Ogryn Bodyguard'], 230]]],
  ])
})

it('keeps a character whose bodyguard is missing on its own shelf', () => {
  expect(shape(rosterShelves([card(0, 'Cadian Castellan', 'character', 45, 7)], 'units'))).toEqual([
    ['character', [['Cadian Castellan', [], 45]]],
  ])
})
