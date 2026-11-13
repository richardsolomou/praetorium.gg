import { expect, it } from 'vitest'
import type { UnitState } from '../../../core/battle'
import { datasheetFixture } from '../../../core/datasheet.fixtures'
import { armyThreats, survivingUnits } from './armyThreats'

const unit = (index: number, entryId: string, extra: Partial<UnitState> = {}): UnitState => ({
  key: `${index}-${entryId}`,
  name: entryId,
  entryId,
  points: 100,
  models: 5,
  alive: 5,
  damage: 0,
  destroyed: false,
  deployed: true,
  formation: 'battlefield',
  ...extra,
})

const projection = (move: string, range?: string) => ({
  selected: datasheetFixture({
    profiles: [
      { id: 'model', name: 'Model', type: 'Unit', values: [{ name: 'M', value: move }] },
      ...(range ? [{ id: 'gun', name: 'Gun', type: 'Ranged Weapons', values: [{ name: 'Range', value: range }] }] : []),
    ],
  }),
  companions: [],
})

it('asks for each surviving unit once, with a leader whose bodyguard is gone standing alone', () => {
  const units = [unit(0, 'squad'), unit(1, 'captain', { attachedTo: '0-squad' }), unit(2, 'tank', { destroyed: true }), unit(3, 'bikes')]
  const picks = [{ entryId: 'squad' }, { entryId: 'captain', attachedTo: 0 }, { entryId: 'tank' }, { entryId: 'bikes' }]
  const { rows, request } = survivingUnits(units, picks)
  expect(rows.map((row) => row.name)).toEqual(['squad + captain', 'bikes'])
  expect(request).toMatchObject({ pickIndices: [0, 3], inactivePicks: [2] })

  const alone = survivingUnits([{ ...units[0]!, destroyed: true }, units[1]!], picks)
  expect(alone.rows.map((row) => row.name)).toEqual(['captain'])
  expect(alone.request.picks[1]!.attachedTo).toBeUndefined()
})

it('puts the furthest-reaching unit first and a unit without a datasheet last', () => {
  const units = [unit(0, 'squad'), unit(1, 'bikes'), { ...unit(2, 'old'), entryId: undefined }]
  const { rows } = survivingUnits(units, [{ entryId: 'squad' }, { entryId: 'bikes' }, { entryId: 'old' }])
  const threats = armyThreats(rows, [projection('6"', '24"'), projection('12"', '24"')])
  expect(threats.map(({ name, move, range }) => [name, move, range])).toEqual([
    ['bikes', 12, 24],
    ['squad', 6, 24],
    ['old', null, null],
  ])
})
