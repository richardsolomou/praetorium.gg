import { expect, it } from 'vitest'
import { calculateCombat, calculateCombatSequence, type CombatInput } from './combat'
import { resolveCombatRequest } from './combatMatchup'

const phase = (name: CombatInput['options']['phase'], attacks = 2): CombatInput => ({
  target: { groups: [{ models: 5, toughness: 4, save: 4, invulnerable: null, wounds: 2 }], feelNoPain: null },
  weapons: [
    {
      count: 5,
      attacks: { dice: 0, sides: 6, bonus: attacks },
      skill: 3,
      strength: 4,
      ap: -1,
      damage: { dice: 0, sides: 6, bonus: 1 },
      torrent: false,
      lethal: false,
      sustained: 0,
      devastating: false,
      criticalWound: 6,
      twinLinked: false,
      ignoresCover: false,
      psychic: false,
      blast: 0,
      rapidFire: 0,
      melta: 0,
      heavy: false,
      lance: false,
    },
  ],
  options: {
    phase: name,
    cover: false,
    halfRange: false,
    heavy: false,
    charged: false,
    hitModifier: 0,
    woundModifier: 0,
    hitReroll: 'none',
    woundReroll: 'none',
    lethal: false,
  },
})

it('carries shooting into melee when both phases resolve', () => {
  const ranged = phase('ranged')
  const melee = phase('melee', 1)
  expect(resolveCombatRequest({ ranged, melee }).combined).toEqual({ result: calculateCombatSequence([ranged, melee]) })
})

it('keeps each phase while refusing a combined estimate the sequence cannot represent', () => {
  const ranged = phase('ranged')
  expect(resolveCombatRequest({ ranged, melee: phase('melee'), sequenceError: 'Shared defence.' })).toEqual({
    ranged: { result: calculateCombat(ranged) },
    melee: { result: calculateCombat(phase('melee')) },
    combined: { error: 'Shared defence.' },
  })
})

it('refuses a phase whose work exceeds the given bound', () => {
  expect(resolveCombatRequest({ ranged: phase('ranged'), melee: null }, 1).ranged).toEqual({
    error: 'This attack is too large to simulate. Select fewer weapons or models.',
  })
})

it('does not combine a single phase', () => {
  expect(resolveCombatRequest({ ranged: phase('ranged'), melee: null })).not.toHaveProperty('combined')
})
