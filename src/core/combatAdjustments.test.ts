import { describe, expect, it } from 'vitest'
import {
  criticalThresholdMatters,
  DEFAULT_COMBAT_OPTIONS,
  halfRangeMatters,
  rerollAdjustmentMatters,
  rollAdjustmentMatters,
  saveAdjustmentMatters,
  type CombatInput,
  type CombatWeapon,
} from './combat'
import { adjustCombatTarget, adjustCombatWeapon, combineAttackAdjustments, combineWeaponAdjustments } from './combatAdjustments'

const weapon = (overrides: Partial<CombatWeapon> = {}): CombatWeapon => ({
  count: 1,
  attacks: { dice: 0, sides: 6, bonus: 2 },
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
  ...overrides,
})

const target = (overrides: Partial<CombatInput['target']['groups'][number]> = {}): CombatInput['target'] => ({
  groups: [{ models: 5, toughness: 4, save: 3, invulnerable: null, wounds: 2, ...overrides }],
  feelNoPain: null,
})

describe('shared and phase adjustments', () => {
  it('cancels opposing hit modifiers across scopes', () => {
    expect(combineAttackAdjustments({ hitModifier: 1 }, { hitModifier: -1 }).hitModifier).toBe(0)
  })
  it('lets the phase replace a shared weapon ability', () => {
    expect(combineWeaponAdjustments({ sustained: 1 }, { sustained: 2 }).sustained).toBe(2)
  })
  it('restores a shared ability when a phase choice is cleared', () => {
    expect(combineWeaponAdjustments({ sustained: 1 }, { sustained: undefined }).sustained).toBe(1)
  })
  it('restores a shared re-roll when a phase choice is cleared', () => {
    expect(combineAttackAdjustments({ woundReroll: 'failed' }, { woundReroll: undefined }).woundReroll).toBe('failed')
  })
  it('cancels opposing skill modifiers before applying characteristic limits', () => {
    expect(adjustCombatWeapon(weapon(), combineWeaponAdjustments({ skill: 1 }, { skill: -1 })).skill).toBe(3)
  })
  it('lets a phase decline a shared ability without removing the printed one', () => {
    expect(adjustCombatWeapon(weapon({ lethal: true }), combineWeaponAdjustments({ lethal: true }, { lethal: false })).lethal).toBe(true)
  })
})

describe('critical threshold effect', () => {
  const matchup = (changed: Partial<CombatWeapon>, options: Partial<CombatInput['options']> = {}): CombatInput => ({
    target: target({ toughness: 5 }),
    weapons: [weapon(changed)],
    options: { ...DEFAULT_COMBAT_OPTIONS, ...options },
  })

  it('marks a 5+ critical wound ineffective when it only duplicates a 5+ wound', () => {
    expect(criticalThresholdMatters(matchup({ criticalWound: 5 }), matchup({}), 'wound')).toBe(false)
  })
  it('updates the cue when a wound bonus makes a 4+ critical wound redundant', () => {
    expect(criticalThresholdMatters(matchup({ criticalWound: 4 }, { woundModifier: 1 }), matchup({}, { woundModifier: 1 }), 'wound')).toBe(
      false,
    )
  })
  it('recognizes Devastating Wounds on otherwise redundant critical wounds', () => {
    expect(criticalThresholdMatters(matchup({ criticalWound: 5, devastating: true }), matchup({ devastating: true }), 'wound')).toBe(true)
  })
  it('recognizes a lower critical wound that enables an otherwise failed wound', () => {
    expect(criticalThresholdMatters(matchup({ criticalWound: 4 }), matchup({}), 'wound')).toBe(true)
  })
  it('marks an untriggered critical hit ineffective', () => {
    expect(criticalThresholdMatters(matchup({ criticalHit: 5 }), matchup({}), 'hit')).toBe(false)
  })
  it('recognizes Sustained Hits on a critical hit', () => {
    expect(criticalThresholdMatters(matchup({ criticalHit: 5, sustained: 1 }), matchup({ sustained: 1 }), 'hit')).toBe(true)
  })
  it('marks a wound re-roll of ones redundant when the weapon already re-rolls all wounds', () => {
    expect(
      rerollAdjustmentMatters(matchup({ woundReroll: 'failed' }, { woundReroll: 'ones' }), matchup({ woundReroll: 'failed' }), 'wound'),
    ).toBe(false)
  })
  it('recognizes when a wound re-roll improves the printed one', () => {
    expect(
      rerollAdjustmentMatters(matchup({ woundReroll: 'ones' }, { woundReroll: 'failed' }), matchup({ woundReroll: 'ones' }), 'wound'),
    ).toBe(true)
  })
  it('marks a hit bonus redundant after the modifier cap', () => {
    expect(rollAdjustmentMatters(matchup({ hitModifier: 1 }, { hitModifier: 1 }), matchup({ hitModifier: 1 }), 'hit')).toBe(false)
  })
  it('marks a Toughness change redundant when it leaves the wound roll unchanged', () => {
    expect(
      rollAdjustmentMatters(
        { ...matchup({}), target: target({ toughness: 6 }) },
        { ...matchup({}), target: target({ toughness: 5 }) },
        'wound',
      ),
    ).toBe(false)
  })
  it('marks an invulnerable save redundant when the armour save is better', () => {
    expect(saveAdjustmentMatters({ ...matchup({}), target: target({ invulnerable: 4 }) }, { ...matchup({}), target: target() })).toBe(false)
  })
  it('marks half range redundant without a matching weapon ability', () => {
    expect(halfRangeMatters(matchup({}))).toBe(false)
  })
})

