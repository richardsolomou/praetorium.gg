import { expect, it } from 'vitest'
import { DEFAULT_COMBAT_OPTIONS, calculateCombat, calculateCombatSequence, type CombatInput } from './combat'
import { attackSequence, sampleCombat } from './combatReference'
import { combatUnitTarget, combatUnitSequenceError, type CombatMember } from './combatUnit'
import { combatAttacks } from './combatScenario'
import { combatRuleChoices, combatRuleHasSharedDefence, type CombatRule } from './combatRules'
import type { Datasheet } from './datasheet'

function member(name: string, models = 1): CombatMember {
  const sheet: Datasheet = {
    id: name,
    name,
    slug: name,
    referenceRoute: null,
    points: null,
    keywords: ['Infantry'],
    profiles: [
      {
        id: `${name}:model`,
        name,
        type: 'Unit',
        values: Object.entries({ T: '4', Sv: '7+', W: '2' }).map(([characteristic, value]) => ({ name: characteristic, value })),
      },
      {
        id: `${name}:weapon`,
        name: 'Rifle',
        type: 'Ranged Weapons',
        count: models,
        values: Object.entries({ A: '1', BS: '3+', S: '4', AP: '0', D: '1' }).map(([characteristic, value]) => ({
          name: characteristic,
          value,
        })),
      },
    ],
    abilities: [],
    composition: [],
    loadout: null,
    wargearOptions: [],
    baseSize: null,
    transport: null,
    costs: [],
    attachments: [],
    leaders: [],
    supporters: [],
    keywordRules: [],
  }
  return { sheet, models, carriers: [{ name, models, weapons: [{ name: 'Rifle', count: models, profileIds: [`${name}:weapon`] }] }] }
}

it('includes squad, leader and support attacks without sharing personal buffs', () => {
  const squad = member('Squad', 5)
  const leader = member('Leader')
  leader.rules = [{ name: 'Personal accuracy', effects: [{ role: 'attacker', phases: ['ranged'], options: { hitModifier: 1 } }] }]
  squad.companions = [leader, member('Support')]
  const attacks = combatAttacks(squad, { keywords: [], rules: [] }, {}, { ranged: [], melee: [] })
  expect(attacks.ranged.base?.weapons.map((weapon) => [weapon.count, weapon.hitModifier ?? 0])).toEqual([
    [5, 0],
    [1, 1],
    [1, 0],
  ])
})

it('preserves separate weapon mode choices for each attached model', () => {
  const squad = member('Squad')
  const leader = member('Leader')
  for (const unit of [squad, leader]) {
    unit.sheet.profiles.push({ ...unit.sheet.profiles[1]!, id: `${unit.sheet.id}:alternate`, name: 'Rifle – alternate' })
    unit.carriers[0]!.weapons[0]!.profileIds!.push(`${unit.sheet.id}:alternate`)
  }
  squad.companions = [leader]
  const attacks = combatAttacks(
    squad,
    { keywords: [], rules: [] },
    { 'attached:1:ranged:0:rifle': 'Leader:alternate' },
    { ranged: [], melee: [] },
  )
  expect(attacks.ranged.plan.active.map((entry) => entry.profile.id)).toEqual(['Squad:weapon', 'Leader:alternate'])
})

it('keeps a leader’s damage reduction on its defence group', () => {
  const squad = member('Squad', 5)
  const leader = member('Leader')
  leader.sheet.keywords.push('Character')
  leader.rules = [
    {
      name: 'Resilience',
      effects: combatRuleChoices({
        id: 'resilience',
        name: 'Resilience',
        source: 'Leader',
        scope: 'unit',
        models: 1,
        description: 'Each time an attack is allocated to this model, subtract 1 from the Damage characteristic of that attack.',
      })[0]!.effects,
    },
  ]
  squad.companions = [leader]
  expect(combatUnitTarget(squad, 'ranged').target?.groups.map((group) => [group.models, group.damageReduction])).toEqual([
    [5, 0],
    [1, 1],
  ])
})

it('refuses an attached member whose surviving weapons need allocation', () => {
  const squad = member('Squad')
  squad.companions = [{ ...member('Leader'), allocationRequired: true }]
  expect(combatUnitTarget(squad).target).toBeNull()
})

