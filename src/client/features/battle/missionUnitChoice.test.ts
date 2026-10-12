import { expect, it } from 'vitest'
import { missionUnitChoice, missionUnitChoiceKey } from './missionUnitChoice'

const original = { playerId: 'alice', rosterSeq: 1, unitKey: 'u0' }

it('keeps a draft bound to its roster even when a replacement reuses the unit key', () => {
  expect(missionUnitChoice([{ ...original, rosterSeq: 5 }], missionUnitChoiceKey(original))).toBeNull()
})

it('does not move a draft to another allied army using the same unit key', () => {
  expect(missionUnitChoice([{ ...original, playerId: 'ally' }], missionUnitChoiceKey(original))).toBeNull()
})

it('finds the original draft after candidate order changes', () => {
  expect(missionUnitChoice([{ ...original, unitKey: 'u1' }, original], missionUnitChoiceKey(original))).toEqual(original)
})
