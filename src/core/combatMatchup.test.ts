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

function torrentPhase(name: CombatInput['options']['phase']): CombatInput {
  const input = phase(name, 1)
  input.target.groups = [{ models: 1, toughness: 4, save: 7, invulnerable: null, wounds: 2 }]
  input.weapons[0] = { ...input.weapons[0]!, count: 1, torrent: true, ap: 0 }
  return input
}

it('carries one unsaved wound into melee rather than adding phase destruction chances', () => {
  expect(resolveCombatRequest({ ranged: torrentPhase('ranged'), melee: torrentPhase('melee') }).combined?.result).toMatchObject({
    damage: [expect.closeTo(1 / 4, 12), expect.closeTo(1 / 2, 12), expect.closeTo(1 / 4, 12)],
    kills: [expect.closeTo(3 / 4, 12), expect.closeTo(1 / 4, 12)],
    wipe: expect.closeTo(1 / 4, 12),
    meanDamage: expect.closeTo(1, 12),
    meanKills: expect.closeTo(1 / 4, 12),
  })
})

it('cannot destroy a two-wound model with either one-wound phase alone', () => {
  const answer = resolveCombatRequest({ ranged: torrentPhase('ranged'), melee: torrentPhase('melee') })
  expect([answer.ranged?.result?.wipe, answer.melee?.result?.wipe]).toEqual([0, 0])
})

it('does not spill excess fixed damage from one model into the next', () => {
  const input = torrentPhase('ranged')
  input.target.groups[0]!.models = 2
  input.weapons[0]!.attacks.bonus = 2
  input.weapons[0]!.damage.bonus = 3
  expect(resolveCombatRequest({ ranged: input, melee: null }).ranged?.result).toMatchObject({
    damage: [expect.closeTo(1 / 4, 12), 0, expect.closeTo(1 / 2, 12), 0, expect.closeTo(1 / 4, 12)],
    kills: [expect.closeTo(1 / 4, 12), expect.closeTo(1 / 2, 12), expect.closeTo(1 / 4, 12)],
    wipe: expect.closeTo(1 / 4, 12),
  })
})

it('switches from bodyguard toughness to surviving leader toughness between phases', () => {
  const ranged = torrentPhase('ranged')
  ranged.target.groups = [
    { models: 1, toughness: 8, save: 7, invulnerable: null, wounds: 1, bodyguard: true },
    { models: 1, toughness: 4, save: 7, invulnerable: null, wounds: 1, character: true },
  ]
  const melee = { ...ranged, options: { ...ranged.options, phase: 'melee' as const } }
  expect(resolveCombatRequest({ ranged, melee }).combined?.result).toMatchObject({
    kills: [expect.closeTo(25 / 36, 12), expect.closeTo(2 / 9, 12), expect.closeTo(1 / 12, 12)],
    wipe: expect.closeTo(1 / 12, 12),
    meanKills: expect.closeTo(7 / 18, 12),
  })
})
