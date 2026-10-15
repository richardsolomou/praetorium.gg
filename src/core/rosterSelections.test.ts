import { describe, expect, it } from 'vitest'
import { builtPickSelections, unavailableRosterSelections, withoutUnavailableSelections } from './rosterSelections'

const units = [{ key: 0, choices: [{ key: 'weapons', options: [{ id: 'bolter' }] }], toggles: [{ key: 'warlord' }] }]

it('reports a removed datasheet at its saved position', () => {
  expect(unavailableRosterSelections([{ entryId: 'current' }, { entryId: 'removed' }], units)).toEqual([
    { pickIndex: 1, entryId: 'removed', kind: 'datasheet' },
  ])
})

it('reports each stale selection with the exact IDs needed for a migration', () => {
  expect(
    unavailableRosterSelections(
      [{ entryId: 'unit', choices: { weapons: 'old' }, spreads: { oldGroup: { bolter: 2 } }, toggles: { oldWarlord: 1 } }],
      units,
    ),
  ).toEqual([
    { pickIndex: 0, entryId: 'unit', kind: 'choice', key: 'weapons', optionId: 'old' },
    { pickIndex: 0, entryId: 'unit', kind: 'spread', key: 'oldGroup', optionId: 'bolter' },
    { pickIndex: 0, entryId: 'unit', kind: 'toggle', key: 'oldWarlord' },
  ])
})

it('accepts saved selections still offered by the unit', () => {
  expect(
    unavailableRosterSelections(
      [{ entryId: 'unit', choices: { weapons: 'bolter' }, spreads: { weapons: { bolter: 2 } }, toggles: { warlord: 1 } }],
      units,
    ),
  ).toEqual([])
})

it('treats a malformed choice without options as unavailable', () => {
  expect(
    unavailableRosterSelections([{ entryId: 'unit', choices: { weapons: 'bolter' } }], [{ ...units[0]!, choices: [{ key: 'weapons' }] }]),
  ).toEqual([{ pickIndex: 0, entryId: 'unit', kind: 'choice', key: 'weapons', optionId: 'bolter' }])
})

it('does not ask to restore removed options that the player saved as unselected', () => {
  expect(
    unavailableRosterSelections(
      [{ entryId: 'unit', spreads: { removedGroup: { removedOption: 0 } }, toggles: { removedWarlord: 0 } }],
      units,
    ),
  ).toEqual([])
})

it('reports a positive count independently of zero entries in the same spread', () => {
  expect(unavailableRosterSelections([{ entryId: 'unit', spreads: { removedGroup: { unselected: 0, selected: 1 } } }], units)).toEqual([
    { pickIndex: 0, entryId: 'unit', kind: 'spread', key: 'removedGroup', optionId: 'selected' },
  ])
})

describe('saved selections rewritten to the built unit', () => {
  const squad = {
    key: 'squad',
    chosen: 'boltgun',
    room: 4,
    options: [
      { id: 'boltgun', count: 3 },
      { id: 'knife', count: 1 },
    ],
  }
  const arms = {
    key: 'arms',
    chosen: 'devourers',
    room: 1,
    options: [
      { id: 'devourers', count: 1 },
      { id: 'claws', count: 0 },
    ],
  }
  const unit = { choices: [squad, arms] }

  it('returns a pick that already agrees unchanged', () => {
    const pick = { entryId: 'unit', choices: { arms: 'devourers' }, spreads: { squad: { boltgun: 3, knife: 1 } } }
    expect(builtPickSelections(pick, unit)).toBe(pick)
  })

  it('rewrites saved counts the build does not hold to the built counts', () => {
    expect(builtPickSelections({ entryId: 'unit', spreads: { squad: { boltgun: 4, knife: 1 } } }, unit).spreads).toEqual({
      squad: { boltgun: 3, knife: 1 },
    })
  })

  it('accepts saved counts that name only some of the group’s options', () => {
    const pick = { entryId: 'unit', spreads: { squad: { knife: 1 } } }
    expect(builtPickSelections(pick, unit)).toBe(pick)
  })

  it('keeps counts remembered under an option the build does not offer', () => {
    const remembered = { 'squad/heavy/weapon': { missile: 1 } }
    expect(builtPickSelections({ entryId: 'unit', spreads: { ...remembered, squad: { boltgun: 4 } } }, unit).spreads).toMatchObject(
      remembered,
    )
  })

  it('keeps a choice remembered under an option the build does not offer', () => {
    const pick = { entryId: 'unit', choices: { 'arms/claws/grip': 'left' } }
    expect(builtPickSelections(pick, unit)).toBe(pick)
  })

  it('drops a choice that is also saved as counts', () => {
    expect(
      builtPickSelections({ entryId: 'unit', choices: { arms: 'claws' }, spreads: { arms: { devourers: 1, claws: 0 } } }, unit).choices,
    ).toEqual({})
  })

  it('rewrites a single choice the build replaced to the option it holds', () => {
    expect(builtPickSelections({ entryId: 'unit', choices: { arms: 'claws' } }, unit).choices).toEqual({ arms: 'devourers' })
  })

  it('removes a single choice the build let go of', () => {
    expect(builtPickSelections({ entryId: 'unit', choices: { arms: 'claws' } }, { choices: [{ ...arms, chosen: '' }] }).choices).toEqual({})
  })

  it('leaves the counts alone when only a choice disagrees', () => {
    expect(builtPickSelections({ entryId: 'unit', choices: { arms: 'claws' } }, unit)).not.toHaveProperty('spreads')
  })
})