it('bounds the total models across all attached members', () => {
  const squad = member('Squad', 100)
  squad.companions = [member('Leader')]
  expect(combatUnitTarget(squad).target).toBeNull()
})

const sharedProtection: CombatRule = {
  id: 'shared-protection',
  name: 'Protection',
  source: 'Leader',
  scope: 'attached',
  description: 'While this model is leading a unit, models in that unit have the Feel No Pain 5+ ability.',
}

it('identifies active defensive abilities that depend on an attached source', () => {
  expect(combatRuleHasSharedDefence(sharedProtection, 1)).toBe(true)
})

it('does not block sequences for an unselected defensive ability', () => {
  expect(combatRuleHasSharedDefence(sharedProtection, 0)).toBe(false)
})

it('does not classify a personal defensive ability as shared', () => {
  expect(combatRuleHasSharedDefence({ ...sharedProtection, scope: 'unit' }, 1)).toBe(false)
})

it('tracks shared defensive profile changes already applied by projection', () => {
  expect(combatRuleHasSharedDefence({ ...sharedProtection, appliedDefences: ['toughness'] }, 0)).toBe(true)
})

it('refuses combined estimates when a shared defensive source can be destroyed', () => {
  const squad = member('Squad')
  squad.companions = [{ ...member('Leader'), sharedDefenceSources: ['Squad'] }]
  expect(combatUnitSequenceError(squad)).toMatch(/shared defensive ability/)
})

it('permits a shared defensive source allocated after every other member', () => {
  const squad = member('Squad')
  squad.sharedDefenceSources = ['Leader']
  squad.companions = [member('Leader')]
  expect(combatUnitSequenceError(squad)).toBeUndefined()
})

function bodyguardProtection(): CombatInput {
  const squad = member('Bodyguard')
  squad.sheet.profiles[0]!.values.find((value) => value.name === 'W')!.value = '1'
  squad.sheet.abilities.push({ id: 'protection', name: 'Protection', kind: 'datasheet', description: 'Protects the leader.' })
  const leader = member('Leader')
  leader.sheet.abilities.push({ id: 'granted:protection', name: 'Feel No Pain 4+', source: 'Protection', kind: 'core', description: null })
  squad.companions = [leader]
  const weapon = structuredClone(scenario().weapons[0]!)
  weapon.torrent = true
  weapon.strength = 100
  return {
    target: combatUnitTarget(squad).target!,
    weapons: [weapon],
    options: DEFAULT_COMBAT_OPTIONS,
  }
}

it('retains the bodyguard’s protection until the attacking unit finishes its attacks', () => {
  const input = bodyguardProtection()
  input.weapons[0]!.attacks.bonus = 2
  expect(calculateCombat(input).meanDamage).toBeCloseTo(95 / 72, 12)
})

it('removes bodyguard-granted Feel No Pain before the next phase', () => {
  const input = bodyguardProtection()
  expect(calculateCombatSequence([input, input]).meanDamage).toBeCloseTo(5 / 3, 12)
})

it('retains a better personal Feel No Pain after the bodyguard is destroyed', () => {
  const input = bodyguardProtection()
  input.target.groups[1]!.feelNoPain = 2
  expect(calculateCombatSequence([input, input]).meanDamage).toBeCloseTo(235 / 216, 12)
})

it('matches the independent roller with bodyguard-granted Feel No Pain', () => {
  const input = bodyguardProtection()
  input.weapons[0]!.attacks.bonus = 2
  const sampled = sampleCombat(input, 40_000)
  expect(sampled.damage.reduce((total, chance, wounds) => total + chance * wounds, 0)).toBeCloseTo(95 / 72, 1)
})

it('keeps a surviving source’s Feel No Pain when another source is destroyed', () => {
  const input = bodyguardProtection()
  input.target.groups[1]!.feelNoPainSources!.push({ unit: 'Leader', value: 5 })
  expect(calculateCombatSequence([input, input]).meanDamage).toBeCloseTo(10 / 36 + (25 / 36) * (1 + 2 / 3), 12)
})

it('refuses a shared Feel No Pain grant without its source', () => {
  const input = bodyguardProtection()
  input.target.groups[1]!.feelNoPainSources![0]!.unit = 'Missing'
  expect(() => calculateCombat(input)).toThrow('missing from the target')
})

