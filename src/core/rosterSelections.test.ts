import { expect, it } from 'vitest'
import { unavailableRosterSelections } from './rosterSelections'

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