const wargear = {
  key: 0,
  choices: [
    { key: 'wargear', room: 1, chosen: 'bolter', options: [{ id: 'volkite' }, { id: 'bolter' }] },
    { key: 'wargear/bolter/melee', room: 1, chosen: 'sword', options: [{ id: 'sword' }] },
  ],
  toggles: [],
}

it('ignores a choice saved under an either-or option the player switched away from', () => {
  expect(
    unavailableRosterSelections(
      [{ entryId: 'lieutenant', choices: { wargear: 'bolter', 'wargear/bolter/melee': 'sword', 'wargear/volkite/fists': 'power-fist' } }],
      [wargear],
    ),
  ).toEqual([])
})

it('still reports a removed option under the option the player holds', () => {
  expect(unavailableRosterSelections([{ entryId: 'lieutenant', choices: { 'wargear/bolter/melee': 'removed' } }], [wargear])).toEqual([
    { pickIndex: 0, entryId: 'lieutenant', kind: 'choice', key: 'wargear/bolter/melee', optionId: 'removed' },
  ])
})

it('still reports a remembered selection under an option of a group a squad divides between', () => {
  const squad = { key: 0, choices: [{ key: 'weapons', room: 5, chosen: '', options: [{ id: 'plasma' }] }], toggles: [] }
  expect(unavailableRosterSelections([{ entryId: 'squad', spreads: { 'weapons/plasma/sight': { scope: 1 } } }], [squad])).toEqual([
    { pickIndex: 0, entryId: 'squad', kind: 'spread', key: 'weapons/plasma/sight', optionId: 'scope' },
  ])
})

describe('resetting selections reported unavailable', () => {
  const pick = {
    entryId: 'unit',
    choices: { weapons: 'old', relic: 'blade' },
    spreads: { oldGroup: { bolter: 2 }, squad: { gone: 1, rifle: 4 } },
    toggles: { oldWarlord: 1, warlord: 1 },
  }
  const unavailable = [
    { pickIndex: 0, entryId: 'unit', kind: 'choice' as const, key: 'weapons', optionId: 'old' },
    { pickIndex: 0, entryId: 'unit', kind: 'spread' as const, key: 'oldGroup', optionId: 'bolter' },
    { pickIndex: 0, entryId: 'unit', kind: 'spread' as const, key: 'squad', optionId: 'gone' },
    { pickIndex: 0, entryId: 'unit', kind: 'toggle' as const, key: 'oldWarlord' },
  ]

  it('drops exactly the reported selections and keeps every other remembered one', () => {
    expect(withoutUnavailableSelections(pick, 0, unavailable)).toEqual({
      entryId: 'unit',
      choices: { relic: 'blade' },
      spreads: { squad: { rifle: 4 } },
      toggles: { warlord: 1 },
    })
  })

  it('leaves a pick at another position unchanged', () => {
    expect(withoutUnavailableSelections(pick, 1, unavailable)).toBe(pick)
  })

  it('leaves a different datasheet at the reported position unchanged', () => {
    const other = { ...pick, entryId: 'other' }
    expect(withoutUnavailableSelections(other, 0, unavailable)).toBe(other)
  })
})