for (const timing of ['before', 'after'] as const) {
  it(`refuses unresolved shared defence timing around separate ${timing}-attack mortal wounds`, () => {
    const input = bodyguardProtection()
    input.mortalWounds = [{ timing, rolls: 1, outcomes: [{ min: 1, max: 6, damage: { dice: 0, sides: 6, bonus: 1 } }] }]
    expect(() => calculateCombat(input)).toThrow('during separate mortal-wound abilities')
  })
}

it('permits combined estimates with personal defensive protections', () => {
  const squad = member('Squad')
  squad.companions = [member('Leader')]
  expect(combatUnitSequenceError(squad)).toBeUndefined()
})

function scenario(): CombatInput {
  const squad = member('Squad')
  return {
    target: {
      groups: [
        { models: 1, toughness: 4, save: 7, invulnerable: null, wounds: 1, bodyguard: true },
        { models: 1, toughness: 8, save: 7, invulnerable: null, wounds: 3, character: true, damageReduction: 1, feelNoPain: 5 },
      ],
      feelNoPain: null,
    },
    weapons: combatAttacks(squad, { keywords: [], rules: [] }, {}, { ranged: [], melee: [] }).ranged.base!.weapons,
    options: DEFAULT_COMBAT_OPTIONS,
  }
}

it('uses bodyguard Toughness until only attached characters remain', () => {
  const input = scenario()
  input.weapons[0]!.torrent = true
  input.weapons[0]!.damage.bonus = 1
  input.target.groups[1]!.damageReduction = 0
  input.target.groups[1]!.feelNoPain = null
  expect(calculateCombatSequence([input, input]).meanDamage).toBeCloseTo(0.5 + 0.5 * 0.5 + 0.5 / 6, 12)
})

it('matches independent dice rolling across personal protections and wounded characters', () => {
  const input = scenario()
  input.target.groups[1]!.damage = 1
  input.weapons[0]!.attacks.bonus = 4
  input.weapons[0]!.damage.bonus = 3
  const exact = calculateCombat(input)
  const sampled = sampleCombat(input, 40_000)
  expect(sampled.damage.reduce((total, chance, wounds) => total + chance * wounds, 0)).toBeCloseTo(exact.meanDamage, 1)
})

it('applies mortal wound prevention to the current recipient after spilling through the squad', () => {
  const input = scenario()
  input.weapons = []
  input.mortalWounds = [{ timing: 'before', rolls: 1, outcomes: [{ min: 1, max: 6, damage: { dice: 0, sides: 6, bonus: 2 } }] }]
  expect(calculateCombat(input).meanDamage).toBeCloseTo(1 + 4 / 6, 12)
})

it('starts only the first model in a wounded defence group with lost wounds', () => {
  const input = scenario()
  input.target.groups = [{ models: 2, toughness: 4, save: 7, invulnerable: null, wounds: 2, damage: 1 }]
  input.weapons = []
  input.mortalWounds = [{ timing: 'before', rolls: 1, outcomes: [{ min: 1, max: 6, damage: { dice: 0, sides: 6, bonus: 3 } }] }]
  expect(attackSequence(input, () => 0)).toEqual({ damage: 3, killed: 2 })
})

it('refuses phases that start with different wounds on an attached character', () => {
  const shooting = scenario()
  const melee = scenario()
  melee.target.groups[1]!.damage = 1
  expect(() => calculateCombatSequence([shooting, melee])).toThrow('same starting wounds')
})

it('keeps devastating damage reduction on the model receiving the packet', () => {
  const input = scenario()
  input.weapons[0]!.attacks.bonus = 4
  input.weapons[0]!.damage.bonus = 3
  input.weapons[0]!.devastating = true
  input.weapons[0]!.criticalWound = 2
  const exact = calculateCombat(input)
  const sampled = sampleCombat(input, 40_000)
  expect(sampled.damage.reduce((total, chance, wounds) => total + chance * wounds, 0)).toBeCloseTo(exact.meanDamage, 1)
})

it('applies a leader’s reduction only after the bodyguard takes damage', () => {
  const input = scenario()
  input.weapons[0]!.torrent = true
  input.weapons[0]!.strength = 100
  input.weapons[0]!.attacks.bonus = 2
  input.weapons[0]!.damage.bonus = 3
  input.target.groups[1]!.feelNoPain = null
  expect(calculateCombat(input).meanDamage).toBeCloseTo(10 / 36 + (25 / 36) * 3, 12)
})
