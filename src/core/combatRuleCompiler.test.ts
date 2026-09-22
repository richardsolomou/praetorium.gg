import { describe, expect, it } from 'vitest'
import { compileCombatRule } from './combatRuleCompiler'
import { combatRuleAppliesTo, combatRuleChoices, combatRuleDefault, type CombatRule } from './combatRules'

const rule = (description: string, extra: Partial<CombatRule> = {}): CombatRule => ({
  id: 'buff',
  name: 'Buff',
  source: 'Source',
  scope: 'unit',
  models: 1,
  description,
  ...extra,
})
const effects = (description: string, extra: Partial<CombatRule> = {}) =>
  combatRuleChoices(rule(description, extra)).map((choice) => choice.effects)

describe('composed combat rules', () => {
  it('gives cover to the source unit and requires obscuration for other recipients', () => {
    const description =
      'Until the end of the phase, each time an attack targets either your SMOKE unit, or a unit that is not fully visible to the attacking model because of one or more models in your SMOKE unit, the target has the benefit of cover against that attack (13.08).'
    expect([
      combatRuleChoices(rule(description, { keywords: ['Smoke'], scope: 'stratagem' })),
      combatRuleChoices(rule(description, { keywords: ['Infantry'], scope: 'stratagem' })),
    ]).toEqual([
      [{ label: 'Active', effects: [{ role: 'defender', phases: ['ranged'], options: { cover: true } }] }],
      [{ label: 'Obscured by the source unit', effects: [{ role: 'defender', phases: ['ranged'], options: { cover: true } }] }],
    ])
  })
  it('keeps an opponent decision on its named weapon and respective combat roles', () => {
    expect(
      effects(
        'Each time this model targets an enemy unit with its ray, your opponent must declare if that unit will stand firm or duck for cover:\n■ If it stands firm, when resolving attacks against that unit this phase, a successful unmodified Hit roll of 5+ scores a Critical Hit.\n■ If it ducks for cover, until the start of your next Shooting phase, each time a model in that unit makes an attack, subtract 1 from the Hit roll.',
      ),
    ).toEqual([
      [{ role: 'attacker', phases: ['ranged', 'melee'], weapon: 'ray', criticalHit: 5, criticalHitRequiresSuccess: true }],
      [{ role: 'defender', phases: ['ranged', 'melee'], options: { hitModifier: -1 } }],
    ])
  })
  it('treats an enemy status aura that improves AP as an attacking effect', () => {
    const buff = rule(
      'While an enemy unit is within 6" of this unit, it is weakened. While an enemy unit is weakened, each time an attack targets that unit, improve the Armour Penetration characteristic of that attack by 1. At the start of each phase, for each ARMY MONSTER unit from your army, that unit can suffer 3 mortal wounds. If it does, until the end of the phase, the range of that unit\'s Weakening Aura ability is increased to 9".',
    )
    expect([combatRuleDefault(buff), combatRuleChoices(buff)]).toEqual([
      0,
      [
        {
          label: 'Target within 6" (9" with the extended aura active)',
          effects: [{ role: 'attacker', phases: ['ranged', 'melee'], characteristic: { kind: 'armour-penetration', add: -1 } }],
        },
      ],
    ])
  })
  it('keeps objective-marker support conditional and recipient-specific', () => {
    const description =
      'Select one objective marker within 18" of your SUPPORT model. Until the end of the phase, weapons equipped by friendly ARMY models have the [IGNORES COVER] ability while targeting units within range of that objective marker.'
    expect([
      effects(description, { keywords: ['Army'], phases: ['ranged'] }),
      effects(description, { keywords: ['Other'], phases: ['ranged'] }),
    ]).toEqual([[[{ role: 'attacker', phases: ['ranged'], keyword: 'IGNORES COVER' }]], []])
  })
  it('retains a selected-target effect after its phase prefix', () => {
    expect(
      effects(
        'In your Shooting phase, after this model has shot, select one enemy unit hit by one or more of those attacks. Until the end of the phase, that unit cannot have the Benefit of Cover.',
      ),
    ).toEqual([[{ role: 'attacker', phases: ['ranged'], keyword: 'Ignores Cover' }]])
  })
  it('retains the target keyword and test condition on a selected enemy debuff', () => {
    expect(
      effects(
        "Once per turn, at the start of your opponent's Shooting phase, select one enemy VEHICLE unit visible to the bearer. That unit must take a Leadership test. Until the end of the phase, each time a model in that unit makes an attack, subtract 1 from the Hit roll and, if that Leadership test was failed, subtract 1 from the Wound roll as well.",
      ),
    ).toEqual([
      [{ role: 'defender', phases: ['ranged'], targetKeywords: ['VEHICLE'], options: { hitModifier: -1 } }],
      [
        { role: 'defender', phases: ['ranged'], targetKeywords: ['VEHICLE'], options: { hitModifier: -1 } },
        { role: 'defender', phases: ['ranged'], targetKeywords: ['VEHICLE'], options: { woundModifier: -1 } },
      ],
    ])
  })
  it('limits a once-per-battle weapon grant to the activated shooting phase', () => {
    const buff = rule(
      'Once per battle, when this unit is selected to shoot, until the end of the phase, ranged weapons equipped by this unit gain the [Ignores Cover] ability.',
    )
    expect([combatRuleDefault(buff), combatRuleChoices(buff).map((choice) => choice.effects)]).toEqual([
      0,
      [[{ role: 'attacker', phases: ['ranged'], keyword: 'Ignores Cover' }]],
    ])
  })
  it('keeps an explicit phase on an otherwise unrestricted attack bonus', () => {
    expect(effects('In your Shooting phase, each time a model in this unit makes an attack, add 1 to the Hit roll.')).toEqual([
      [{ role: 'attacker', phases: ['ranged'], options: { hitModifier: 1 } }],
    ])
  })
  it('keeps damage rerolls limited to the named target kind', () => {
    expect(
      effects('Each time this model makes a ranged attack that targets a MONSTER or VEHICLE unit, re-roll a Damage roll of 1.'),
    ).toEqual([[{ role: 'attacker', phases: ['ranged'], targetKeywords: ['MONSTER', 'VEHICLE'], damageReroll: 'ones' }]])
  })
  it('preserves the enclosing condition across all bullets', () => {
    const buff = rule(
      "While a PILOT model is embarked within this unit:\n- This unit's ranged attacks have [Ignores Cover].\n- If this unit is empowered, this unit's ranged attacks have [Sustained Hits 1].",
    )
    expect([combatRuleDefault(buff), combatRuleChoices(buff)]).toEqual([
      0,
      [
        {
          label: 'A PILOT model is embarked within this unit',
          effects: [{ role: 'attacker', phases: ['ranged'], keyword: 'Ignores Cover' }],
        },
        {
          label: 'A PILOT model is embarked within this unit · This unit is empowered',
          effects: [
            { role: 'attacker', phases: ['ranged'], keyword: 'Ignores Cover' },
            { role: 'attacker', phases: ['ranged'], keyword: 'Sustained Hits 1' },
          ],
        },
      ],
    ])
  })
  it('retains an upgraded reroll after a semicolon', () => {
    expect(
      effects(
        'Each time this unit makes a melee attack, re-roll a Wound roll of 1 if this unit is below its Starting Strength; if this unit is Below Half-strength, you can re-roll the Wound roll instead.',
      ),
    ).toEqual([
      [{ role: 'attacker', phases: ['melee'], options: { woundReroll: 'ones' } }],
      [{ role: 'attacker', phases: ['melee'], options: { woundReroll: 'failed' } }],
    ])
  })
  it('keeps two trailing conditions on their respective bonuses', () => {
    expect(
      effects(
        'Each time a model in this unit makes an attack, add 1 to the Hit roll if this unit is below its Starting Strength, and add 1 to the Wound roll as well if this unit is Below Half-strength.',
      ),
    ).toEqual([
      [{ role: 'attacker', phases: ['ranged', 'melee'], options: { hitModifier: 1 } }],
      [{ role: 'attacker', phases: ['ranged', 'melee'], options: { woundModifier: 1 } }],
      [
        { role: 'attacker', phases: ['ranged', 'melee'], options: { hitModifier: 1 } },
        { role: 'attacker', phases: ['ranged', 'melee'], options: { woundModifier: 1 } },
      ],
    ])
  })
  it('recognizes an activated phase ability without making it passive', () => {
    const buff = rule(
      'Once per battle, in the Fight phase, this model can use this ability. If it does, until the end of the phase, improve the Strength and Attacks characteristics of melee weapons equipped by this model by 3.',
    )
    expect([combatRuleDefault(buff), combatRuleChoices(buff).map((choice) => choice.effects)]).toEqual([
      0,
      [
        [
          { role: 'attacker', phases: ['melee'], characteristic: { kind: 'strength', add: 3 } },
          { role: 'attacker', phases: ['melee'], characteristic: { kind: 'attacks', add: 3 } },
        ],
      ],
    ])
  })
  it('recognizes a weapon grant to a whole unit while leading', () => {
    expect(
      effects('While this model is leading a unit, melee weapons equipped by that unit have the [SUSTAINED HITS 1] ability.', {
        scope: 'attached',
        models: 5,
      }),
    ).toEqual([[{ role: 'attacker', phases: ['melee'], keyword: 'SUSTAINED HITS 1' }]])
  })
  it('combines a save and FNP sharing the same subject', () => {
    expect(effects('The bearer has a Save characteristic of 2+ and the Feel No Pain 5+ ability.')).toEqual([
      [
        { role: 'defender', phases: ['ranged', 'melee'], save: 2 },
        { role: 'defender', phases: ['ranged', 'melee'], feelNoPain: 5 },
      ],
    ])
  })
  it('retains the restriction on abbreviated target bonuses', () => {
    expect(effects("Your unit's attacks that target a MONSTER/VEHICLE unit have +1 to wound rolls.")).toEqual([
      [{ role: 'attacker', phases: ['ranged', 'melee'], targetKeywords: ['MONSTER', 'VEHICLE'], options: { woundModifier: 1 } }],
    ])
  })
  it('compiles a comma-separated list of target keywords', () => {
    expect(
      effects(
        'Each time this model makes an attack that targets a CHARACTER, MONSTER or WALKER unit, you can re-roll the Hit roll and re-roll the Wound roll.',
      ),
    ).toEqual([
      [
        {
          role: 'attacker',
          phases: ['ranged', 'melee'],
          targetKeywords: ['CHARACTER', 'MONSTER', 'WALKER'],
          options: { hitReroll: 'failed' },
        },
        {
          role: 'attacker',
          phases: ['ranged', 'melee'],
          targetKeywords: ['CHARACTER', 'MONSTER', 'WALKER'],
          options: { woundReroll: 'failed' },
        },
      ],
    ])
  })
  it('keeps a friendly selected-to-shoot condition recipient-specific', () => {
    const description =
      "Friendly SCOUT units have Deep Strike. When a friendly SCOUT unit is selected to shoot, if that unit made an ingress move this turn, that unit's ranged attacks have +1 to hit rolls."
    expect([effects(description, { keywords: ['Scout'] }), effects(description, { keywords: ['Vehicle'] })]).toEqual([
      [[{ role: 'attacker', phases: ['ranged'], options: { hitModifier: 1 } }]],
      [],
    ])
  })
  it('compiles a named stance choice without combining alternatives', () => {
    expect(
      effects(
        'Each time a unit with this ability is selected to fight, select one of the stances below. Until that unit has finished making its attacks, the selected Stance is active for it and it gains the relevant ability.\n\n■ FIRST STANCE\nMelee weapons equipped by models in this unit have the [SUSTAINED HITS 1] ability.\n■ SECOND STANCE\nMelee weapons equipped by models in this unit have the [LETHAL HITS] ability.',
      ),
    ).toEqual([
      [{ role: 'attacker', phases: ['melee'], keyword: 'SUSTAINED HITS 1' }],
      [{ role: 'attacker', phases: ['melee'], keyword: 'LETHAL HITS' }],
    ])
  })
  it('keeps a selected weapon ability behind its ingress condition', () => {
    const buff = rule(
      "When this unit is selected to shoot, if this unit was set up using a portal this turn, this unit's ranged attacks have:\n- [Lethal Hits].\n- Or: [Sustained Hits 1].",
    )
    expect([combatRuleDefault(buff), combatRuleChoices(buff).map((choice) => choice.effects)]).toEqual([
      0,
      [
        [{ role: 'attacker', phases: ['ranged'], keyword: 'Lethal Hits' }],
        [{ role: 'attacker', phases: ['ranged'], keyword: 'Sustained Hits 1' }],
      ],
    ])
  })
  it('does not discard an unknown rider on a named alternative', () => {
    expect(
      effects(
        'Each time a unit with this ability is selected to fight, select one of the stances below. Until that unit has finished making its attacks, the selected Stance is active for it and it gains the relevant ability.\n\n■ FIRST STANCE\nMelee weapons equipped by models in this unit have the [LETHAL HITS] ability.\n■ SECOND STANCE\nInflict 3 mortal wounds.',
      ),
    ).toEqual([])
  })
  it('limits a selected friendly shooting buff to that phase', () => {
    expect(
      effects(
        'In your Shooting phase, select one friendly ARMY unit within 6" of this model. Until the end of the phase, each time a model in that unit makes an attack, add 1 to the Hit roll.',
        { keywords: ['Army'], scope: 'nearby' },
      ),
    ).toEqual([[{ role: 'attacker', phases: ['ranged'], options: { hitModifier: 1 } }]])
  })
  it('limits a once-per-battle fight activation to melee', () => {
    expect(
      effects(
        'Once per battle, at the start of the Fight phase, this model can use this ability. If it does, until the end of the phase, each time this model makes an attack, add 1 to the Hit roll.',
      ),
    ).toEqual([[{ role: 'attacker', phases: ['melee'], options: { hitModifier: 1 } }]])
  })
  it('does not apply a scoped damage reduction globally', () => {
    expect(
      effects(
        'While an enemy unit (excluding VEHICLES) is within 6" of this model, each time an attack targets this unit, subtract 1 from the Damage characteristic of that attack.',
      ),
    ).toEqual([])
  })
  it('keeps a declared battlefield region as an explicit reroll condition', () => {
    expect(
      effects(
        "Certain areas of the battlefield are considered to be within your army's Defence Network, as follows: ■ Your deployment zone is always within your army's Defence Network. ■ At the start of any phase, if you control at least half of the objective markers within No Man's Land, until the end of that phase, No Man's Land is within your army's Defence Network. Each time a model in a SOLDIER unit from your army makes an attack, re-roll a Hit roll of 1. If such a unit is wholly within your army's Defence Network, you can re-roll the Hit roll instead.",
        { keywords: ['Soldier'] },
      ),
    ).toEqual([
      [{ role: 'attacker', phases: ['ranged', 'melee'], options: { hitReroll: 'ones' } }],
      [{ role: 'attacker', phases: ['ranged', 'melee'], options: { hitReroll: 'failed' } }],
    ])
  })
  it('does not hide FNP when the same rule already changed the armour save', () => {
    expect(
      effects('The bearer has a Save characteristic of 2+. The bearer has the Feel No Pain 5+ ability.', { appliedDefences: ['save'] }),
    ).toEqual([[{ role: 'defender', phases: ['ranged', 'melee'], feelNoPain: 5 }]])
  })
  it('does not activate a conditional bonus after removing an applied defence', () => {
    const buff = rule(
      'The bearer has a Save characteristic of 2+. While this unit is on the battlefield, the bearer has the Feel No Pain 5+ ability.',
      { appliedDefences: ['save'] },
    )
    expect(combatRuleChoices(buff)[combatRuleDefault(buff) - 1]?.effects).toEqual([])
  })
  it('interprets selected weapon ability alternatives with recipient keywords', () => {
    expect(
      combatRuleChoices(
        rule(
          'In your Shooting phase, each time a SCIENTIST unit from your army is selected to shoot, select one of the following abilities: [ANTI-INFANTRY 3+], [HEAVY], [IGNORES COVER]. Until the end of the phase, ranged weapons equipped by models in that unit have that ability.',
          { keywords: ['Scientist'] },
        ),
      ).map((choice) => choice.effects),
    ).toEqual([
      [{ role: 'attacker', phases: ['ranged'], keyword: 'ANTI-INFANTRY 3+' }],
      [{ role: 'attacker', phases: ['ranged'], keyword: 'HEAVY' }],
      [{ role: 'attacker', phases: ['ranged'], keyword: 'IGNORES COVER' }],
    ])
  })
  it('supports ignore-modifier lists and a recipient-restricted extra effect', () => {
    expect(
      effects(
        "Each time a model in your unit makes an attack, you can ignore any or all modifiers to the following: that attack's Ballistic Skill or Weapon Skill characteristic; the Hit roll. If your unit has the SCIENTIST keyword, you can also ignore any or all modifiers to the Wound roll.",
        { keywords: ['Scientist'] },
      ),
    ).toEqual([
      [
        { role: 'attacker', phases: ['ranged', 'melee'], ignoreSkillModifiers: true, ignoreHitModifiers: true },
        { role: 'attacker', phases: ['ranged', 'melee'], ignoreWoundModifiers: true },
      ],
    ])
  })
  it('keeps an enemy aura debuff on the defending side', () => {
    expect(
      effects(
        'While an enemy unit is within 6" of this model, each time a model in that unit makes a melee attack, subtract 1 from the Hit roll.',
      ),
    ).toEqual([[{ role: 'defender', phases: ['melee'], options: { hitModifier: -1 } }]])
  })
  it('compiles army keyword restrictions without enabling them for other units', () => {
    expect(
      effects('Each time a SOLDIER or SCIENTIST unit from your army makes an attack, add 1 to the Wound roll.', { keywords: ['Vehicle'] }),
    ).toEqual([])
  })
  it('supports a save and a movement characteristic without losing the save', () => {
    expect(effects('The bearer has a Save characteristic of 3+ and a Move characteristic of 8".')).toEqual([
      [{ role: 'defender', phases: ['ranged', 'melee'], save: 3 }],
    ])
  })
  it('keeps separate attack and defence modifiers on their own sides', () => {
    expect(
      effects(
        'Each time an attack targets this unit, subtract 1 from the Hit roll. Each time this model makes a melee attack, add 1 to the Hit roll.',
      ),
    ).toEqual([
      [
        { role: 'defender', phases: ['ranged', 'melee'], options: { hitModifier: -1 } },
        { role: 'attacker', phases: ['melee'], options: { hitModifier: 1 } },
      ],
    ])
  })
  it('combines hit and wound rerolls under the same attack scope', () => {
    expect(
      effects('Each time this model makes a ranged attack, you can re-roll the Hit roll and you can re-roll a Wound roll of 1.'),
    ).toEqual([
      [
        { role: 'attacker', phases: ['ranged'], options: { hitReroll: 'failed' } },
        { role: 'attacker', phases: ['ranged'], options: { woundReroll: 'ones' } },
      ],
    ])
  })
  it('grants multiple weapon abilities without adding movement-only abilities', () => {
    expect(
      effects('Ranged weapons equipped by models in this unit have the [LETHAL HITS], [SUSTAINED HITS 1] and [ASSAULT] abilities.'),
    ).toEqual([
      [
        { role: 'attacker', phases: ['ranged'], keyword: 'LETHAL HITS' },
        { role: 'attacker', phases: ['ranged'], keyword: 'SUSTAINED HITS 1' },
      ],
    ])
  })
  it('replaces an unconditional FNP with its conditional upgrade', () => {
    expect(
      effects(
        'This model has the Feel No Pain 5+ ability. While this model is within range of an objective marker, this model has the Feel No Pain 4+ ability instead.',
      ),
    ).toEqual([
      [{ role: 'defender', phases: ['ranged', 'melee'], feelNoPain: 5 }],
      [{ role: 'defender', phases: ['ranged', 'melee'], feelNoPain: 4 }],
    ])
  })
  it('keeps conditional upgrades off by default', () => {
    expect(
      combatRuleDefault(
        rule('While this unit is Below Half-strength, each time a model in this unit makes an attack, add 1 to the Wound roll.'),
      ),
    ).toBe(0)
  })
  it('selects mutually exclusive attack and defence stances', () => {
    expect(
      effects(
        'At the start of the Fight phase, select one of the following: ■ Each time this model makes an attack, add 1 to the Hit roll. ■ Each time an attack targets this unit, subtract 1 from the Hit roll.',
      ),
    ).toEqual([
      [{ role: 'attacker', phases: ['melee'], options: { hitModifier: 1 } }],
      [{ role: 'defender', phases: ['melee'], options: { hitModifier: -1 } }],
    ])
  })
  it('requires every recipient keyword and honors exclusions', () => {
    expect(
      effects(
        'While a friendly ARMY INFANTRY unit (excluding SCOUTS) is within 6" of this model, each time a model in that unit makes an attack, re-roll a Hit roll of 1.',
        { scope: 'nearby', keywords: ['Army', 'Infantry', 'Scouts'] },
      ),
    ).toEqual([])
  })
  it('allows either eligible recipient with an explicit range condition', () => {
    expect(
      combatRuleChoices(
        rule(
          'While a friendly ARMY INFANTRY or ARMY MOUNTED unit is within 6" of this model, each time a model in that unit makes an attack, re-roll a Hit roll of 1.',
          { scope: 'nearby', keywords: ['Army', 'Mounted'] },
        ),
      ),
    ).toEqual([{ label: 'Within 6"', effects: [{ role: 'attacker', phases: ['ranged', 'melee'], options: { hitReroll: 'ones' } }] }])
  })
  it('preserves named weapons and target keywords for per-weapon resolution', () => {
    expect(
      effects('Each time this model makes a ranged attack with its rifle that targets a VEHICLE unit, add 1 to the Wound roll.'),
    ).toEqual([[{ role: 'attacker', phases: ['ranged'], weapon: 'rifle', targetKeywords: ['VEHICLE'], options: { woundModifier: 1 } }]])
  })
  it('compiles successful critical hit wording separately from automatic critical hits', () => {
    expect(effects('Each time this model makes an attack, a successful unmodified Hit roll of 5+ scores a Critical Hit.')).toEqual([
      [{ role: 'attacker', phases: ['ranged', 'melee'], criticalHit: 5, criticalHitRequiresSuccess: true }],
    ])
  })
  it('evaluates strength-dependent wound penalties per attack', () => {
    expect(
      effects(
        'Each time an attack targets this unit, if the Strength characteristic of that attack is greater than the Toughness characteristic of this unit, subtract 1 from the Wound roll.',
      ),
    ).toEqual([[{ role: 'defender', phases: ['ranged', 'melee'], condition: 'stronger', options: { woundModifier: -1 } }]])
  })
  it('supports armour penetration only on critical wounds', () => {
    expect(
      effects(
        'Each time this model makes an attack, on a Critical Wound, improve the Armour Penetration characteristic of that attack by 1.',
      ),
    ).toEqual([
      [
        {
          role: 'attacker',
          phases: ['ranged', 'melee'],
          condition: 'critical-wound',
          characteristic: { kind: 'armour-penetration', add: -1 },
        },
      ],
    ])
  })
  it('does not turn an unknown dice condition into a manual buff', () => {
    expect(effects('Each time this model makes an attack, if the unmodified Hit roll is 4, add 1 to the Wound roll.')).toEqual([])
  })
  it('refuses a supported effect followed by an unsupported effect', () => {
    expect(
      effects(
        'This model has a 4+ invulnerable save. Each time this model is destroyed, return it to the battlefield with D3 wounds remaining.',
      ),
    ).toEqual([])
  })
  it('filters a movement-only weapon grant out of both combat roles', () => {
    const buff = rule('Ranged weapons equipped by models in this unit have the [ASSAULT] ability.')
    expect(['attacker', 'defender'].map((role) => combatRuleAppliesTo(buff, role as 'attacker' | 'defender'))).toEqual([false, false])
  })
  it('fails closed for unsupported conditional defence mechanics', () => {
    expect(
      compileCombatRule(
        rule(
          'Each time an attack targets this unit, if the Strength characteristic of that attack is greater than the Toughness characteristic of this unit, halve the Damage characteristic of that attack.',
        ),
      ),
    ).toBeNull()
  })
})