describe('weapon adjustments', () => {
  it('improves skill without passing 2+', () => expect(adjustCombatWeapon(weapon({ skill: 2 }), { skill: 1 }).skill).toBe(2))
  it('worsens skill without passing 6+', () => expect(adjustCombatWeapon(weapon({ skill: 6 }), { skill: -1 }).skill).toBe(6))
  it('keeps strength at least 1', () => expect(adjustCombatWeapon(weapon({ strength: 1 }), { strength: -1 }).strength).toBe(1))
  it('adds attacks to the flat part of a dice value', () =>
    expect(adjustCombatWeapon(weapon({ attacks: { dice: 1, sides: 6, bonus: 0 } }), { attacks: 1 }).attacks).toEqual({
      dice: 1,
      sides: 6,
      bonus: 1,
    }))
  it('keeps a flat damage value at least 1', () => expect(adjustCombatWeapon(weapon(), { damage: -1 }).damage.bonus).toBe(1))
  it('leaves a zero value alone when nothing changes it', () =>
    expect(adjustCombatWeapon(weapon({ damage: { dice: 0, sides: 6, bonus: 0 } }), {}).damage.bonus).toBe(0))
  it('improves armour penetration', () => expect(adjustCombatWeapon(weapon(), { ap: 1 }).ap).toBe(-2))
  it('never makes armour penetration positive', () => expect(adjustCombatWeapon(weapon({ ap: 0 }), { ap: -1 }).ap).toBe(0))
  it('keeps a better printed critical wound threshold', () =>
    expect(adjustCombatWeapon(weapon({ criticalWound: 4 }), { criticalWound: 5 }).criticalWound).toBe(4))
  it('lowers the critical hit threshold', () => expect(adjustCombatWeapon(weapon(), { criticalHit: 5 }).criticalHit).toBe(5))
  it('leaves the critical hit threshold alone without an adjustment', () =>
    expect(adjustCombatWeapon(weapon(), {}).criticalHit).toBeUndefined())
  it('keeps the better of printed and granted Sustained Hits', () =>
    expect(adjustCombatWeapon(weapon({ sustained: 2 }), { sustained: { dice: 1, sides: 3, bonus: 0 } }).sustained).toBe(2))
  it('grants Sustained Hits a weapon lacks', () => expect(adjustCombatWeapon(weapon(), { sustained: 1 }).sustained).toBe(1))
  it('grants Lethal Hits', () => expect(adjustCombatWeapon(weapon(), { lethal: true }).lethal).toBe(true))
  it('keeps printed Devastating Wounds when not granted', () =>
    expect(adjustCombatWeapon(weapon({ devastating: true }), {}).devastating).toBe(true))
  it('grants damage re-rolls of 1', () => expect(adjustCombatWeapon(weapon(), { damageReroll: true }).damageReroll).toBe('ones'))
})

describe('target adjustments', () => {
  it('changes Toughness on every group', () =>
    expect(
      adjustCombatTarget(
        { ...target(), groups: [...target().groups, { ...target().groups[0]!, toughness: 6 }] },
        { toughness: 1 },
      ).groups.map((group) => group.toughness),
    ).toEqual([5, 7]))
  it('improves the armour save without passing 2+', () =>
    expect(adjustCombatTarget(target({ save: 2 }), { save: 1 }).groups[0]!.save).toBe(2))
  it('worsens the armour save up to no save', () => expect(adjustCombatTarget(target({ save: 7 }), { save: -1 }).groups[0]!.save).toBe(7))
  it('keeps a better printed invulnerable save', () =>
    expect(adjustCombatTarget(target({ invulnerable: 4 }), { invulnerable: 5 }).groups[0]!.invulnerable).toBe(4))
  it('grants an invulnerable save', () => expect(adjustCombatTarget(target(), { invulnerable: 5 }).groups[0]!.invulnerable).toBe(5))
  it('adds one damage reduction to what rules already give', () =>
    expect(adjustCombatTarget({ ...target(), damageReduction: 1 }, { damageReduction: true }).damageReduction).toBe(2))
  it('halves damage', () => expect(adjustCombatTarget(target(), { halveDamage: true }).damageDivisor).toBe(2))
  it('passes save re-rolls to the calculation', () => expect(adjustCombatTarget(target(), { saveReroll: 'ones' }).saveReroll).toBe('ones'))
  it('keeps a better printed save re-roll', () =>
    expect(adjustCombatTarget({ ...target(), saveReroll: 'failed' }, { saveReroll: 'ones' }).saveReroll).toBe('failed'))
})
